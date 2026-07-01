"use client";

import { format } from "date-fns";
import {
  ArrowLeft,
  ChevronUp,
  Copy,
  FileText,
  Loader2,
  Send,
  Truck,
  Trash2
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AddItemPayload } from "@/components/quote/add-item-form";
import { PackagesSection, packageSummaryLabel } from "@/components/quote/packages-section";
import { QuoteSection } from "@/components/quote/quote-section";
import { SaveStatusIndicator } from "@/components/quote/save-status-indicator";
import {
  CATEGORY_LABELS,
  MENU_SECTIONS,
  type ItemCategory,
  type CateringPackage,
  type Quote,
  type QuoteLineItem,
  type QuoteStatus,
  type QuoteUnit,
  type SaveStatus
} from "@/components/quote/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  calculateQuoteTotals,
  formatUsd,
  lineItemTotal
} from "@/lib/quote-totals";
import { useDebouncedCallback } from "@/lib/use-debounce";
import { parseApiError } from "@/lib/user-facing-error";
import { cn } from "@/lib/utils";

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
  if (item.unitType === "tiered_per_head") {
    return `× ${guestCount} guests`;
  }
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
    const errBody =
      body && typeof body === "object" && "error" in body ? (body as { error?: string }) : null;
    return { error: parseApiError(errBody, res.status, res.statusText) };
  }
  return { data: body as T };
}

