export type BusType = "SEATER" | "SLEEPER" | "AC_SLEEPER";
export type Deck = "LOWER" | "UPPER";

export interface ScheduleSearchResult {
    id: string;
    departureTime: string;
    arrivalTime: string;
    baseFare: number;
    route: { id: string; from: string; to: string; distanceKm: number };
    bus: { id: string, name: string, type: BusType; totalSeats: number };
}

export type SeatStatusValue = "available" | "booked" | "locked";

export interface SeatStatus {
    seatId: string;
    seatNumber: string;
    deck: Deck;
    status: SeatStatusValue;
    lockedByYou?: boolean;
}
export interface LockSeatsRequest {
    scheduleId: string;
    seatIds: string[];
}

export interface LockSeatsResponse {
    scheduleId: string;
    lockedSeatIds: string[];
    expiresInSeconds: number;
}

export interface UnlockSeatsResponse {
    scheduleId: string;
    unlockedSeatIds: string[];
    skippedSeatIds: string[]; // seats that weren't locked by you, left untouched
}