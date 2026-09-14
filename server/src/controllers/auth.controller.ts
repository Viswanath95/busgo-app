import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { signToken } from "../utils/jwt";

const SALT_ROUNDS = 10;

const registerSchema = z.object({
    name: z.string().min(2, "Name must be atleast 2 characters"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be atleast 6 characters"),
    phone: z.string().optional(),
});

const loginSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(1, "Password is required"),
});


/** POST /api/auth/register */
export async function register(req: Request, res: Response) {
    const { name, email, password, phone } = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: {email} });
    if(existing) {
        return res.status(409).json({ error: "An account with this email already exists "});
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
        data: { 
            name, 
            email, 
            passwordHash, 
            ...(phone ? { phone } : {}),
        },
    });

    const token = signToken({ id: user.id, email: user.email, role: user.role });

    return res.status(201).json({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
}

/** POST /api/auth/login */
export async function login(req: Request, res: Response) {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: {email} });
    if(!user) {
        return res.status(401).json({ error: "Invalid email or password" });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if(!passwordMatches) {
        return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = signToken({ id: user.id, email: user.email, role: user.role });

    return res.status(200).json({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
}