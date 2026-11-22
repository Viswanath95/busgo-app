import type { Request, Response } from "express";
import path from "path";
import { prisma } from "../lib/prisma";

async function loadOwnedBooking(req: Request, res: Response) {
    const id = req.params.id as string;
    const booking = await prisma.booking.findUnique({
        where: { id },
        select: { id: true, pnr: true, userId: true, ticketUrl: true},
    });
    if(!booking) {
        res.status(404).json({ message: "Booking not found" });
        return null;
    }
    if(booking.userId !== req.user!.id && req.user!.role! !== "ADMIN") {
        res.status(403).json({ message: "This booking belongs to another user" });
        return null;
    }
    return booking;
}

// GET /api/bookings/:id/ticket
export async function getTicket(req: Request, res: Response) {
    const booking = await loadOwnedBooking(req, res);
    if(!booking) return;

    if(!booking.ticketUrl) {
        return res.status(202).json({ status: "processing", message: "Your ticket is being generated. Try again in a few seconds." });
    }
    res.json({ status: "ready", downloadUrl: `/api/bookings/${booking.id}/ticket/file` });
}

// GET /api/bookings/:id/ticket/file
export async function downloadTicket(req: Request, res: Response) {
    const booking = await loadOwnedBooking(req, res);
    if(!booking) return;

    if(!booking.ticketUrl) {
        return res.status(404).json({ message: "Ticket not generated yet" });
    }
    res.download(path.resolve(process.cwd(), booking.ticketUrl), `BusGo-${booking.pnr}.pdf`);
}