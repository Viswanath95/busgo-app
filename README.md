# BusGo

A full-stack bus ticket booking platform with real-time seat selection, Razorpay payments, and PDF ticket generation.

## Tech Stack

**Client:** React, TypeScript, Vite, Tailwind CSS, Zustand, TanStack Query
**Server:** Node.js, Express, TypeScript, Prisma ORM
**Database:** PostgreSQL (Neon, serverless)
**Cache / Seat Locks:** Redis (Upstash, via ioredis)
**Infra (planned):** Vercel (client), Render (server)

## Project Structure
busgo/
├── client/       React + Vite + Tailwind frontend
├── server/       Express + TypeScript + Prisma backend
├── screenshots/  Proof-of-work screenshots
└── README.md

## API Endpoints

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Create a new user account, returns JWT |
| POST | `/api/auth/login` | Public | Authenticate existing user, returns JWT |
| GET | `/api/routes/search` | Public | Search schedules by route and date, with optional time-of-day filter |
| GET | `/api/schedules/:id/seats` | Optional | Live seat map for a schedule (available / booked / locked) |

### Search

`GET /api/routes/search?from=Chennai&to=Bangalore&date=2026-09-20&time=night`

| Param | Required | Description |
|---|---|---|
| `from` | Yes | Origin city (case-insensitive) |
| `to` | Yes | Destination city (case-insensitive) |
| `date` | Yes | Travel date in `YYYY-MM-DD` format |
| `time` | No | `morning` (5–11), `afternoon` (12–17), or `night` (18–23) |

### Seat status

`GET /api/schedules/:id/seats` returns every seat on the bus with a status of `available`, `booked`, or `locked`.

- **booked** — an active (non-cancelled) booking exists for that seat on that schedule, read from PostgreSQL
- **locked** — a temporary hold exists in Redis (`seat:{scheduleId}:{seatId}`), set to expire automatically
- **lockedByYou** — included on locked seats; `true` only when a valid JWT is sent and it belongs to the user holding the lock

The route is public, but sending a token lets the response tell you which locks are yours.

## Setup

1. Clone the repo
2. `cd server && npm install`
3. `cd client && npm install`
4. Copy `server/.env.example` to `server/.env` and fill in:
   - `DATABASE_URL` — your Neon Postgres connection string
   - `JWT_SECRET` — any long random string (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `REDIS_URL` — your Upstash Redis TLS connection string (starts with `rediss://`)
   - `PORT` — defaults to 5000
5. `cd server && npx prisma migrate dev` — creates all 7 tables on Neon
6. `npx prisma db seed` — populates 3 routes, 6 buses, 240 seats, 42 schedules
7. Run both dev servers separately: `npm run dev` in `client/` and `npm run dev` in `server/`

## Demo Data

Running the seed script creates realistic sample data:
- **3 routes** — Chennai↔Bangalore, Bangalore↔Hyderabad, Hyderabad↔Chennai
- **6 buses** — one SLEEPER and one AC_SLEEPER per route
- **240 seats** — 40 per bus (A1–H5 grid, split across lower/upper deck)
- **42 schedules** — 7 days of departures per bus, with distance-based fares

## Progress

- [x] **Day 1** — Monorepo scaffold, Tailwind client, Express + tsx server, Prisma schema (7 models), Neon DB connected and migrated
- [x] **Day 2** — Auth API (register/login) with bcrypt + JWT, auth middleware, centralized error handling (Zod + Prisma errors), Prisma seed script with realistic demo data, tested end-to-end in Postman
- [x] **Day 3** — Search API with date and time-of-day filters, seat status API merging PostgreSQL bookings with Redis locks, optional-auth middleware, Upstash Redis connected
 
Screenshots

Database (Prisma Studio)

![Routes table in Prisma Studio](screenshots/prisma-studio-routes.png)

![Buses table in Prisma Studio](screenshots/prisma-studio-buses.png)

![Schedules table in Prisma Studio](screenshots/prisma-studio-schedules.png)

Auth API (Postman)

![Successful register response in Postman](screenshots/register-success.png)

![Successful login response in Postman](screenshots/login-success.png)

![Successful search buses response in Postman](screenshots/search-buses.png)

![Successful seat status response in Postman](screenshots/seat-status.png)