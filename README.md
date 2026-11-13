# BusGo

A full-stack bus ticket booking platform with real-time seat selection, Razorpay payments, and PDF ticket generation.

## Tech Stack

**Client:** React, TypeScript, Vite, Tailwind CSS, Zustand, TanStack Query
**Server:** Node.js, Express, TypeScript, Prisma ORM
**Database:** PostgreSQL (Neon, serverless)
**Cache / Seat Locks:** Redis (Upstash, via ioredis)
**Payments:** Razorpay (test mode)
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
| POST | `/api/seats/lock` | Required | Temporarily hold seats for 10 minutes |
| POST | `/api/seats/unlock` | Required | Release seats you are holding |
| POST | `/api/payments/create-order` | Required | Verify seat locks, price the booking, create a Razorpay order |
| POST | `/api/payments/verify` | Required | Verify the payment signature, then write the booking atomically |

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

### Seat locking

`POST /api/seats/lock` and `POST /api/seats/unlock` both take the same body and require a Bearer token:

```json
{
  "scheduleId": "uuid-of-the-schedule",
  "seatIds": ["uuid-of-seat-1", "uuid-of-seat-2"]
}
```

**Lock responses**

| Status | Meaning |
|---|---|
| `200` | All seats locked; returns `lockedSeatIds` and `expiresInSeconds: 600` |
| `400` | Invalid IDs, more than 6 seats, seats from a different bus, or the bus has already departed |
| `404` | Schedule not found |
| `409` | A seat is already booked, or currently held by another user |

**How it works**

- Each lock is a single atomic Redis command: `SET seat:{scheduleId}:{seatId} {userId} EX 600 NX`. `NX` means "only if the key doesn't exist", so when two users race for the same seat, exactly one succeeds and the other gets a 409.
- The 10-minute expiry is part of the same command, so abandoned locks clear themselves with no cleanup job.
- Locking several seats is all-or-nothing. If any seat is taken, the seats already grabbed in that request are released.
- Locking a seat you already hold refreshes its 10-minute timer instead of failing.
- Unlock releases only seats held by the caller, using a Lua script so the ownership check and delete happen atomically. Seats held by someone else are returned in `skippedSeatIds` and left untouched.

**Why Redis TTL instead of a `locked_at` column in Postgres:** the lock is checked, written and timed in one atomic step, so there is no read-then-write race, and Redis expires stale locks itself instead of needing a cron job to sweep them.

### Payments

Booking is a two-step flow. Both endpoints require a Bearer token, and both must be called by the same user who locked the seats.

```
Lock seats → POST /payments/create-order → Razorpay checkout → POST /payments/verify → booking saved
```

**`POST /api/payments/create-order`**

```json
{
  "scheduleId": "uuid-of-the-schedule",
  "passengers": [
    { "seatId": "uuid-of-seat-1", "passengerName": "Viswa" }
  ]
}
```

| Status | Meaning |
|---|---|
| `201` | Order created; returns `orderId`, `amount` (in paise), `currency`, `keyId` |
| `400` | Duplicate seats, or seats that don't belong to this schedule's bus |
| `404` | Schedule not found |
| `409` | A seat is already booked, or the user's seat lock has expired |

- The price is calculated on the server from the schedule's fare. The client never sends an amount.
- The user's Redis locks are checked and extended to 15 minutes, so the lock can't expire while the user is paying.
- Passenger and seat details are stored server-side in Redis (`order:{orderId}`, 30 min TTL), so `verify` doesn't trust the client for them.

**`POST /api/payments/verify`**

```json
{
  "razorpay_order_id": "order_xxxxxxxxxxxxxx",
  "razorpay_payment_id": "pay_xxxxxxxxxxxxxx",
  "razorpay_signature": "hex-hmac-from-razorpay"
}
```

| Status | Meaning |
|---|---|
| `201` | Booking created; returns `bookingId` and `pnr` |
| `200` | Order was already verified; returns the same `bookingId` and `pnr` (idempotent) |
| `400` | Invalid payment signature |
| `403` | The order belongs to a different user |
| `409` | The seat was taken by someone else; payment is refunded |
| `410` | Order context expired |

**How it works**

