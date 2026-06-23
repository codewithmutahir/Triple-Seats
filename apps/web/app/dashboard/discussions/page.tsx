"use client";

import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  Loader2,
  Mail,
  MessageSquare,
  Search,
  Send
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Conversation = {
  eventId: string;
  guestName: string;
  eventType: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
};

type Message = {
  id: string;
  eventId: string | null;
  direction: "inbound" | "outbound" | "internal";
  channel: string;
  body: string;
  senderName: string | null;
  senderEmail: string | null;
  createdAt: string;
};

type EventThreadMeta = {
  id: string;
  title: string;
  eventDate: string;
  guestName: string;
  guestEmail: string | null;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function relativeTime(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

function formatMessageTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}

async function fetchConversations(): Promise<{ conversations: Conversation[] } | { error: string }> {
  const res = await fetch("/api/messages/conversations", { credentials: "include" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { error: body?.error ?? res.statusText };
  }
  return (await res.json()) as { conversations: Conversation[] };
}

async function fetchThread(
  eventId: string
): Promise<{ event: EventThreadMeta; messages: Message[] } | { error: string }> {
  const res = await fetch(`/api/messages/event/${encodeURIComponent(eventId)}`, {
    credentials: "include"
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { error: body?.error ?? res.statusText };
  }
  return (await res.json()) as { event: EventThreadMeta; messages: Message[] };
}

function DiscussionsSkeleton() {
  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[480px] flex-col gap-4 lg:flex-row">
      <Card className="w-full lg:w-1/3">
        <CardContent className="space-y-4 p-4">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
      <Card className="hidden flex-1 lg:block">
        <CardContent className="p-6">
          <Skeleton className="h-12 w-64" />
          <div className="mt-8 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-3/4" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isOutbound = message.direction === "outbound";
  const isInternal = message.direction === "internal";

  if (isInternal) {
    return (
      <div className="flex flex-col items-center gap-1 py-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-amber-700">
          Internal note
        </span>
        <div className="max-w-[85%] rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-950 ring-1 ring-amber-200">
          <p className="whitespace-pre-wrap">{message.body}</p>
        </div>
        <p className="text-xs text-muted-foreground">{formatMessageTime(message.createdAt)}</p>
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-col gap-1 py-1", isOutbound ? "items-end" : "items-start")}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
          isOutbound
            ? "rounded-br-md bg-[#1B2A4A] text-white"
            : "rounded-bl-md bg-slate-100 text-slate-900"
        )}
      >
        <p className="whitespace-pre-wrap">{message.body}</p>
      </div>
      <p className="px-1 text-xs text-muted-foreground">
        {message.senderName ?? (isOutbound ? "You" : "Guest")} · {formatMessageTime(message.createdAt)}
      </p>
    </div>
  );
}

function DiscussionsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlEventId = searchParams.get("eventId");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(urlEventId);
  const [threadEvent, setThreadEvent] = useState<EventThreadMeta | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [composerText, setComposerText] = useState("");
  const [sendAsEmail, setSendAsEmail] = useState(true);
  const [sending, setSending] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileShowThread, setMobileShowThread] = useState(Boolean(urlEventId));

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const threadScrollRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    setListLoading(true);
    const result = await fetchConversations();
    if ("error" in result) {
      setError(result.error);
      setConversations([]);
    } else {
      setConversations(result.conversations);
    }
    setListLoading(false);
  }, []);

  const loadThread = useCallback(async (eventId: string) => {
    setThreadLoading(true);
    setError(null);
    const result = await fetchThread(eventId);
    if ("error" in result) {
      setError(result.error);
      setThreadEvent(null);
      setMessages([]);
    } else {
      setThreadEvent(result.event);
      setMessages(result.messages);
    }
    setThreadLoading(false);
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (urlEventId) {
      setSelectedEventId(urlEventId);
      setMobileShowThread(true);
      void loadThread(urlEventId);
    } else {
      setSelectedEventId(null);
      setMobileShowThread(false);
      setThreadEvent(null);
      setMessages([]);
    }
  }, [urlEventId, loadThread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, threadLoading]);

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.guestName.toLowerCase().includes(q));
  }, [conversations, search]);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.eventId === selectedEventId) ?? null,
    [conversations, selectedEventId]
  );

  const threadHeader = threadEvent ?? (selectedConversation
    ? {
        id: selectedConversation.eventId,
        title: selectedConversation.eventType,
        eventDate: selectedConversation.lastMessageAt,
        guestName: selectedConversation.guestName,
        guestEmail: null
      }
    : null);

  function selectConversation(eventId: string) {
    setSelectedEventId(eventId);
    setMobileShowThread(true);
    router.replace(`/dashboard/discussions?eventId=${encodeURIComponent(eventId)}`, {
      scroll: false
    });
  }

  function backToList() {
    setMobileShowThread(false);
    router.replace("/dashboard/discussions", { scroll: false });
  }

  async function sendMessage() {
    if (!selectedEventId || !composerText.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          eventId: selectedEventId,
          body: composerText.trim(),
          direction: sendAsEmail ? "outbound" : "internal"
        })
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: Message };
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      if (body.message) {
        setMessages((prev) => [...prev, body.message!]);
        setComposerText("");
        await loadConversations();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  const showListOnMobile = !mobileShowThread;

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        {mobileShowThread ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 lg:hidden"
            onClick={backToList}
            aria-label="Back to conversations"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        ) : null}
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-[#1B2A4A]">
            Discussions
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Message guests about their events
          </p>
        </div>
      </header>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex h-[calc(100vh-11rem)] min-h-[480px] overflow-hidden rounded-lg border bg-white shadow-sm">
        {/* Left: conversation list */}
        <div
          className={cn(
            "flex w-full flex-col border-r lg:w-1/3",
            mobileShowThread ? "hidden lg:flex" : "flex"
          )}
        >
          <div className="border-b p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by guest name…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {listLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredConversations.length === 0 && !urlEventId ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <MessageSquare className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium text-[#1B2A4A]">No discussions yet</p>
                <p className="text-xs text-muted-foreground">
                  Send a message from an event&apos;s quick actions to start a conversation.
                </p>
              </div>
            ) : (
              <ul>
                {filteredConversations.map((c) => (
                  <li key={c.eventId}>
                    <button
                      type="button"
                      onClick={() => selectConversation(c.eventId)}
                      className={cn(
                        "flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-50",
                        selectedEventId === c.eventId && "bg-slate-100"
                      )}
                    >
                      <Avatar className="h-10 w-10 text-xs">{initials(c.guestName)}</Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium text-[#1B2A4A]">{c.guestName}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {relativeTime(c.lastMessageAt)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
                            {c.eventType}
                          </Badge>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{c.lastMessage}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: message thread */}
        <div
          className={cn(
            "flex flex-1 flex-col",
            showListOnMobile ? "hidden lg:flex" : "flex"
          )}
        >
          {!selectedEventId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <Mail className="h-12 w-12 text-muted-foreground/60" />
              <p className="text-sm font-medium text-muted-foreground">Select a conversation</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
                {threadLoading && !threadHeader ? (
                  <Skeleton className="h-10 w-48" />
                ) : threadHeader ? (
                  <div className="min-w-0">
                    <h2 className="truncate font-heading text-lg font-semibold text-[#1B2A4A]">
                      {threadHeader.guestName}
                    </h2>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-normal">
                        {threadHeader.title}
                      </Badge>
                    </div>
                  </div>
                ) : null}
                {selectedEventId ? (
                  <Button variant="outline" size="sm" className="shrink-0" asChild>
                    <Link href={`/dashboard/events?eventId=${encodeURIComponent(selectedEventId)}`}>
                      View Event
                    </Link>
                  </Button>
                ) : null}
              </div>

              <div ref={threadScrollRef} className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                {threadLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className={cn("h-16", i % 2 === 0 ? "w-2/3" : "ml-auto w-2/3")} />
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
                    <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">No messages yet. Start the conversation below.</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {messages.map((m) => (
                      <MessageBubble key={m.id} message={m} />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              <div className="border-t bg-slate-50/50 p-4">
                <div className="space-y-3">
                  <Textarea
                    placeholder={sendAsEmail ? "Write your message to the guest…" : "Add an internal note…"}
                    className="min-h-[80px] resize-y bg-white"
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        void sendMessage();
                      }
                    }}
                    disabled={sending}
                  />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <Switch
                        id="send-mode"
                        checked={sendAsEmail}
                        onCheckedChange={setSendAsEmail}
                        disabled={sending}
                      />
                      <Label htmlFor="send-mode" className="cursor-pointer text-sm font-normal">
                        {sendAsEmail ? (
                          <span className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5" />
                            Send as email
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-amber-800">
                            <MessageSquare className="h-3.5 w-3.5" />
                            Internal note only
                          </span>
                        )}
                      </Label>
                    </div>
                    <Button
                      type="button"
                      className="bg-[#1B2A4A] hover:bg-[#1B2A4A]/90"
                      disabled={sending || !composerText.trim()}
                      onClick={() => void sendMessage()}
                    >
                      {sending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Send
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DiscussionsPage() {
  return (
    <Suspense fallback={<DiscussionsSkeleton />}>
      <DiscussionsInner />
    </Suspense>
  );
}
