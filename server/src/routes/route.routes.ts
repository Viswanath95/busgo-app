import { Router } from "express";
import { searchSchedules } from "../controllers/route.controller";

const router = Router();

router.get("/search", searchSchedules);

export default router;