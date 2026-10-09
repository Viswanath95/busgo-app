import { Router } from "express";
import { optionalAuth } from "../middleware/authMiddleware";
import { getSeatStatus } from "../controllers/schedule.controller";

const router = Router();

router.get("/:id/seats", optionalAuth, getSeatStatus);

export default router;