- **Signature check:** Razorpay signs `orderId|paymentId` with HMAC-SHA256 using the account's secret. The server recomputes it and compares with `crypto.timingSafeEqual`, so a forged "payment succeeded" request is rejected.
- **Atomic write:** the Booking row and all its BookingItem rows are written inside one `prisma.$transaction()`. If any seat insert fails, Postgres rolls back everything, so there's never a booking with only some of its seats.
- **Double-booking guard:** `BookingItem` has `@@unique([scheduleId, seatId])`. Even if a Redis lock expired at the wrong moment, the database rejects the second booking, and the user is refunded.
- **Idempotent:** retrying `verify` for an order that's already booked returns the same PNR instead of creating a duplicate.
- **Cleanup order:** Redis locks are released only after the database commit succeeds, so a failed write leaves the user's lock intact for a retry.

**Why `scheduleId` is also stored on `BookingItem`:** a unique constraint can only use columns of its own table. Copying `scheduleId` onto `BookingItem` lets Postgres enforce "one seat, once per schedule" directly.

## Setup

1. Clone the repo
2. `cd server && npm install`
3. `cd client && npm install`
4. Copy `server/.env.example` to `server/.env` and fill in:
   - `DATABASE_URL` — your Neon Postgres connection string
   - `JWT_SECRET` — any long random string (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `REDIS_URL` — your Upstash Redis TLS connection string (starts with `rediss://`)
   - `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` — test-mode keys from the Razorpay dashboard (Test mode → Account & Settings → API Keys → Generate Key). Never commit real keys.
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

Schedules cover 7 days from the day the seed was run. If searches return nothing, or a bus says it has already departed, run `npx prisma db seed` again. The seed clears routes, buses, seats, schedules **and bookings** first, so re-seeding deletes any test bookings. Users are kept.

## Progress

- [x] **Day 1** — Monorepo scaffold, Tailwind client, Express + tsx server, Prisma schema (7 models), Neon DB connected and migrated
- [x] **Day 2** — Auth API (register/login) with bcrypt + JWT, auth middleware, centralized error handling (Zod + Prisma errors), Prisma seed script with realistic demo data, tested end-to-end in Postman
- [x] **Day 3** — Search API with date and time-of-day filters, seat status API merging PostgreSQL bookings with Redis locks, optional-auth middleware, Upstash Redis connected
- [x] **Day 4** — Redis seat locking with atomic `SET NX EX`, lock/unlock APIs with ownership checks (Lua compare-and-delete), all-or-nothing multi-seat locking, concurrency verified with two simultaneous requests (one `200`, one `409`)
- [x] **Day 5** — Razorpay test-mode integration: server-priced orders, HMAC-SHA256 signature verification, atomic booking write with `prisma.$transaction()`, idempotent verify, `(scheduleId, seatId)` unique constraint as a database-level double-booking guard
 
## Screenshots

### Database (Prisma Studio)

![Routes table in Prisma Studio](screenshots/prisma-studio-routes.png)

![Buses table in Prisma Studio](screenshots/prisma-studio-buses.png)

![Schedules table in Prisma Studio](screenshots/prisma-studio-schedules.png)

### Auth API (Postman)

![Successful register response in Postman](screenshots/register-success.png)

![Successful login response in Postman](screenshots/login-success.png)

![Successful search buses response in Postman](screenshots/search-buses.png)

![Successful seat status response in Postman](screenshots/seat-status.png)

### Seat Locking

**Concurrent lock test — one 200, one 409**
![Race test result](screenshots/race-test-result.png)

**Conflict response — 409**
![Lock conflict](screenshots/lock-conflict-409.png)

### Payments (Razorpay test mode)

**Create order — 201**
![Create order](screenshots/day5-create-order.png)

**Verify payment — booking created with PNR**
![Verify success](screenshots/day5-verify-success.png)

**Booking and BookingItem rows in Prisma Studio**
![Booking rows](screenshots/day5-prisma-studio-booking.png)
![Bookingitem rows](screenshots/day5-prisma-studio-bookingitem.png)

**Order in the Razorpay test dashboard**
![Razorpay dashboard](screenshots/day5-razorpay-dashboard.png)

