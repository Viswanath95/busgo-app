import { boss } from "./boss";

export const TICKET_QUEUE = "ticket-generation";
export const RETRY_DELAY_SECONDS = 10;

export interface TicketJobData {
    bookingId: string;
}

let ready: Promise<void> | null = null;

// Starts pg-boss (creates/updates its tables) and registers the queue. Safe to call many times.
export function startBoss(): Promise<void> {
    if(!ready) {
        ready = (async () => {
            await boss.start();
            await boss.createQueue(TICKET_QUEUE, {
                retryLimit: 3,
                retryDelay: RETRY_DELAY_SECONDS,
                retryBackoff: false,              // fixed delay, so we know exactly when to wake the worker
                expireInSeconds: 120,             // an "active" job older than 2 min is treated as failed
                deleteAfterSeconds: 24 * 60 * 60, // remove finished jobs after a day
            });
            await boss.supervise(TICKET_QUEUE);   // one maintenance pass per server start
        })();
    }
    return ready;
}

// --- waking the worker -------------------------------------------------------------------
// The worker only polls the database every few minutes (so Neon can sleep). Because the API
// and the worker run in the same process, we wake the worker ourselves the moment a job exists.(job here: bookingId)
let workerId: string | null = null;

export function registerTicketWorker(id: string) {
    workerId = id;
}

export function wakeTicketWorker() {
    if(workerId) boss.notifyWorker(workerId);
}

export async function enqueueTicket(bookingId: string): Promise<string | null> {
    await startBoss();
    // id = bookingId (both are UUIDs): a second job for the same booking is ignored (returns null)
    const jobId = await boss.send(TICKET_QUEUE, { bookingId } satisfies TicketJobData, { id: bookingId });
    if(jobId) wakeTicketWorker();
    return jobId;
}