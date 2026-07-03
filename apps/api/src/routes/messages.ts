import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { escapeHtml, getResend, resendFromEmail } from "../lib/mail";
import { getSession, SessionError } from "../lib/session";
import { timer } from "../lib/perf";

const router = Router();

const TRUNCATE_LEN = 80;

function handleSessionError(res: Response, e: unknown) {
  if (e instanceof SessionError) {
    return res.status(e.status).json({ error: e.message });
  }
  console.error("Messages route error:", e);
  return res.status(500).json({ error: "Internal server error" });
}

function serializeMessage(m: {
  id: string;
  eventId: string | null;
  direction: string;
  channel: string;
  body: string;
  senderName: string | null;
  senderEmail: string | null;
  createdAt: Date;
}) {
  return {
    id: m.id,
    eventId: m.eventId,
    direction: m.direction,
    channel: m.channel,
    body: m.body,
    senderName: m.senderName,
    senderEmail: m.senderEmail,
    createdAt: m.createdAt.toISOString()
  };
}

function truncate(text: string, max = TRUNCATE_LEN) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function formatEventDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function buildOutboundEmailHtml(opts: {
  catererName: string;
  eventType: string;
  eventDate: Date;
  body: string;
}) {
  const safeBody = escapeHtml(opts.body).replace(/\n/g, "<br/>");
  return `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 560px; margin: 0 auto; padding: 24px;">
  <p style="margin: 0 0 16px;">Hello,</p>
  <p style="margin: 0 0 16px;"><strong>${escapeHtml(opts.catererName)}</strong> sent you a message regarding your catering event:</p>
  <div style="background: #f8fafc; border-left: 4px solid #1B2A4A; padding: 16px; margin: 0 0 20px; border-radius: 4px;">
    <p style="margin: 0 0 8px; font-size: 13px; color: #64748b;">Event details</p>
    <p style="margin: 0;"><strong>${escapeHtml(opts.eventType)}</strong></p>
    <p style="margin: 4px 0 0; color: #475569;">${escapeHtml(formatEventDate(opts.eventDate))}</p>
  </div>
  <div style="background: #ffffff; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin: 0 0 24px;">
    ${safeBody}
  </div>
  <p style="margin: 0; font-size: 13px; color: #94a3b8;">Reply to this email to continue the conversation with ${escapeHtml(opts.catererName)}.</p>
</body>
</html>`;
}

async function loadEventForCaterer(eventId: string, catererId: string) {
  return prisma.event.findFirst({
    where: { id: eventId, catererId },
    include: { primaryGuest: true }
  });
}

/** Authenticated: all messages for an event, oldest first */
router.get("/event/:eventId", async (req: Request, res: Response) => {
  try {
    const eventId = String(req.params.eventId ?? "").trim();
    const perf = timer(`messages:${eventId}`);

    const { caterer } = await getSession(req);
    perf.step("session");

    if (!eventId) {
      perf.end();
      return res.status(400).json({ error: "Event id is required." });
    }

    const event = await loadEventForCaterer(eventId, caterer.id);
    if (!event) {
      perf.end();
      return res.status(404).json({ error: "Event not found." });
    }

    const messages = await prisma.message.findMany({
      where: { catererId: caterer.id, eventId },
      orderBy: { createdAt: "asc" }
    });
    perf.step("db:messages");

    const g = event.primaryGuest;
    const guestName = g ? [g.firstName, g.lastName].filter(Boolean).join(" ") : "—";

    perf.end();
    return res.json({
      event: {
        id: event.id,
        title: event.title,
        eventDate: event.eventDate.toISOString(),
        guestName,
        guestEmail: g?.email ?? null
      },
      messages: messages.map(serializeMessage)
    });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

/** Authenticated: create a message (outbound email or internal note) */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const body = req.body as { eventId?: string; body?: string; direction?: string };

    const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
    const messageBody = typeof body.body === "string" ? body.body.trim() : "";
    const direction = body.direction;

    if (!eventId || !messageBody) {
      return res.status(400).json({ error: "eventId and body are required." });
    }
    if (direction !== "outbound" && direction !== "internal") {
      return res.status(400).json({ error: 'direction must be "outbound" or "internal".' });
    }

    const event = await loadEventForCaterer(eventId, caterer.id);
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }

    const senderName = caterer.name;
    const senderEmail = caterer.email;

    if (direction === "outbound") {
      const guestEmail = event.primaryGuest?.email?.trim();
      if (!guestEmail) {
        return res.status(400).json({ error: "Guest email is required to send a message." });
      }

      const resend = getResend();
      if (!resend) {
        return res.status(503).json({ error: "Email service is not configured." });
      }

      const { error: sendError } = await resend.emails.send({
        from: resendFromEmail(),
        to: guestEmail,
        replyTo: caterer.email,
        subject: `Message from ${caterer.name} regarding your event`,
        html: buildOutboundEmailHtml({
          catererName: caterer.name,
          eventType: event.title,
          eventDate: event.eventDate,
          body: messageBody
        })
      });
      if (sendError) {
        console.error("Failed to send outbound message email:", sendError);
        return res.status(502).json({ error: "Failed to send email." });
      }
    }

    const message = await prisma.message.create({
      data: {
        catererId: caterer.id,
        eventId,
        guestId: event.primaryGuestId ?? undefined,
        direction,
        channel: direction === "outbound" ? "email" : "internal",
        body: messageBody,
        senderName: direction === "outbound" ? senderName : null,
        senderEmail: direction === "outbound" ? senderEmail : null,
        sentAt: direction === "outbound" ? new Date() : null
      }
    });

    return res.status(201).json({ message: serializeMessage(message) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

/** Authenticated: conversation list for discussions sidebar */
router.get("/conversations", async (req: Request, res: Response) => {
  try {
    const perf = timer("messages:conversations");

    const { caterer } = await getSession(req);
    perf.step("session");

    const latestPerEvent = await prisma.message.findMany({
      where: { catererId: caterer.id, eventId: { not: null } },
      distinct: ["eventId"],
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        body: true,
        direction: true,
        createdAt: true,
        eventId: true,
        event: {
          select: {
            id: true,
            title: true,
            status: true,
            primaryGuest: {
              select: { firstName: true, lastName: true, email: true }
            }
          }
        }
      }
    });

    const conversations = latestPerEvent
      .filter((m): m is typeof m & { eventId: string } => m.eventId != null)
      .map((m) => {
        const g = m.event?.primaryGuest;
        const guestName = g ? [g.firstName, g.lastName].filter(Boolean).join(" ") : "—";

        return {
          eventId: m.eventId,
          guestName,
          eventType: m.event?.title ?? "—",
          lastMessage: truncate(m.body),
          lastMessageAt: m.createdAt.toISOString(),
          unreadCount: 0
        };
      });

    perf.step("db:conversations");
    perf.end();
    return res.json({ conversations });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

export const messagesRouter = router;
