import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { getSession, SessionError } from "../lib/session";

const router = Router();

function paramId(req: Request): string {
  const raw = req.params["id"];
  return Array.isArray(raw) ? raw[0]! : String(raw);
}

function handleSessionError(res: Response, e: unknown) {
  if (e instanceof SessionError) {
    return res.status(e.status).json({ error: e.message });
  }
  console.error("Tasks route error:", e);
  return res.status(500).json({ error: "Internal server error" });
}

function mapTaskStatus(input: string): "todo" | "done" | null {
  if (input === "completed") return "done";
  if (input === "pending") return "todo";
  return null;
}

function serializeTask(t: {
  id: string;
  title: string;
  status: string;
  dueAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    dueAt: t.dueAt?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString()
  };
}

router.post("/", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const { eventId, title } = req.body as { eventId?: string; title?: string };
    if (!eventId || typeof eventId !== "string" || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "eventId and non-empty title are required." });
    }

    const event = await prisma.event.findFirst({
      where: { id: eventId, catererId: caterer.id }
    });
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }

    const task = await prisma.task.create({
      data: {
        catererId: caterer.id,
        eventId: event.id,
        title: title.trim(),
        status: "todo"
      }
    });

    return res.status(201).json({ task: serializeTask(task) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const id = paramId(req);
    const statusIn = (req.body as { status?: string })?.status;
    if (!statusIn) {
      return res.status(400).json({ error: "status is required." });
    }
    const status = mapTaskStatus(statusIn);
    if (!status) {
      return res.status(400).json({ error: "status must be pending or completed." });
    }

    const existing = await prisma.task.findFirst({
      where: { id, catererId: caterer.id }
    });
    if (!existing) {
      return res.status(404).json({ error: "Task not found." });
    }

    const completedAt = status === "done" ? new Date() : null;
    const task = await prisma.task.update({
      where: { id },
      data: {
        status,
        completedAt
      }
    });

    return res.json({ task: serializeTask(task) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const id = paramId(req);

    const existing = await prisma.task.findFirst({
      where: { id, catererId: caterer.id }
    });
    if (!existing) {
      return res.status(404).json({ error: "Task not found." });
    }

    await prisma.task.delete({ where: { id } });
    return res.status(204).send();
  } catch (e) {
    return handleSessionError(res, e);
  }
});

export const tasksRouter = router;
