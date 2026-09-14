import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/client";

/**
 * Central error handler. Combined with `express-async-errors` (imported once
 * in index.ts), any thrown error or rejected promise in a route/controller
 * ends up here automatically — no try/catch needed in every route.
 */
export function errorHandler (
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
) {
    if(err instanceof ZodError) {
        return res.status(400).json({
            error: "Validation failed",
            details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
    }

    if(err instanceof Prisma.PrismaClientKnownRequestError) {
        if(err.code === "P2002") {
            return res.status(409).json({ error: "A record with this value already exists" });
        }
    }

    console.error(err);
    return res.status(500).json({ error: "Something went wrong, Please try again."});
}