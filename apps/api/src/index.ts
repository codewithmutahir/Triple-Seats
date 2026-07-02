import "dotenv/config";

import { connectDB, prisma } from "@tripeseats/database";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express from "express";

import { auth } from "./lib/auth";
import { ensureCatererSlugSchema } from "./lib/ensure-caterer-slug-schema";
import { ensureCateringPackagesSchema } from "./lib/ensure-catering-packages-schema";
import { allowedWebOrigins, isAllowedWebOrigin } from "./lib/origins";
import { getResend } from "./lib/mail";
import { leadSubmitLimiter } from "./lib/rate-limit";
import { bookingsRouter } from "./routes/bookings";
import { calendarRouter } from "./routes/calendar";
import { caterersRouter } from "./routes/caterers";
import { dashboardRouter } from "./routes/dashboard";
import { eventsRouter } from "./routes/events";
import { leadsRouter } from "./routes/leads";
import { messagesRouter } from "./routes/messages";
import { menuItemsRouter } from "./routes/menu-items";
import { packagesRouter } from "./routes/packages";
import { quotesRouter } from "./routes/quotes";
import { reportsRouter } from "./routes/reports";
import { tasksRouter } from "./routes/tasks";

function createApp() {
  const app = express();
  app.set("trust proxy", 1);

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || isAllowedWebOrigin(origin)) {
          callback(null, true);
          return;
        }
        if (process.env.NODE_ENV !== "production" && allowedWebOrigins().includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true
    })
  );
  app.use(express.json({ limit: "256kb" }));

  app.use("/api/auth", toNodeHandler(auth));
  app.use("/api/caterers", caterersRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/bookings", bookingsRouter);
  app.use("/api/calendar", calendarRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/leads", leadSubmitLimiter, leadsRouter);
  app.use("/api/messages", messagesRouter);
  app.use("/api/menu-items", menuItemsRouter);
  app.use("/api/packages", packagesRouter);
  app.use("/api/quotes", quotesRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/tasks", tasksRouter);

  app.get("/health/live", (_req, res) => {
    res.json({ ok: true, service: "api" });
  });

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
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  const host = process.env.HOST ?? "0.0.0.0";
  const resend = getResend();
  if (resend) {
    console.log("Resend: API key loaded (transactional + Better Auth emails).");
  } else {
    console.warn("Resend: RESEND_API_KEY missing — lead emails and auth emails disabled.");
  }

  const app = createApp();
  const server = app.listen(port, host, () => {
    console.log(`API running on ${host}:${port}`);
  });
  server.setTimeout(120_000);
  server.requestTimeout = 120_000;
  server.headersTimeout = 125_000;

  try {
    await connectDB();
    await ensureCatererSlugSchema();
    await ensureCateringPackagesSchema();
    console.log("[db] Schema checks complete");
  } catch (err) {
    console.error("[db] Startup schema/connect failed — API still listening for /health/live:", err);
  }
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
