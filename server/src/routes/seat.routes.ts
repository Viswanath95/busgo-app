import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { lockSeats, unlockSeats } from "../controllers/seat.controller";

const router = Router();

router.post("/lock", authMiddleware, lockSeats);
router.post("/unlock", authMiddleware, unlockSeats);

export default router;

