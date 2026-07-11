"use client";

import { Loader2, Mail, MessageSquare, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  useDiscussionMutations,
  useDiscussionThreadQuery
} from "@/hooks/use-discussions-query";
import type { DiscussionThread } from "@/lib/stores/app-store";

type Message = DiscussionThread["messages"][number];

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
    <div className={cn("flex flex-col gap-1 py-1", isOutbound ? "items-end" : "items-start")}>
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
        {message.senderName ?? (isOutbound ? "You" : "Guest")} ·{" "}
        {formatMessageTime(message.createdAt)}
      </p>
    </div>
  );
}

type EventDiscussionsTabProps = {
  eventId: string;
};

export function EventDiscussionsTab({ eventId }: EventDiscussionsTabProps) {
  const { data: thread, isLoading } = useDiscussionThreadQuery(eventId);
  const { sendMutation, canWriteDiscussions } = useDiscussionMutations(eventId);
  const [composerText, setComposerText] = useState("");
  const [sendAsEmail, setSendAsEmail] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messages = thread?.messages ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function sendMessage() {
    const body = composerText.trim();
    if (!body) return;
    sendMutation.mutate(
      {
        body,
        sendAsEmail,
        direction: sendAsEmail ? "outbound" : "internal"
      },
      {
        onSuccess: () => setComposerText("")
      }
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex h-[min(70vh,640px)] flex-col p-0">
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {isLoading && messages.length === 0 ? (
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

        {canWriteDiscussions ? (
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
                    sendMessage();
                  }
                }}
                disabled={sendMutation.isPending}
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Switch
                    id="event-discussion-send-mode"
                    checked={sendAsEmail}
                    onCheckedChange={setSendAsEmail}
                    disabled={sendMutation.isPending}
                  />
                  <Label htmlFor="event-discussion-send-mode" className="cursor-pointer text-sm font-normal">
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
                  disabled={sendMutation.isPending || !composerText.trim()}
                  onClick={() => sendMessage()}
                >
                  {sendMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Send
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
