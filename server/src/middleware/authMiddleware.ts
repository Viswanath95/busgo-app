import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";

/**
 * Verifies the Bearer JWT on incoming requests and attaches the
 * decoded { id, email, role } payload to req.user.
 * Use on any route that requires a logged-in user.
 */

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization;

    if(!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or malformed Authentication header" });
    }

    const token = header.substring(7);

    if(!token) {
        return res.status(401).json({ error: "Token is missing" });
    }

    try {
        req.user = verifyToken(token);
        next();
    }catch {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}

/**
 * Use after authMiddleware on routes that only ADMIN users may access
 * (e.g. bus/route management, dashboard stats).
 */

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
    if(req.user?.role !== "ADMIN") {
        return res.status(403).json({ error: "Admin access required" });
    }
    next();
}