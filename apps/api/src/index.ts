import { loadEnv } from "./lib/load-env";

loadEnv();

import { connectDB, disconnectDB, prisma } from "@tripeseats/database";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";

import { auth } from "./lib/auth";
import { ensureCatererSlugSchema } from "./lib/ensure-caterer-slug-schema";
import { ensureCateringPackagesSchema } from "./lib/ensure-catering-packages-schema";
import { allowedWebOrigins, isAllowedWebOrigin } from "./lib/origins";
import { getResend } from "./lib/mail";
import { authLimiter, generalLimiter } from "./lib/rate-limit";
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

const REQUIRED_ENV = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "WEB_ORIGIN",
  "LEAD_INTAKE_CATERER_ID"
] as const;

function validateEnv() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }
  let missing = false;
  for (const key of REQUIRED_ENV) {
    if (!process.env[key]?.trim()) {
      console.error(`❌ Missing required env var: ${key}`);
      missing = true;
    }
  }
  if (missing) {
    process.exit(1);
  }
  console.log("✅ All required env vars present");
}

function createApp() {
  const app = express();
  const isProd = process.env.NODE_ENV === "production";
  app.set("trust proxy", 1);

  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: false
    })
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || isAllowedWebOrigin(origin)) {
          callback(null, true);
          return;
        }
        if (!isProd && allowedWebOrigins().includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true
    })
  );
  app.use(express.json({ limit: "256kb" }));

  if (!isProd) {
    app.use((req, res, next) => {
      const t0 = Date.now();
      const { method, path } = req;

      res.on("finish", () => {
        const ms = Date.now() - t0;
        const emoji = ms > 2000 ? "🔴" : ms > 800 ? "🟡" : "🟢";
        console.log(`${emoji} [api] ${method} ${path} → ${res.statusCode} in ${ms}ms`);
      });
      next();
    });
  }

  app.get("/health/live", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "1.0.0"
    });
  });

  app.get("/health/ready", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({
        status: "ok",
        db: "connected",
        timestamp: new Date().toISOString()
      });
    } catch {
      res.status(503).json({
        status: "error",
        db: "disconnected",
        timestamp: new Date().toISOString()
      });
    }
  });

  app.get("/health", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok", db: "connected" });
    } catch {
      res.status(503).json({ status: "error" });
    }
  });

  app.get("/api/meta", (_req, res) => {
    res.json({
      features: {
        dashboardAll: true,
        calendarInit: true,
        quoteBuilder: true
      }
    });
  });

  app.use("/api/auth", authLimiter, toNodeHandler(auth));

  app.use("/api", generalLimiter);
  app.use("/api/caterers", caterersRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/bookings", bookingsRouter);
  app.use("/api/calendar", calendarRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/leads", leadsRouter);
  app.use("/api/messages", messagesRouter);
  app.use("/api/menu-items", menuItemsRouter);
  app.use("/api/packages", packagesRouter);
  app.use("/api/quotes", quotesRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/tasks", tasksRouter);

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const e = err as { status?: number; statusCode?: number; message?: string; stack?: string };
    const status = e.status ?? e.statusCode ?? 500;

    if (status >= 500) {
      console.error("[error]", {
        method: req.method,
        path: req.path,
        status,
        message: e.message,
        stack: isProd ? undefined : e.stack
      });
    }

    return res.status(status).json({
      error: isProd && status >= 500 ? "Something went wrong" : (e.message ?? "Unknown error")
    });
  });

  return app;
}

async function start() {
  validateEnv();

  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  const host = process.env.HOST ?? "0.0.0.0";
  const resend = getResend();
  if (resend) {
    console.log("Resend: API key loaded (transactional + Better Auth emails).");
  } else if (process.env.NODE_ENV === "production") {
    console.warn("Resend: RESEND_API_KEY missing — emails disabled.");
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

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
  process.exit(1);
});

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down...");
  await disconnectDB();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down...");
  await disconnectDB();
  process.exit(0);
});

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