function QuoteBuilderPage() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get("eventId");

  const [quote, setQuote] = useState<Quote | null>(null);
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [tempItemIds, setTempItemIds] = useState<Set<string>>(new Set());
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);

  const [taxPct, setTaxPct] = useState("8.5");
  const [depositPctInput, setDepositPctInput] = useState("50");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>();

  const [deliveryDistance, setDeliveryDistance] = useState("");
  const [deliveryRate, setDeliveryRate] = useState("");

  const [packages, setPackages] = useState<CateringPackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [packageActionLoading, setPackageActionLoading] = useState(false);
  const [guestCountSaving, setGuestCountSaving] = useState(false);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(MENU_SECTIONS.map((s) => [s.category, true]))
  );

  const pendingSaves = useRef(0);
  const quoteIdRef = useRef<string | null>(null);

  const guestCount = quote?.event?.guestCountEstimate ?? 0;

  const packageLineItem = useMemo(
    () => lineItems.find((item) => item.unitType === "tiered_per_head") ?? null,
    [lineItems]
  );

  const taxRate = useMemo(() => {
    const t = parseFloat(taxPct) / 100;
    return Number.isFinite(t) ? t : (quote?.taxRate ?? 0.085);
  }, [taxPct, quote?.taxRate]);

  const depositPct = useMemo(() => {
    const d = parseFloat(depositPctInput) / 100;
    return Number.isFinite(d) ? d : (quote?.depositPct ?? 0.5);
  }, [depositPctInput, quote?.depositPct]);

  const totals = useMemo(
    () => calculateQuoteTotals(lineItems, taxRate, depositPct, guestCount),
    [lineItems, taxRate, depositPct, guestCount]
  );

  const deliveryTotal = useMemo(() => {
    const d = parseFloat(deliveryDistance);
    const r = parseFloat(deliveryRate);
    if (!Number.isFinite(d) || !Number.isFinite(r)) return 0;
    return d * r;
  }, [deliveryDistance, deliveryRate]);

  const beginSave = useCallback(() => {
    pendingSaves.current += 1;
    setSaveStatus("saving");
  }, []);

  const endSave = useCallback((ok: boolean) => {
    pendingSaves.current = Math.max(0, pendingSaves.current - 1);
    if (pendingSaves.current === 0) {
      setSaveStatus(ok ? "saved" : "error");
    }
  }, []);

  const applyQuote = useCallback((q: Quote) => {
    setQuote(q);
    setLineItems(q.lineItems);
    setTaxPct(String((q.taxRate * 100).toFixed(2).replace(/\.?0+$/, "")));
    setDepositPctInput(String(Math.round(q.depositPct * 100)));
    setNotes(q.notes ?? "");
    setDueDate(q.dueDate ? new Date(q.dueDate) : undefined);
    quoteIdRef.current = q.id;
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
    let cancelled = false;

    (async () => {
      setPackagesLoading(true);
      const res = await apiJson<{ items: CateringPackage[] }>("/api/packages");
      if (cancelled) return;
      if (res.data?.items) {
        setPackages(res.data.items);
      }
      setPackagesLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const patchQuoteBackground = useCallback(
    async (payload: Record<string, unknown>) => {
      const id = quoteIdRef.current;
      if (!id) return { error: "No quote loaded" };
      beginSave();
      const res = await apiJson<{ quote: Quote }>(`/api/quotes/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.data?.quote) {
        setQuote((prev) => (prev ? { ...prev, ...res.data!.quote, lineItems } : res.data!.quote));
        endSave(true);
      } else {
        endSave(false);
      }
      return res;
    },
    [beginSave, endSave, lineItems]
  );

  const settingsInitialized = useRef(false);

  const saveSettings = useDebouncedCallback(() => {
    if (!settingsInitialized.current) return;
    const tax = parseFloat(taxPct) / 100;
    const deposit = parseFloat(depositPctInput) / 100;
    if (!Number.isFinite(tax) || !Number.isFinite(deposit)) return;
    void patchQuoteBackground({
      taxRate: tax,
      depositPct: deposit,
      notes: notes.trim() || null,
      dueDate: dueDate ? dueDate.toISOString() : null
    });
  }, 800);

  useEffect(() => {
    if (quote) settingsInitialized.current = true;
  }, [quote]);

  useEffect(() => {
    if (!quote || !settingsInitialized.current) return;
    saveSettings();
  }, [taxPct, depositPctInput, notes, dueDate, saveSettings, quote]);

  const addLineItemOptimistic = useCallback(
    (category: ItemCategory, payload: AddItemPayload) => {
      const id = quoteIdRef.current;
      if (!id || !quote) return;

      const tempId = `temp_${Date.now()}`;
      const newItem: QuoteLineItem = {
        id: tempId,
        quoteId: id,
        menuItemId: payload.menuItemId ?? null,
        packageId: null,
        category,
        name: payload.name,
        quantity: payload.quantity,
        unitPrice: payload.unitPrice,
        unitType: payload.unitType,
        appliedTier: null,
        appliedTierLabel: null,
        notes: null
      };

      setLineItems((prev) => [...prev, newItem]);
      setTempItemIds((prev) => new Set(prev).add(tempId));
      beginSave();

      void apiJson<{ quote: Quote }>(`/api/quotes/${encodeURIComponent(id)}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          name: payload.name,
          quantity: payload.quantity,
          unitPrice: payload.unitPrice,
          unitType: payload.unitType,
          menuItemId: payload.menuItemId ?? null
        })
      }).then((res) => {
        if (res.data?.quote) {
          setLineItems((prev) => {
            const prevRealIds = new Set(
              prev.filter((i) => !i.id.startsWith("temp_")).map((i) => i.id)
            );
            const created = res.data!.quote.lineItems.find((i) => !prevRealIds.has(i.id));
            if (!created) return prev.filter((i) => i.id !== tempId);
            return prev.map((i) => (i.id === tempId ? created : i));
          });
          setTempItemIds((prev) => {
            const next = new Set(prev);
            next.delete(tempId);
            return next;
          });
          setQuote((prev) => (prev ? { ...prev, totalAmount: res.data!.quote.totalAmount } : prev));
          endSave(true);
        } else {
          setLineItems((prev) => prev.filter((i) => i.id !== tempId));
          setTempItemIds((prev) => {
            const next = new Set(prev);
            next.delete(tempId);
            return next;
          });
          setToast("Failed to add item");
          endSave(false);
        }
      });
    },
    [quote, beginSave, endSave]
  );

  const deleteLineItemOptimistic = useCallback(
    (itemId: string) => {
      const id = quoteIdRef.current;
      if (!id) return;

      const removed = lineItems.find((i) => i.id === itemId);
      if (!removed) return;

      setLineItems((prev) => prev.filter((i) => i.id !== itemId));
      beginSave();

      if (itemId.startsWith("temp_")) {
        endSave(true);
        return;
      }

      void apiJson<{ quote: Quote }>(
        `/api/quotes/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`,
        { method: "DELETE" }
      ).then((res) => {
        if (res.data?.quote) {
          setQuote((prev) => (prev ? { ...prev, totalAmount: res.data!.quote.totalAmount } : prev));
          endSave(true);
        } else {
          setLineItems((prev) => [...prev, removed]);
          setToast("Failed to remove item");
          endSave(false);
        }
      });
    },
    [lineItems, beginSave, endSave]
  );

  const updateLineItemOptimistic = useCallback(
    (itemId: string, patch: Partial<Pick<QuoteLineItem, "quantity" | "unitPrice" | "unitType">>) => {
      const id = quoteIdRef.current;
      if (!id) return;

      const prevItem = lineItems.find((i) => i.id === itemId);
      if (!prevItem) return;

      const updated = { ...prevItem, ...patch };
      setLineItems((prev) => prev.map((i) => (i.id === itemId ? updated : i)));
      beginSave();

      if (itemId.startsWith("temp_")) {
        endSave(true);
        return;
      }

      void apiJson<{ quote: Quote }>(
        `/api/quotes/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch)
        }
      ).then((res) => {
        if (res.data?.quote) {
          setQuote((prev) => (prev ? { ...prev, totalAmount: res.data!.quote.totalAmount } : prev));
          endSave(true);
        } else {
          setLineItems((prev) => prev.map((i) => (i.id === itemId ? prevItem : i)));
          setToast("Failed to update item");
          endSave(false);
        }
      });
    },
    [lineItems, beginSave, endSave]
  );

  const addDeliveryLine = useCallback(() => {
    if (!quote || deliveryTotal <= 0) return;
    const dist = parseFloat(deliveryDistance);
    const rate = parseFloat(deliveryRate);
    addLineItemOptimistic("delivery", {
      name: `Delivery (${dist} mi × ${formatUsd(rate)}/mi)`,
      quantity: 1,
      unitPrice: deliveryTotal,
      unitType: "flat"
    });
    setDeliveryDistance("");
    setDeliveryRate("");
  }, [quote, deliveryTotal, deliveryDistance, deliveryRate, addLineItemOptimistic]);

  const addPackageToQuote = useCallback(
    async (packageId: string) => {
      const id = quoteIdRef.current;
      if (!id) return;
      setPackageActionLoading(true);
      beginSave();
      const res = await apiJson<{ quote: Quote }>(
        `/api/quotes/${encodeURIComponent(id)}/package`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ packageId })
        }
      );
      setPackageActionLoading(false);
      if (res.data?.quote) {
        applyQuote(res.data.quote);
        endSave(true);
      } else {
        setToast(res.error ?? "Failed to add package");
        endSave(false);
      }
    },
    [applyQuote, beginSave, endSave]
  );

  const removePackageFromQuote = useCallback(async () => {
    const id = quoteIdRef.current;
    if (!id) return;
    setPackageActionLoading(true);
    beginSave();
    const res = await apiJson<{ quote: Quote }>(
      `/api/quotes/${encodeURIComponent(id)}/package`,
      { method: "DELETE" }
    );
    setPackageActionLoading(false);
    if (res.data?.quote) {
      applyQuote(res.data.quote);
      endSave(true);
    } else {
      setToast(res.error ?? "Failed to remove package");
      endSave(false);
    }
  }, [applyQuote, beginSave, endSave]);

  const updateGuestCount = useCallback(
    async (nextGuestCount: number) => {
      const id = quoteIdRef.current;
      if (!id) return;
      setGuestCountSaving(true);
      beginSave();
      const res = await apiJson<{ quote: Quote }>(
        `/api/quotes/${encodeURIComponent(id)}/guest-count`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guestCount: nextGuestCount })
        }
      );
      setGuestCountSaving(false);
      if (res.data?.quote) {
        applyQuote(res.data.quote);
        endSave(true);
      } else {
        setToast(res.error ?? "Failed to update guest count");
        endSave(false);
      }
    },
    [applyQuote, beginSave, endSave]
  );

  const saveDraft = useCallback(async () => {
    const res = await patchQuoteBackground({ status: "draft" });
    if (!res.error) setToast("Draft saved.");
  }, [patchQuoteBackground]);

  const duplicateQuote = useCallback(async () => {
    const id = quoteIdRef.current;
    if (!id) return;
    setDuplicateLoading(true);
    const res = await apiJson<{ quote: Quote }>(
      `/api/quotes/${encodeURIComponent(id)}/duplicate`,
      { method: "POST" }
    );
    setDuplicateLoading(false);
    if (res.data?.quote) {
      applyQuote(res.data.quote);
      setToast("Quote duplicated.");
    } else {
      setToast(res.error ?? "Failed to duplicate quote.");
    }
  }, [applyQuote]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void saveDraft();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveDraft]);

  const itemsByCategory = useMemo(() => {
    const map = new Map<ItemCategory, QuoteLineItem[]>();
    for (const s of MENU_SECTIONS) {
      map.set(s.category, []);
    }
    map.set("delivery", []);
    for (const item of lineItems) {
      if (item.unitType === "tiered_per_head") continue;
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return map;
  }, [lineItems]);

  const activeSummaryCategories = useMemo(() => {
    return (["appetizer", "main_course", "bbq", "dessert", "equipment", "delivery"] as ItemCategory[]).filter(
      (cat) => lineItems.some((i) => i.category === cat)
    );
  }, [lineItems]);

  const summaryPanel = quote ? (
    <>
      <Card className="hidden w-full lg:block">
          <CardHeader>
            <CardTitle className="text-lg">Quote summary</CardTitle>
            <p className="text-sm text-muted-foreground">
              Guest count: <span className="font-medium text-foreground">{guestCount}</span>
            </p>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
          {packageLineItem ? (
            <div>
              <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground">
                PACKAGES
              </p>
              <ul className="space-y-1">
                <li className="flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    {packageSummaryLabel(packageLineItem, guestCount)}
                  </span>
                  <span className="shrink-0 font-medium">
                    {formatUsd(lineItemTotal(packageLineItem, guestCount))}
                  </span>
                </li>
              </ul>
            </div>
          ) : null}

          {activeSummaryCategories.map((cat) => {
            const items = lineItems.filter((i) => i.category === cat);
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
          })}

          <div className="space-y-1 border-t pt-3">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatUsd(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Tax ({(taxRate * 100).toFixed(1)}%)</span>
              <span>{formatUsd(totals.tax)}</span>
            </div>
          </div>

          <div className="flex justify-between border-t pt-3 text-base font-semibold">
            <span>Grand Total</span>
            <span>{formatUsd(totals.grandTotal)}</span>
          </div>

          <div className="space-y-1 border-t pt-3">
            <div className="flex justify-between">
              <span>Deposit ({Math.round(depositPct * 100)}%)</span>
              <span>{formatUsd(totals.deposit)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Balance Due</span>
              <span>{formatUsd(totals.balance)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="lg:hidden">
        <Collapsible open={mobileSummaryOpen} onOpenChange={setMobileSummaryOpen}>
          <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background shadow-lg">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
              >
                <span>Quote total: {formatUsd(totals.grandTotal)}</span>
                <ChevronUp
                  className={cn("h-4 w-4 transition-transform", mobileSummaryOpen && "rotate-180")}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="max-h-[50vh] overflow-y-auto px-4 pb-4">
              {packageLineItem ? (
                <div className="mb-3">
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">PACKAGES</p>
                  <ul className="space-y-1 text-sm">
                    <li className="flex justify-between gap-2">
                      <span className="text-muted-foreground">
                        {packageSummaryLabel(packageLineItem, guestCount)}
                      </span>
                      <span>{formatUsd(lineItemTotal(packageLineItem, guestCount))}</span>
                    </li>
                  </ul>
                </div>
              ) : null}
              {activeSummaryCategories.map((cat) => {
                const items = lineItems.filter((i) => i.category === cat);
                return (
                  <div key={cat} className="mb-3">
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">
                      {CATEGORY_LABELS[cat]}
                    </p>
                    <ul className="space-y-1 text-sm">
                      {items.map((item) => (
                        <li key={item.id} className="flex justify-between gap-2">
                          <span className="text-muted-foreground">{item.name}</span>
                          <span>{formatUsd(lineItemTotal(item, guestCount))}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Grand Total</span>
                <span>{formatUsd(totals.grandTotal)}</span>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      </div>
    </>
  ) : null;

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
    <div className="relative p-4 pb-28 md:p-6 lg:pb-24">
      <SaveStatusIndicator
        status={saveStatus}
        onFadeComplete={() => setSaveStatus("idle")}
      />

      {toast ? (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border bg-card px-4 py-2 text-sm shadow-lg"
        >
          {toast}
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
        <div className="space-y-4 lg:col-span-3">
          <PackagesSection
            packages={packages}
            guestCount={guestCount}
            packageLineItem={packageLineItem}
            loading={packagesLoading}
            guestCountSaving={guestCountSaving}
            actionLoading={packageActionLoading}
            onGuestCountChange={updateGuestCount}
            onAdd={addPackageToQuote}
            onRemove={removePackageFromQuote}
          />

          {MENU_SECTIONS.map((section) => (
            <QuoteSection
              key={section.category}
              category={section.category}
              label={section.label}
              borderClass={section.borderClass}
              emptyMessage={section.emptyMessage}
              items={itemsByCategory.get(section.category) ?? []}
              guestCount={guestCount}
              isOpen={openSections[section.category] ?? true}
              onOpenChange={(open) =>
                setOpenSections((prev) => ({ ...prev, [section.category]: open }))
              }
              onAdd={(payload) => addLineItemOptimistic(section.category, payload)}
              onUpdate={updateLineItemOptimistic}
              onDelete={deleteLineItemOptimistic}
              tempItemIds={tempItemIds}
            />
          ))}

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
                Delivery total:{" "}
                <span className="font-medium text-foreground">{formatUsd(deliveryTotal)}</span>
              </p>
              <Button
                type="button"
                variant="secondary"
                disabled={deliveryTotal <= 0}
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
                          onClick={() => deleteLineItemOptimistic(item.id)}
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

        <div className="space-y-4 lg:col-span-2">
          {summaryPanel}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Settings</CardTitle>
              <p className="text-xs text-muted-foreground">Changes save automatically</p>
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
                    <Calendar mode="single" selected={dueDate} onSelect={setDueDate} />
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
                  placeholder="Terms, special requests…"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2 pb-2">
            <Button type="button" variant="outline" onClick={() => void saveDraft()}>
              <FileText className="mr-2 h-4 w-4" />
              Save Draft
              <span className="ml-auto text-xs text-muted-foreground">⌘S</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={duplicateLoading}
              onClick={() => void duplicateQuote()}
            >
              {duplicateLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Copy className="mr-2 h-4 w-4" />
              )}
              Duplicate Quote
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pdfLoading}
              onClick={async () => {
                setPdfLoading(true);
                setToast("Generating PDF — this can take up to a minute…");
                try {
                  const res = await fetch(
                    `/api/quotes/${encodeURIComponent(quote.id)}/pdf`,
                    { method: "POST", credentials: "include" }
                  );
                  if (!res.ok) {
                    const body = (await res.json().catch(() => null)) as { error?: string } | null;
                    setToast(parseApiError(body, res.status, res.statusText));
                    return;
                  }
                  const blob = await res.blob();
                  if (blob.size === 0) {
                    setToast("PDF download was empty. Please try again.");
                    return;
                  }
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
              disabled={sendLoading}
              onClick={async () => {
                setSendLoading(true);
                setToast("Sending quote — generating PDF and email…");
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
                    setToast(parseApiError(body, res.status, res.statusText));
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
