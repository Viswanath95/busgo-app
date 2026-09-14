import { PrismaClient, BusType, Deck } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

type RouteSeed = { from: string; to: string; distanceKm: number};

const ROUTES: RouteSeed[] = [
    { from: "Chennai", to: "Bangalore", distanceKm: 350 },
    { from: "Bangalore", to: "Hyderabad", distanceKm: 570 },
    { from: "Hyderabad", to: "Chennai", distanceKm: 625 },
];

const AVG_SPEED_KMH = 50;
const DAYS_OF_SCHEDULES = 7;

const FARE_PER_KM: Record<BusType, number> = {
    SEATER: 0.9,
    SLEEPER: 1.2,
    AC_SLEEPER: 1.6,
};

const DEPARTURE_HOUR: Record<BusType, number> = {
    SEATER: 9,
    SLEEPER: 21,
    AC_SLEEPER: 22,
};

const SEAT_ROWS = ["A", "B", "C", "D", "E", "F", "G", "H"]; // 8 rows
const SEAT_COLS = [1, 2, 3, 4, 5]; // 5 seats per row = 40 seats/bus

async function clearExistingDemoData() {
    await prisma.bookingItem.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.schedule.deleteMany();
    await prisma.seat.deleteMany();
    await prisma.bus.deleteMany();
    await prisma.route.deleteMany();
}

async function main() {
    console.log("Clearing existing route/bus/schedule data...");
    await clearExistingDemoData();

    for(const routeData of ROUTES) {
        const route = await prisma.route.create({ data: routeData });
        console.log(`Route created: ${route.from} -> ${route.to} (${route.distanceKm}km)`);

        const busTypesForThisRoute: BusType[] = ["SLEEPER", "AC_SLEEPER"];

        for(const type of busTypesForThisRoute) {
            const bus = await prisma.bus.create({
                data: {
                    name: `${route.from.slice(0, 3).toUpperCase()} - ${route.to.slice(0, 3).toUpperCase()} ${type.replace("_", "")}`,
                    type,
                    totalSeats: SEAT_ROWS.length * SEAT_COLS.length,
                },
            });

            const seatRows = SEAT_ROWS.flatMap((row, rowIndex) => SEAT_COLS.map((col) => ({
                busId: bus.id,
                seatNumber: `${row}${col}`,
                deck: rowIndex < 4 ? Deck.LOWER : Deck.UPPER,
            }))
        );
            await prisma.seat.createMany({ data: seatRows });

            const durationHours = routeData.distanceKm / AVG_SPEED_KMH;
            const baseFare = Math.round(routeData.distanceKm * FARE_PER_KM[type]);
            const departureHour = DEPARTURE_HOUR[type];

            for(let dayOffset = 0; dayOffset < DAYS_OF_SCHEDULES; dayOffset++) {
                const departureTime = new Date();
                departureTime.setDate(departureTime.getDate() + dayOffset);
                departureTime.setHours(departureHour, 30, 0, 0);

                const arrivalTime = new Date(
                    departureTime.getTime() + durationHours * 60 * 60 * 1000
                );

                await prisma.schedule.create({
                    data: {
                        routeId: route.id,
                        busId: bus.id,
                        departureTime,
                        arrivalTime,
                        baseFare,
                    },
                });
            }

            console.log(
                ` Bus "${bus.name}": 40 seats created, ${DAYS_OF_SCHEDULES} schedules created (fare ~₹${baseFare})`
            );
        }
    }

    console.log("Seed complete: 3 routes, 6 buses, 240 seats, 42 schedules.");
}

main()
    .catch((e) => {
        console.error("Seed failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });