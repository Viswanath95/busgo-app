import fs from "fs/promises";
import path from "path";
import { prisma } from "../lib/prisma";
import { boss } from "../lib/boss";
import {
    startBoss,
    registerTicketWorker,
    wakeTicketWorker,
    TICKET_QUEUE,
    RETRY_DELAY_SECONDS,
    type TicketJobData,
} from "../lib/ticketQueue";
import { buildTicketPdf } from "../lib/ticketPdf";
import { sendTicketEmail } from "../lib/mailer";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

// Safety-net poll. Keep it ABOVE Neon's 5-minute autosuspend, otherwise polling alone
// would keep the free database awake. New jobs don't wait for it: enqueueTicket() wakes the worker.
const IDLE_POLL_SECONDS = 600;

async function processTicket(bookingId: string) {
    const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
            user: true,
            items: { include: { seat: true} },
            schedule: { include: { route: true, bus: true} },
        },
    });
    if(!booking) throw new Error(`Booking ${bookingId} not found`);

    const items = [...booking.items].sort((a, b) => 
        a.seat.seatNumber.localeCompare(b.seat.seatNumber, undefined, { numeric: true })
    );

    const pdf = await buildTicketPdf({
        bookingId: booking.id,
        pnr: booking.pnr,
        bookedBy: booking.user.name,
        busName: booking.schedule.bus.name,
        busType: booking.schedule.bus.type,
        from: booking.schedule.route.from,
        to: booking.schedule.route.to,
        departureTime: booking.schedule.departureTime,
        arrivalTime: booking.schedule.arrivalTime,
        totalFare: booking.totalFare.toFixed(2),
        passengers: items.map((i) => ({
            seatNumber: i.seat.seatNumber,
            passengerName: i.passengerName,
            fare: i.fare.toFixed(2),
        })),
    });

    // Local storage for dev. For production, this is where an upload to Cloudflare R2 would go.
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, `${booking.id}.pdf`), pdf);
    await prisma.booking.update({
        where: { id: booking.id },
        data: { ticketUrl: `uploads/${booking.id}.pdf`},
    });

    const emailed = await sendTicketEmail({
        to: booking.user.email,
        subject: `Your BusGo ticket - PNR ${booking.pnr}`,
        text: `Hi,\n\n Your booking is confirmed. Your e-ticket is attached.\n\n PNR: ${booking.pnr}\n\nHappy journey!\nBusGo`,
        filename: `BusGo-${booking.pnr}.pdf`,
        pdf,
    });
    
    console.log(`Ticket ready for booking ${booking.id} (${emailed ? "emailed" : "email skipped"})`);
}

export async function startTicketWorker() {
    await startBoss();

    const workerId = await boss.work<TicketJobData>(
        TICKET_QUEUE,
        { pollingIntervalSeconds: IDLE_POLL_SECONDS, localConcurrency: 1 },
        async (jobs) => {
            try {
                for(const job of jobs) await processTicket(job.data.bookingId);
            }catch (err) {
                console.error("Ticket job failed, will retry:", err instanceof Error ? err.message : err);
                // pg-boss reschedules the job for later; wake the worker right after that moment
                setTimeout(wakeTicketWorker, (RETRY_DELAY_SECONDS + 1) * 1000);
                throw err; // throwing is what tells pg-boss the job failed
            }
        }
    );

    registerTicketWorker(workerId);
    console.log("Ticket worker started");
}