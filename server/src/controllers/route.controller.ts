import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";

const searchQuerySchema = z.object({
    from: z.string().min(1, "from is required"),
    to: z.string().min(1, "to is required"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
    time: z.enum(["morning","afternoon","night"]).optional(),
});

const TIME_RANGES : Record<"morning" | "afternoon" | "night", [number,number]> = {
    morning: [5,11],
    afternoon: [12,17],
    night: [18,23],
}

/** GET /api/routes/search?from=&to=&date=&time= */
export async function searchSchedules(req: Request, res: Response) {
    const { from, to, date, time } = searchQuerySchema.parse(req.query);

    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(`${date}T23:59:59`);

    const schedules = await prisma.schedule.findMany({
        where: {
            route : {
                from: { equals: from, mode: "insensitive" },
                to: { equals: to, mode: "insensitive" },
            },
            departureTime: { gte: dayStart, lte: dayEnd },
        },
        include: { route: true, bus: true},
        orderBy: { departureTime: "asc" },
    });

    const filtered = time
        ? schedules.filter((s) => {
            const hour = s.departureTime.getHours();
            const [start, end] = TIME_RANGES[time];
            return hour >= start && hour <= end;
        })
        : schedules;

    const results = filtered.map((s) => ({
        id: s.id,
        departureTime: s.departureTime,
        arrivalTime: s.arrivalTime,
        baseFare: Number(s.baseFare), // Prisma Decimal -> plain number for clean JSON
        route: {
            id: s.route.id,
            from: s.route.from,
            to: s.route.to,
            distanceKm: s.route.distanceKm,
        },
        bus: {
            id: s.bus.id,
            name: s.bus.name,
            type: s.bus.type,
            totalSeats: s.bus.totalSeats,
        },
    }));

    return res.status(200).json({ results, count: results.length });
}