BusGo

A full-stack bus ticket booking platform with real-time seat selection, Razorpay payments, and PDF ticket generation.

Tech Stack

Client: React, TypeScript, Vite, Tailwind CSS, Zustand, TanStack Query Server: Node.js, Express, TypeScript, Prisma ORM Database: PostgreSQL (Neon, serverless) Infra (planned): Redis (Upstash), Vercel (client), Render (server)

Project Structure
busgo/
├── client/     React + Vite + Tailwind frontend
├── server/     Express + TypeScript + Prisma backend
└── README.md

Setup
Clone the repo
cd server && npm install
cd client && npm install
Copy server/.env.example to server/.env and add your own DATABASE_URL
cd server && npx prisma migrate dev
Run both dev servers separately: npm run dev in client/ and npm run dev in server/

Progress
 Day 1 — Monorepo scaffold, Tailwind client, Express + tsx server, Prisma schema (7 models), Neon DB connected and migrated
 
Screenshots

Coming soon