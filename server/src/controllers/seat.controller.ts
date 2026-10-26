import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
    SEAT_LOCK_TTL_SECONDS,
    acquireSeatLocks,
    releaseSeatLocks,
} from "../lib/seatLock";

const MAX_SEATS_PER_BOOKING = 6;

const lockSchema = z.object({
    scheduleId: z.string().uuid("Invalid scheduleId"),
    seatIds: z
        .array(z.string().uuid("Invalid seatId"))
        .min(1, "Select at least one seat")
        .max(MAX_SEATS_PER_BOOKING, `You can lock at most ${MAX_SEATS_PER_BOOKING} seats at once`),
});

const unlockSchema = z.object({
    scheduleId: z.string().uuid("Invalid scheduleId"),
    seatIds: z.array(z.string().uuid("Invalid seatId")).min(1, "Select at least one seat"),
});

/** POST /api/seats/lock */
export async function lockSeats(req: Request, res: Response) {
    if(!req.user) {
        return res.status(401).json({ error: "Authentication required" });
    }

    const { scheduleId, seatIds: rawSeatIds } = lockSchema.parse(req.body);
    const seatIds = [...new Set(rawSeatIds)]; // ignore accidental duplicates

    const schedule = await prisma.schedule.findUnique({
        where: { id: scheduleId },
        select: { busId: true, departureTime: true },
    });
    if(!schedule) {
        return res.status(404).json({ error: "Schedule not found" });
    }
    if(schedule.departureTime <= new Date()) {
        return res.status(400).json({ error: "This bus has already departed" });
    }

    // Every seat must physically belong to this schedule's bus
    const seats = await prisma.seat.findMany({
        where: { id: { in: seatIds }, busId: schedule.busId },
        select: { id: true, seatNumber: true },
    });
    if(seats.length !== seatIds.length) {
        return res.status(400).json({ error: "One or more seats do not belong to this bus" });
    }

    // Already permanently booked? Redis doesn't know about those, Postgres does.
    const booked = await prisma.bookingItem.findMany({
        where: {
            seatId: { in: seatIds },
            booking: { 
                scheduleId, 
                status: { not: "CANCELLED" } },
        },
        select: { seat: { select: { seatNumber: true } } },
    });
    if(booked.length > 0) {
        const names = booked.map((b) => b.seat.seatNumber).join(", ");
        return res.status(409).json({ error: `Seat already booked: ${names}` });
    }

    const result = await acquireSeatLocks(scheduleId, seatIds, req.user.id);
    if(!result.ok) {
        const seat = seats.find((s) => s.id === result.conflictSeatId);
        return res.status(409).json({
            error: `Seat ${seat?.seatNumber ?? ""} is currently held by another user`.replace(" "," "),
        });
    }

    return res.status(200).json({
        scheduleId,
        lockedSeatIds: seatIds,
        expiresInSeconds: SEAT_LOCK_TTL_SECONDS,
    });
}

/** POST /api/seats/unlock */
export async function unlockSeats(req: Request, res: Response) {
    if(!req.user) {
        return res.status(401).json({ error: "Authentication required" });
    }

    const { scheduleId, seatIds: rawSeatIds } = unlockSchema.parse(req.body);
    const seatIds = [...new Set(rawSeatIds)];

    const { released, skipped } = await releaseSeatLocks(scheduleId, seatIds, req.user.id);

    return res.status(200).json({
        scheduleId,
        unlockedSeatIds: released,
        skippedSeatIds: skipped,
    });
}