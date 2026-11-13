import Razorpay from "razorpay";

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

if(!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing in .env");
}

export const RAZORPAY_KEY_ID: string = keyId;
export const RAZORPAY_KEY_SECRET: string = keySecret;

export const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });