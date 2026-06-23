"use client";

import { format } from "date-fns";
import {
  ArrowLeft,
  Beef,
  Cake,
  ChevronDown,
  FileText,
  Loader2,
  Package,
  Plus,
  Salad,
  Send,
  Trash2,
  Truck,
  UtensilsCrossed
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  calculateQuoteTotals,
  formatUsd,
  lineItemTotal
} from "@/lib/quote-totals";
import { cn } from "@/lib/utils";

type ItemCategory =
  | "appetizer"
  | "main_course"
  | "bbq"
  | "dessert"
  | "equipment"
  | "delivery"
  | "other";

type QuoteUnit = "per_head" | "by_tray" | "flat";

type QuoteStatus = "draft" | "sent" | "accepted" | "declined";

type QuoteLineItem = {
  id: string;
  quoteId: string;
  category: ItemCategory;
  name: string;
  quantity: number;
  unitPrice: number;
  unitType: QuoteUnit;
  notes: string | null;
};

type QuoteEvent = {
  id: string;
  title: string;
  eventDate: string;
  guestCountEstimate: number;
  venueAddress: string | null;
  venueName: string | null;
  guestName: string | null;
  primaryGuest?: {
    email: string | null;
  } | null;
};

type Quote = {
  id: string;
  catererId: string;
  eventId: string;
  status: QuoteStatus;
  notes: string | null;
  taxRate: number;
  depositPct: number;
  dueDate: string | null;
  totalAmount: number;
  lineItems: QuoteLineItem[];
  event?: QuoteEvent;
};

const MENU_SECTIONS: {
  category: ItemCategory;
  label: string;
  icon: typeof Salad;
  suggestions: string[];
}[] = [
  {
    category: "appetizer",
    label: "Appetizer",
    icon: Salad,
    suggestions: ["Dahi Bara", "Chana Chat", "Rolls", "Samosa"]
  },
  {
    category: "main_course",
    label: "Main Course",
    icon: UtensilsCrossed,
    suggestions: ["Chicken Biryani", "Korma", "Pilao", "Karahi"]
  },
  {
    category: "bbq",
    label: "BBQ",
    icon: Beef,
    suggestions: ["Tikka Boti", "Malai Boti", "Afghani Boti"]
  },
  {
    category: "dessert",
    label: "Dessert",
    icon: Cake,
    suggestions: ["Kheer", "Trifle", "Pudding", "Faloda"]
  },
  {
    category: "equipment",
    label: "Equipment",
    icon: Package,
    suggestions: ["Plates", "Dishes", "Tongs", "Bowls", "Chargers", "Cutlery"]
  }
];

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  appetizer: "APPETIZER",
  main_course: "MAIN COURSE",
  bbq: "BBQ",
  dessert: "DESSERT",
  equipment: "EQUIPMENT",
  delivery: "DELIVERY",
  other: "OTHER"
};

const UNIT_LABELS: Record<QuoteUnit, string> = {
  per_head: "Per Head",
  by_tray: "By Tray",
  flat: "Flat Rate"
};

function statusBadgeVariant(status: QuoteStatus) {
  switch (status) {
    case "sent":
      return "quoteSent" as const;
    case "accepted":
      return "quoteAccepted" as const;
    case "declined":
      return "quoteDeclined" as const;
    default:
      return "quoteDraft" as const;
  }
}

