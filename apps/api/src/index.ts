import "dotenv/config";

import { connectDB, prisma } from "@tripeseats/database";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express from "express";

import { auth } from "./lib/auth";
import { allowedWebOrigins } from "./lib/origins";
import { getResend } from "./lib/mail";
import { bookingsRouter } from "./routes/bookings";
import { calendarRouter } from "./routes/calendar";
import { dashboardRouter } from "./routes/dashboard";
import { eventsRouter } from "./routes/events";
import { leadsRouter } from "./routes/leads";
import { messagesRouter } from "./routes/messages";
import { quotesRouter } from "./routes/quotes";
import { tasksRouter } from "./routes/tasks";

function createApp() {
  const app = express();

  const corsOrigins = allowedWebOrigins();
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true
    })
  );
  app.use(express.json());

  app.use("/api/auth", toNodeHandler(auth));
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/bookings", bookingsRouter);
  app.use("/api/calendar", calendarRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/leads", leadsRouter);
  app.use("/api/messages", messagesRouter);
  app.use("/api/quotes", quotesRouter);
  app.use("/api/tasks", tasksRouter);

  /** Process is up — used by `apps/web/scripts/wait-for-api.mjs` (no DB). */
  app.get("/health/live", (_req, res) => {
    res.json({ ok: true, service: "api" });
  });

  /** DB connectivity — for monitoring / deploy readiness. */
  app.get("/health", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, service: "api", database: "ok" });
    } catch (err) {
      console.error("Health check: database unreachable:", err);
      res.status(503).json({ ok: false, service: "api", database: "error" });
    }
  });

  return app;
}

async function start() {
  const port = Number(process.env.API_PORT ?? 4000);
  const resend = getResend();
  if (resend) {
    console.log("Resend: API key loaded (transactional + Better Auth emails).");
  } else {
    console.warn("Resend: RESEND_API_KEY missing — lead emails and auth emails disabled.");
  }

  await connectDB();

  const app = createApp();
  app.listen(port, () => {
    console.log(`API running on port ${port}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
