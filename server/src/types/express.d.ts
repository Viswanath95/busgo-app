import type { AuthTokenPayload } from "../utils/jwt";

// Extends Express's Request type globally so `req.user` is typed
// everywhere in the app after authMiddleware runs, with no `any` casts.
declare global {
    namespace Express {
        interface Request {
            user?: AuthTokenPayload;
        }
    }
}

export {};