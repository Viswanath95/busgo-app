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