import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { getTicket, downloadTicket } from "../controllers/booking.controller";

const router = Router();
router.get("/:id/ticket", authMiddleware, getTicket);
router.get("/:id/ticket/file", authMiddleware, downloadTicket);
export default router;
