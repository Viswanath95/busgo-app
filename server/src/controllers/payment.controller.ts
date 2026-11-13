import type { Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { razorpay, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } from "../lib/razorpay";
import { extendSeatLocks, releaseSeatLocks, verifySeatLocksHeld } from "../lib/seatLock";
import { Prisma } from "../generated/prisma/client";

const PAYMENT_WINDOW_SECONDS = 15 * 60; // seat locks are extended to this at create-order
const ORDER_CONTEXT_TTL_SECONDS = 30 * 60;

const orderKey = (orderId: string) => `order: ${orderId}`;

interface OrderContext {
    userId: string;
    scheduleId: string;
    passengers: { seatId: string, passengerName: string}[],
    farePerSeat: string; // Decimal as string, e.g. "1200.00"
    totalFare: string;
}

const createOrderSchema = z.object({
    scheduleId: z.string().min(1),
    passengers: z
        .array(z.object({ seatId: z.string().min(1), passengerName: z.string().trim().min(1).max(60) }))
        .min(1)
        .max(6),
});

const verifySchema = z.object({
    razorpay_order_id: z.string().min(1),
    razorpay_payment_id: z.string().min(1),
    razorpay_signature: z.string().min(1),
});

// POST /api/payments/create-order
export async function createOrder(req: Request, res: Response) {
    const userId = req.user!.id;
    const { scheduleId, passengers } = createOrderSchema.parse(req.body);
    const seatIds = passengers.map((p) => p.seatId);

    if(new Set(seatIds).size !== seatIds.length) {
        return res.status(400).json({ message: "Duplicate seats in request" });
    }

    const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } });
    if(!schedule) return res.status(404).json({ message: "Schedule not found" });

    // every seat must belong to this schedule's bus
    const seats = await prisma.seat.findMany({ where: { id: { in: seatIds}, busId: schedule.busId} });
    if(seats.length !== seatIds.length) {
        return res.status(400).json({ message: "One or more seats do not belong to this bus" });
    }

    // already sold?
    const sold = await prisma.bookingItem.findFirst({ where: { scheduleId, seatId: { in: seatIds } } });
    if(sold) return res.status(409).json({ message: "A selected seat is already booked" });

    // do we still hold the Redis locks?
    if(!(await verifySeatLocksHeld(scheduleId, seatIds, userId))) {
        return res.status(409).json({ message: "Seat lock expired. Please select seats again." });
    }

    // give the user time to pay
    if(!(await extendSeatLocks(scheduleId, seatIds, userId, PAYMENT_WINDOW_SECONDS))) {
        return res.status(409).json({ message: "Seat lock expired. Please select seats again."  });
    }

    // money: server decides the price, never the client
    const farePerSeat = schedule.baseFare;
    const totalFare = farePerSeat.mul(passengers.length);
    const amountInPaise = totalFare.mul(100).toDecimalPlaces(0).toNumber();

    let order;
        try {
        order = await razorpay.orders.create({
            amount: amountInPaise,
            currency: "INR",
            receipt: `bg_${Date.now()}`,
            notes: { userId, scheduleId },
        });
        } catch (e) {
        return res.status(502).json({ message: "Payment provider error" });
        }

    const context: OrderContext = {
        userId,
        scheduleId,
        passengers,
        farePerSeat: farePerSeat.toFixed(2),
        totalFare: totalFare.toFixed(2),
    };
    await redis.set(orderKey(order.id), JSON.stringify(context), "EX", ORDER_CONTEXT_TTL_SECONDS);

    res.status(201).json({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: RAZORPAY_KEY_ID, // public key, safe to send to the browser
        expiresInSeconds: PAYMENT_WINDOW_SECONDS,
    });
}

function signatureIsValid(orderId: string, paymentId: string, signature: string): boolean {
    const expected = crypto
        .createHmac("sha256", RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// POST /api/payments/verify
export async function verifyPayment(req: Request, res: Response) {
    const userId = req.user!.id;
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = verifySchema.parse(req.body);

    // 1. Is this really from Razorpay?
    if(!signatureIsValid(orderId, paymentId, signature)) {
        return res.status(400).json({ message: "Invalid payment signature" });
    }

    // 2. Idempotency: user double-clicked / retried -> return the same booking
    const existing = await prisma.booking.findFirst({ where: { razorpayOrderId: orderId} });
    if(existing) {
        return res.json({ bookingId: existing.id, pnr: existing.pnr });
    }

    // 3. What was this order for?
    const raw = await redis.get(orderKey(orderId));
    if(!raw) return res.status(410).json({ message: "Order expired. If money was debited it will be refunded." });
    const ctx = JSON.parse(raw) as OrderContext;
    if(ctx.userId !== userId) return res.status(403).json({ message: "This order belongs to another user" });

    const seatIds = ctx.passengers.map((p) => p.seatId);

    // 4. ATOMIC WRITE: Booking + all BookingItems, or nothing
    try {
        const booking = await prisma.$transaction(async (tx) => {
            const created = await tx.booking.create({
                data: {
                    userId,
                    scheduleId: ctx.scheduleId,
                    totalFare: ctx.totalFare,
                    razorpayOrderId: orderId,
                    razorpayPayId: paymentId,
                },
            });

            await tx.bookingItem.createMany({
                data: ctx.passengers.map((p) => ({
                    bookingId: created.id,
                    scheduleId: ctx.scheduleId,
                    seatId: p.seatId,
                    passengerName: p.passengerName,
                    fare: ctx.farePerSeat,
                })),
            });

            return created;
        });

        // 5. Only AFTER the DB commit: free Redis
        await releaseSeatLocks(ctx.scheduleId, seatIds, userId);
        await redis.del(orderKey(orderId));

        return res.status(201).json({ bookingId: booking.id, pnr: booking.pnr });
    } catch(err) {
        if(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
            // Either a parallel verify call won, or someone else got the seat
            const winner = await prisma.booking.findFirst({ where: { razorpayOrderId: orderId } });
            if(winner) return res.json({ bookingId: winner.id, pnr: winner.pnr });

            // Seat was taken -> user paid but cannot get the seat: refund (best effort)
            try {
                await razorpay.payments.refund(paymentId, {});
            }catch (refundErr) {
                console.error("REFUND FAILED - handle manually", paymentId, refundErr);
            }
            return res.status(409).json({ message: "Seat was just booked by someone else. Your payment will be refunded." });
        }
        throw err;
    }
}