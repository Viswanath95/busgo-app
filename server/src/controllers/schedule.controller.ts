import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";

/** GET /api/schedules/:id/seats */
export async function getSeatStatus(req: Request, res: Response) {
    const { id } = req.params;

    if(!id || Array.isArray(id)) {
        return res.status(400).json({ error: "Invalid schedule ID" });
    }

    const scheduleId = id;

    const schedule = await prisma.schedule.findUnique({
        where: { id: scheduleId },
        select: { id: true, busId: true },
    });

    if(!schedule) {
        return res.status(404).json({ error: "Schedule not found" });
    }

    // All physical seats on this bus
    const seats = await prisma.seat.findMany({
        where: { busId: schedule.busId },
        orderBy: { seatNumber: "asc" },
    });

    // Seats already booked for THIS schedule (ignore cancelled bookings —
    // a cancelled booking frees the seat back up)
    const bookedItems = await prisma.bookingItem.findMany({
        where: {
            booking: { 
                scheduleId,
                status: { not: "CANCELLED", },
            },
        },
        select: { seatId: true },
    });
    const bookedSeatIds = new Set(bookedItems.map((b) => b.seatId));

    // Seats currently held in Redis (temporary lock, auto-expires via TTL —
    // this stays empty until Day 4's lock endpoint exists)
    const lockKeys = await redis.keys(`seat:${scheduleId}*`);
    const lockedMap = new Map<string,string>(); //seatId -> userId holding the lock

    if(lockKeys.length > 0) {
        const values = await redis.mget(...lockKeys);
        lockKeys.forEach((key, i) => {
            const seatId = key.split(":")[2];
            const heldBy = values[i];
            if(seatId && heldBy) lockedMap.set(seatId, heldBy);
        });
    }

    const seatStatuses = seats.map((seat) => {
        let status: "booked" | "locked" | "available" = "available";

        if(bookedSeatIds.has(seat.id)) {
            status = "booked";
        }else if(lockedMap.has(seat.id)) {
            status = "locked";
        }

        const lockedBy = lockedMap.get(seat.id);

        return {
            seatId: seat.id,
            seatNumber: seat.seatNumber,
            deck: seat.deck,
            status,
            ...(lockedBy ? { lockedByYou: lockedBy === req.user?.id, } : {}),
        };
    });
        
        return res.status(200).json({ scheduleId, seats: seatStatuses, count: seats.length });
}