import { PgBoss } from "pg-boss";

const connectionString = process.env.DATABASE_URL;
if(!connectionString) throw new Error("DATABASE_URL is missing");

// pg-boss stores its jobs in its own "pgboss" schema inside your existing database.
// The two flags below switch off its background loops so an idle server sends (almost) no
// queries to Neon and the free database can go to sleep.
export const boss = new PgBoss({
    connectionString,
    max: 2, // small connection pool
    supervise: false, // no maintenance loop; we run maintenance once at startup instead
    schedule: false, // no cron scheduler; we don't use scheduled jobs
});

boss.on("error", (err) => console.error("pg-boss error:", err));

