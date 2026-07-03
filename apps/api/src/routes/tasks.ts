import type { Prisma } from "@tripeseats/database";
import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { buildPaginatedResponse, parsePagination } from "../lib/pagination";
import { getSession, SessionError } from "../lib/session";

const PENDING_STATUSES = ["todo", "in_progress", "blocked"] as const;

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

function toDisplayStatus(status: string): "pending" | "completed" {
  if (status === "done") return "completed";
  return "pending";
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

function serializeTaskWithEvent(t: {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
  event: {
    id: string;
    title: string;
    eventDate: Date;
    venueName: string | null;
    venueAddress: string | null;
  } | null;
}) {
  return {
    id: t.id,
    title: t.title,
    status: toDisplayStatus(t.status),
    createdAt: t.createdAt.toISOString(),
    event: t.event
      ? {
          id: t.event.id,
          title: t.event.title,
          eventDate: t.event.eventDate.toISOString(),
          venue: t.event.venueAddress ?? t.event.venueName ?? "—"
        }
      : null
  };
}

/** Authenticated: task counts */
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const catererId = caterer.id;

    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 7);
    dayEnd.setHours(23, 59, 59, 999);

    const [total, pending, completed, dueSoon] = await Promise.all([
      prisma.task.count({ where: { catererId } }),
      prisma.task.count({ where: { catererId, status: { in: ["todo", "in_progress", "blocked"] } } }),
      prisma.task.count({ where: { catererId, status: "done" } }),
      prisma.task.count({
        where: {
          catererId,
          status: { in: ["todo", "in_progress", "blocked"] },
          OR: [
            { event: { eventDate: { gte: dayStart, lte: dayEnd } } },
            { dueAt: { gte: dayStart, lte: dayEnd } }
          ]
        }
      })
    ]);

    return res.json({ total, pending, completed, dueSoon });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

/** Authenticated: list tasks with optional filters */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const catererId = caterer.id;

    const statusParam = String(req.query.status ?? "all").toLowerCase();
    const eventId =
      typeof req.query.eventId === "string" && req.query.eventId.trim()
        ? req.query.eventId.trim()
        : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const where: Prisma.TaskWhereInput = { catererId };

    if (statusParam === "pending") {
      where.status = { in: ["todo", "in_progress", "blocked"] };
    } else if (statusParam === "completed") {
      where.status = "done";
    }

    if (eventId) {
      where.eventId = eventId;
    }

    if (search) {
      where.title = { contains: search, mode: "insensitive" };
    }

    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const eventInclude = {
      event: {
        select: {
          id: true,
          title: true,
          eventDate: true,
          venueName: true,
          venueAddress: true
        }
      }
    } as const;

    let items: ReturnType<typeof serializeTaskWithEvent>[] = [];
    let total = 0;

    if (statusParam === "pending" || statusParam === "completed") {
      total = await prisma.task.count({ where });
      const tasks = await prisma.task.findMany({
        where,
        include: eventInclude,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: pageSize
      });
      items = tasks.map(serializeTaskWithEvent);
    } else {
      const pendingWhere: Prisma.TaskWhereInput = {
        ...where,
        status: { in: [...PENDING_STATUSES] }
      };
      const completedWhere: Prisma.TaskWhereInput = {
        ...where,
        status: "done"
      };

      const [pendingTotal, completedTotal] = await Promise.all([
        prisma.task.count({ where: pendingWhere }),
        prisma.task.count({ where: completedWhere })
      ]);
      total = pendingTotal + completedTotal;

      if (offset < pendingTotal) {
        const pendingTake = Math.min(pageSize, pendingTotal - offset);
        const pendingTasks = await prisma.task.findMany({
          where: pendingWhere,
          include: eventInclude,
          orderBy: { createdAt: "desc" },
          skip: offset,
          take: pendingTake
        });
        items = pendingTasks.map(serializeTaskWithEvent);

        if (items.length < pageSize) {
          const completedTasks = await prisma.task.findMany({
            where: completedWhere,
            include: eventInclude,
            orderBy: { createdAt: "desc" },
            skip: 0,
            take: pageSize - items.length
          });
          items = [...items, ...completedTasks.map(serializeTaskWithEvent)];
        }
      } else {
        const completedTasks = await prisma.task.findMany({
          where: completedWhere,
          include: eventInclude,
          orderBy: { createdAt: "desc" },
          skip: offset - pendingTotal,
          take: pageSize
        });
        items = completedTasks.map(serializeTaskWithEvent);
      }
    }

    return res.json(buildPaginatedResponse(items, total, page, pageSize));
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const { eventId, title } = req.body as { eventId?: string; title?: string };
    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "A non-empty title is required." });
    }

    let linkedEventId: string | null = null;
    if (eventId != null && eventId !== "") {
      if (typeof eventId !== "string") {
        return res.status(400).json({ error: "eventId must be a string." });
      }
      const event = await prisma.event.findFirst({
        where: { id: eventId, catererId: caterer.id }
      });
      if (!event) {
        return res.status(404).json({ error: "Event not found." });
      }
      linkedEventId = event.id;
    }

    const task = await prisma.task.create({
      data: {
        catererId: caterer.id,
        eventId: linkedEventId,
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
