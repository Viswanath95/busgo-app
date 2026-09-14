import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prevent multiple PrismaClient instances in dev when nodemon/tsx
// hot-reloads the module. Without this, every file save would open
// a new DB connection pool and eventually exhaust Neon's connection limit.
declare global {
     // eslint-disable-next-line no-var
    var __prisma: PrismaClient | undefined;
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });


export const prisma = global.__prisma ?? new PrismaClient({ adapter });

if(process.env.NODE_ENV !== "production") {
    global.__prisma = prisma;
}