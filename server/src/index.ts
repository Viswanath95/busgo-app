import "dotenv/config"; // must be first line — loads .env before anything else runs
import "express-async-errors"; // must be imported before routes are registered
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import routeRoutes from "./routes/route.routes";
import scheduleRoutes from "./routes/schedule.routes";
import seatRoutes from "./routes/seat.routes";
import { errorHandler } from "./middleware/errorHandler";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    message: "BusGo API is running",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/routes", routeRoutes);
app.use("/api/schedules", scheduleRoutes);
app.use("/api/seats", seatRoutes);

// Must be registered last — catches errors from every route above it.
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});