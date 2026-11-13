import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { createOrder, verifyPayment } from "../controllers/payment.controller";

const router = Router();
router.post("/create-order", authMiddleware, createOrder);
router.post("/verify", authMiddleware, verifyPayment);
export default router;
