import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if(!JWT_SECRET) {
    throw new Error("JWT_SECRET is not set in .env");
}

export interface AuthTokenPayload {
    id: string;
    email: string;
    role: "USER" | "ADMIN";
}

/** Signs a JWT for a logged-in user. Expires in 1 day. */
export function signToken(payload: AuthTokenPayload): string {
    return jwt.sign(payload, JWT_SECRET as string, { expiresIn: "1d"});
}

/** Verifies a JWT and returns its decoded payload, or throws if invalid/expired. */
export function verifyToken(token: string): AuthTokenPayload {
    return jwt.verify(token, JWT_SECRET as string) as AuthTokenPayload;
}