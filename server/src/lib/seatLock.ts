import { redis } from "./redis";

export const SEAT_LOCK_TTL_SECONDS = 600; // 10 minutes

/** Single source of truth for the key format. Day 3's seat-status endpoint reads this same pattern. */
export function seatLockKey(scheduleId: string, seatId: string): string {
    return `seat:${scheduleId}:${seatId}`;
}

/**
 * Tries to lock every seat for this user, all-or-nothing.
 *
 * WHY a Redis key with a TTL beats a `locked_at` column in Postgres:
 *  1. Atomic: `SET key value EX 600 NX` checks "is it free?", writes the owner,
 *     and starts the expiry clock in ONE command. With a DB column you need
 *     read-then-write (race window) or a transaction with row locks.
 *  2. Self-cleaning: Redis deletes the key when the TTL hits zero. A DB column
 *     leaves stale locks behind until a cron job sweeps them, and any bug or
 *     downtime in that job means seats stay stuck "locked" forever.
 *  3. Fast and disposable: lock state is temporary by nature, so it doesn't
 *     belong in the permanent relational data or its backups.
 */
export async function acquireSeatLocks(
    scheduleId: string,
    seatIds: string[],
    userId: string
): Promise<{ ok: true } | { ok: false; conflictSeatId: string }> {
    const newlyCreatedKeys: string[] = []; // only these get rolled back on failure

    for(const seatId of seatIds) {
        const key = seatLockKey(scheduleId, seatId);

        const result = await redis.set(key, userId, "EX", SEAT_LOCK_TTL_SECONDS, "NX");
        if(result === "OK") {
            newlyCreatedKeys.push(key);
            continue;
        }

        // Key already exists. If it's already ours (user re-clicked), refresh the timer.
        const holder = await redis.get(key);
        if(holder === userId) {
            await redis.expire(key, SEAT_LOCK_TTL_SECONDS);
            continue;
        }

        // Someone else holds it. Undo the seats we just took in this request.
        if(newlyCreatedKeys.length > 0) {
            await redis.del(...newlyCreatedKeys);
        }
        return { ok: false, conflictSeatId: seatId };
    }
    return { ok: true };
}

// Compare-and-delete in ONE atomic step. A separate GET then DEL would let the
// lock expire and be re-taken by someone else in between, and we'd delete theirs.
const RELEASE_IF_OWNER = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
else  
    return 0
end`;

/** Releases only the seats this user actually holds. */
export async function releaseSeatLocks(
    scheduleId: string,
    seatIds: string[],
    userId: string
): Promise<{ released: string[], skipped: string[] }> {
    const released: string[] = [];
    const skipped: string[] = [];

    for(const seatId of seatIds) {
        const deleted = await redis.eval(
            RELEASE_IF_OWNER,
            1,
            seatLockKey(scheduleId, seatId),
            userId
        );
        if(deleted === 1) released.push(seatId);
        else skipped.push(seatId);
    }

    return { released, skipped };
}

/** Used by Day 5's create-order: are all these seats still held by this user? */
export async function verifySeatLocksHeld(
    scheduleId: string,
    seatIds: string[],
    userId: string
): Promise<boolean> {
    if(seatIds.length === 0) return false;
    const values = await redis.mget(...seatIds.map((id) => seatLockKey(scheduleId, id)));
    return values.every((holder) => holder === userId);
}