function statusLabel(status: QuoteStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatEventDate(iso: string) {
  try {
    return format(new Date(iso), "EEEE, MMM d, yyyy");
  } catch {
    return iso;
  }
}

function unitTypeSummary(item: QuoteLineItem, guestCount: number): string {
  if (item.unitType === "per_head") {
    return `× ${guestCount} guests`;
  }
  if (item.unitType === "by_tray") {
    return item.quantity === 1 ? "(1 tray)" : `(${item.quantity} trays)`;
  }
  return "(flat)";
}

async function apiJson<T>(
  path: string,
  init?: RequestInit
): Promise<{ data?: T; error?: string }> {
  const res = await fetch(path, { credentials: "include", ...init });
  const body = (await res.json().catch(() => null)) as { error?: string } | T | null;
  if (!res.ok) {
    const err =
      body && typeof body === "object" && "error" in body && body.error
        ? String(body.error)
        : res.statusText;
    return { error: err };
  }
  return { data: body as T };
}

function QuoteBuilderPage() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get("eventId");

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [taxPct, setTaxPct] = useState("8.5");
  const [depositPctInput, setDepositPctInput] = useState("50");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>();

  const [deliveryDistance, setDeliveryDistance] = useState("");
  const [deliveryRate, setDeliveryRate] = useState("");

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(MENU_SECTIONS.map((s) => [s.category, true]))
  );
  const [addingCategory, setAddingCategory] = useState<ItemCategory | null>(null);
  const [draftItem, setDraftItem] = useState({
    name: "",
    quantity: "1",
    unitType: "per_head" as QuoteUnit,
    unitPrice: ""
  });

  const guestCount = quote?.event?.guestCountEstimate ?? 0;

  const totals = useMemo(() => {
    if (!quote) {
      return { subtotal: 0, tax: 0, grandTotal: 0, deposit: 0, balance: 0 };
    }
    return calculateQuoteTotals(quote.lineItems, quote.taxRate, quote.depositPct, guestCount);
  }, [quote, guestCount]);

  const deliveryTotal = useMemo(() => {
    const d = parseFloat(deliveryDistance);
    const r = parseFloat(deliveryRate);
    if (!Number.isFinite(d) || !Number.isFinite(r)) return 0;
    return d * r;
  }, [deliveryDistance, deliveryRate]);

  const applyQuote = useCallback((q: Quote) => {
    setQuote(q);
    setTaxPct(String((q.taxRate * 100).toFixed(2).replace(/\.?0+$/, "")));
    setDepositPctInput(String(Math.round(q.depositPct * 100)));
    setNotes(q.notes ?? "");
    setDueDate(q.dueDate ? new Date(q.dueDate) : undefined);
  }, []);

  useEffect(() => {
    if (!eventId) {
      setLoading(false);
      setError("Missing event. Open a quote from an event.");
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      const list = await apiJson<{ items: Quote[] }>(
        `/api/quotes/event/${encodeURIComponent(eventId)}`
      );
      if (cancelled) return;
      if (list.error) {
        setError(list.error);
        setLoading(false);
        return;
      }

      let current = list.data?.items?.[0] ?? null;
      if (!current) {
        const created = await apiJson<{ quote: Quote }>("/api/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId })
        });
        if (cancelled) return;
        if (created.error) {
          setError(created.error);
          setLoading(false);
          return;
        }
        current = created.data?.quote ?? null;
      }

      if (current) applyQuote(current);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [eventId, applyQuote]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const patchQuote = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!quote) return { error: "No quote loaded" };
      setBusy(true);
      const res = await apiJson<{ quote: Quote }>(
        `/api/quotes/${encodeURIComponent(quote.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      setBusy(false);
      if (res.data?.quote) applyQuote(res.data.quote);
      return res;
    },
    [quote, applyQuote]
  );

  const saveSettings = useCallback(async () => {
    const taxRate = parseFloat(taxPct) / 100;
    const depositPct = parseFloat(depositPctInput) / 100;
    if (!Number.isFinite(taxRate) || !Number.isFinite(depositPct)) return;
    await patchQuote({
      taxRate,
      depositPct,
      notes: notes.trim() || null,
      dueDate: dueDate ? dueDate.toISOString() : null
    });
  }, [taxPct, depositPctInput, notes, dueDate, patchQuote]);

  const addLineItem = useCallback(
    async (category: ItemCategory, overrides?: Partial<typeof draftItem>) => {
      if (!quote) return;
      const d = { ...draftItem, ...overrides };
      const name = d.name.trim();
      const unitPrice = parseFloat(d.unitPrice);
      const quantity = parseFloat(d.quantity) || 1;
      if (!name || !Number.isFinite(unitPrice)) return;

      setBusy(true);
      const res = await apiJson<{ quote: Quote }>(
        `/api/quotes/${encodeURIComponent(quote.id)}/items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category,
            name,
            quantity,
            unitPrice,
            unitType: d.unitType
          })
        }
      );
      setBusy(false);
      if (res.data?.quote) {
        applyQuote(res.data.quote);
        setDraftItem({ name: "", quantity: "1", unitType: "per_head", unitPrice: "" });
        setAddingCategory(null);
      } else if (res.error) {
        setToast(res.error);
      }
    },
    [quote, draftItem, applyQuote]
  );

  const deleteLineItem = useCallback(
    async (itemId: string) => {
      if (!quote) return;
      setBusy(true);
      const res = await apiJson<{ quote: Quote }>(
        `/api/quotes/${encodeURIComponent(quote.id)}/items/${encodeURIComponent(itemId)}`,
        { method: "DELETE" }
      );
      setBusy(false);
      if (res.data?.quote) applyQuote(res.data.quote);
    },
    [quote, applyQuote]
  );

  const addDeliveryLine = useCallback(async () => {
    if (!quote || deliveryTotal <= 0) return;
    const dist = parseFloat(deliveryDistance);
    const rate = parseFloat(deliveryRate);
    setBusy(true);
    const res = await apiJson<{ quote: Quote }>(
      `/api/quotes/${encodeURIComponent(quote.id)}/items`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "delivery",
          name: `Delivery (${dist} mi × ${formatUsd(rate)}/mi)`,
          quantity: 1,
          unitPrice: deliveryTotal,
          unitType: "flat"
        })
      }
    );
    setBusy(false);
    if (res.data?.quote) {
      applyQuote(res.data.quote);
      setDeliveryDistance("");
      setDeliveryRate("");
    }
  }, [quote, deliveryTotal, deliveryDistance, deliveryRate, applyQuote]);

  const itemsByCategory = useMemo(() => {
    const map = new Map<ItemCategory, QuoteLineItem[]>();
    for (const s of MENU_SECTIONS) {
      map.set(s.category, []);
    }
    map.set("delivery", []);
    for (const item of quote?.lineItems ?? []) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return map;
  }, [quote?.lineItems]);

  if (!eventId) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <p className="text-muted-foreground">Select an event to build a quote.</p>
        <Button className="mt-4" asChild>
          <Link href="/dashboard/events">Back to events</Link>
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 lg:grid-cols-5">
          <Skeleton className="h-96 lg:col-span-3" />
          <Skeleton className="h-96 lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <p className="text-destructive">{error ?? "Could not load quote."}</p>
        <Button className="mt-4" variant="outline" asChild>
          <Link href={`/dashboard/events?eventId=${encodeURIComponent(eventId)}`}>
            Back to event
          </Link>
        </Button>
      </div>
    );
  }

  const guestName = quote.event?.guestName ?? "Guest";
  const eventType = quote.event?.title ?? "Event";
  const location =
    [quote.event?.venueName, quote.event?.venueAddress].filter(Boolean).join(" · ") ||
    "Location TBD";

  const backHref = `/dashboard/events?eventId=${encodeURIComponent(eventId)}`;

  return (
    <div className="relative p-4 pb-24 md:p-6">
      {toast ? (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border bg-card px-4 py-2 text-sm shadow-lg"
        >
          {toast}
        </div>
      ) : null}
      {busy ? (
        <div className="fixed right-4 top-20 z-40 flex items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-sm shadow">
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving…
        </div>
      ) : null}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-2" asChild>
            <Link href={backHref}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to event
            </Link>
          </Button>
          <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
            Quote for {guestName} — {eventType}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatEventDate(quote.event?.eventDate ?? "")} · {location}
          </p>
        </div>
        <Badge variant={statusBadgeVariant(quote.status)} className="w-fit capitalize">
          {statusLabel(quote.status)}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left — line items */}
        <div className="space-y-4 lg:col-span-3">
          {MENU_SECTIONS.map((section) => {
            const Icon = section.icon;
            const items = itemsByCategory.get(section.category) ?? [];
            const isOpen = openSections[section.category] ?? true;
            const isAdding = addingCategory === section.category;

            return (
              <Collapsible
                key={section.category}
                open={isOpen}
                onOpenChange={(open) =>
                  setOpenSections((prev) => ({ ...prev, [section.category]: open }))
                }
              >
                <Card>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 p-4 text-left hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 text-primary" />
                        <span className="font-medium">{section.label}</span>
                        <Badge variant="secondary" className="ml-1">
                          {items.length}
                        </Badge>
                      </div>
                      <ChevronDown
                        className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")}
                      />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="space-y-3 border-t pt-4">
                      {items.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No items yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {items.map((item) => (
                            <li
                              key={item.id}
                              className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm"
                            >
                              <span className="min-w-[100px] flex-1 font-medium">{item.name}</span>
                              <span className="text-muted-foreground">qty {item.quantity}</span>
                              <span className="text-muted-foreground">{UNIT_LABELS[item.unitType]}</span>
                              <span>{formatUsd(item.unitPrice)}</span>
                              <span className="font-medium">
                                {formatUsd(lineItemTotal(item, guestCount))}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={() => deleteLineItem(item.id)}
                                aria-label="Remove item"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {section.suggestions.map((s) => (
                          <button
                            key={s}
                            type="button"
                            className="rounded-full border bg-background px-3 py-1 text-xs hover:bg-muted"
                            onClick={() => {
                              setAddingCategory(section.category);
                              setDraftItem({
                                name: s,
                                quantity: "1",
                                unitType: "per_head",
                                unitPrice: ""
                              });
                            }}
                          >
                            {s}
                          </button>
                        ))}
                      </div>

                      {isAdding ? (
                        <div className="grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-2">
                          <div className="sm:col-span-2">
                            <Label htmlFor={`name-${section.category}`}>Item name</Label>
                            <Input
                              id={`name-${section.category}`}
                              value={draftItem.name}
                              onChange={(e) =>
                                setDraftItem((d) => ({ ...d, name: e.target.value }))
                              }
                            />
                          </div>
                          <div>
                            <Label>Quantity</Label>
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              value={draftItem.quantity}
                              onChange={(e) =>
                                setDraftItem((d) => ({ ...d, quantity: e.target.value }))
                              }
                            />
                          </div>
                          <div>
                            <Label>Unit type</Label>
                            <Select
                              value={draftItem.unitType}
                              onValueChange={(v) =>
                                setDraftItem((d) => ({ ...d, unitType: v as QuoteUnit }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="per_head">Per Head</SelectItem>
                                <SelectItem value="by_tray">By Tray</SelectItem>
                                <SelectItem value="flat">Flat Rate</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Unit price (USD)</Label>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={draftItem.unitPrice}
                              onChange={(e) =>
                                setDraftItem((d) => ({ ...d, unitPrice: e.target.value }))
                              }
                            />
                          </div>
                          <div className="flex gap-2 sm:col-span-2">
                            <Button
                              type="button"
                              onClick={() => addLineItem(section.category)}
                              disabled={busy}
                            >
                              Add
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setAddingCategory(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAddingCategory(section.category);
                            setDraftItem({
                              name: "",
                              quantity: "1",
                              unitType: "per_head",
                              unitPrice: ""
                            });
                          }}
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          Add item
                        </Button>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}

          {/* Delivery */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Truck className="h-5 w-5" />
                Delivery
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Distance (miles)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={deliveryDistance}
                    onChange={(e) => setDeliveryDistance(e.target.value)}
                    placeholder="e.g. 12"
                  />
                </div>
                <div>
                  <Label>Rate per mile (USD)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={deliveryRate}
                    onChange={(e) => setDeliveryRate(e.target.value)}
                    placeholder="e.g. 2.50"
                  />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Delivery total: <span className="font-medium text-foreground">{formatUsd(deliveryTotal)}</span>
              </p>
              <Button
                type="button"
                variant="secondary"
                disabled={busy || deliveryTotal <= 0}
                onClick={addDeliveryLine}
              >
                Add delivery to quote
              </Button>
              {(itemsByCategory.get("delivery") ?? []).length > 0 ? (
                <ul className="space-y-2 border-t pt-3">
                  {(itemsByCategory.get("delivery") ?? []).map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span>{item.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{formatUsd(item.unitPrice)}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => deleteLineItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* Right — summary */}
        <div className="space-y-4 lg:col-span-2">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle className="text-lg">Quote summary</CardTitle>
              <p className="text-sm text-muted-foreground">
                Guest count: <span className="font-medium text-foreground">{guestCount}</span>
              </p>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {(["appetizer", "main_course", "bbq", "dessert", "equipment", "delivery"] as ItemCategory[]).map(
                (cat) => {
                  const items = quote.lineItems.filter((i) => i.category === cat);
                  if (items.length === 0) return null;
                  return (
                    <div key={cat}>
                      <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground">
                        {CATEGORY_LABELS[cat]}
                      </p>
                      <ul className="space-y-1">
                        {items.map((item) => (
                          <li key={item.id} className="flex justify-between gap-2">
                            <span className="text-muted-foreground">
                              {item.name} {unitTypeSummary(item, guestCount)}
                            </span>
                            <span className="shrink-0 font-medium">
                              {formatUsd(lineItemTotal(item, guestCount))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                }
              )}

              <div className="space-y-1 border-t pt-3">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatUsd(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax ({(quote.taxRate * 100).toFixed(1)}%)</span>
                  <span>{formatUsd(totals.tax)}</span>
                </div>
              </div>

              <div className="flex justify-between border-t pt-3 text-base font-semibold">
                <span>Grand Total</span>
                <span>{formatUsd(totals.grandTotal)}</span>
              </div>

              <div className="space-y-1 border-t pt-3">
                <div className="flex justify-between">
                  <span>Deposit ({Math.round(quote.depositPct * 100)}%)</span>
                  <span>{formatUsd(totals.deposit)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Balance Due</span>
                  <span>{formatUsd(totals.balance)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="tax-pct">Tax rate (%)</Label>
                  <Input
                    id="tax-pct"
                    type="number"
                    min={0}
                    step="0.1"
                    value={taxPct}
                    onChange={(e) => setTaxPct(e.target.value)}
                    onBlur={saveSettings}
                  />
                </div>
                <div>
                  <Label htmlFor="deposit-pct">Deposit (%)</Label>
                  <Input
                    id="deposit-pct"
                    type="number"
                    min={0}
                    max={100}
                    value={depositPctInput}
                    onChange={(e) => setDepositPctInput(e.target.value)}
                    onBlur={saveSettings}
                  />
                </div>
              </div>
              <div>
                <Label>Due date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="mt-1 w-full justify-start font-normal">
                      {dueDate ? format(dueDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={(d) => {
                        setDueDate(d);
                        void patchQuote({ dueDate: d ? d.toISOString() : null });
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label htmlFor="quote-notes">Notes</Label>
                <Textarea
                  id="quote-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={saveSettings}
                  placeholder="Terms, special requests…"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                await patchQuote({ status: "draft" });
                setToast("Draft saved.");
              }}
            >
              <FileText className="mr-2 h-4 w-4" />
              Save Draft
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || pdfLoading}
              onClick={async () => {
                if (!quote) return;
                setPdfLoading(true);
                try {
                  const res = await fetch(
                    `/api/quotes/${encodeURIComponent(quote.id)}/pdf`,
                    { method: "POST", credentials: "include" }
                  );
                  if (!res.ok) {
                    const body = (await res.json().catch(() => null)) as { error?: string } | null;
                    setToast(body?.error ?? "Failed to generate PDF.");
                    return;
                  }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "quote.pdf";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 150);
                  setToast("PDF downloaded!");
                } catch {
                  setToast("Failed to generate PDF.");
                } finally {
                  setPdfLoading(false);
                }
              }}
            >
              {pdfLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              Generate PDF
            </Button>
            <Button
              type="button"
              disabled={busy || sendLoading}
              onClick={async () => {
                if (!quote) return;
                setSendLoading(true);
                try {
                  const res = await fetch(
                    `/api/quotes/${encodeURIComponent(quote.id)}/send`,
                    { method: "POST", credentials: "include" }
                  );
                  const body = (await res.json().catch(() => null)) as {
                    error?: string;
                    quote?: Quote;
                  } | null;
                  if (!res.ok) {
                    setToast(body?.error ?? "Failed to send quote.");
                    return;
                  }
                  if (body?.quote) applyQuote(body.quote);
                  const guestEmail =
                    body?.quote?.event?.primaryGuest?.email ??
                    quote.event?.primaryGuest?.email ??
                    "guest";
                  setToast(`Quote sent to ${guestEmail}!`);
                } catch {
                  setToast("Failed to send quote.");
                } finally {
                  setSendLoading(false);
                }
              }}
            >
              {sendLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send to Guest
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QuotesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <Skeleton className="mb-4 h-10 w-72" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <QuoteBuilderPage />
    </Suspense>
  );
}
