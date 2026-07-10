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
import { toast } from "sonner";

import { SaveIndicator } from "@/components/save-indicator";
import { AddItemPayload } from "@/components/quote/add-item-form";
import { PackagesSection, packageSummaryLabel } from "@/components/quote/packages-section";
import { QuoteSection } from "@/components/quote/quote-section";
import {
  CATEGORY_LABELS,
  MENU_SECTIONS,
  MENU_SECTION_GROUPS,
  type ItemCategory,
  type CateringPackage,
  type MenuItem,
  type QuoteLineItem,
  type QuoteStatus
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
  formatTaxRatePercent,
  formatUsd,
  getActiveTier,
  lineItemTotal
} from "@/lib/quote-totals";
import { formatCustomerType, formatEventType } from "@/lib/event-customer-types";
import { formatEventDateWithTime } from "@/lib/event-datetime";
import { getPackageSlotsForSection } from "@/lib/package-sections";
import {
  packageSelectionsEqual,
  storedSelectionsToUi,
  uiSelectionsToStored,
  type UiPackageSelections
} from "@/lib/package-selections";
import { useQuoteBuilderMutations, useQuoteBuilderQuery } from "@/hooks/use-quote-builder";
import { useDebouncedCallback } from "@/lib/use-debounce";
import { parseApiError } from "@/lib/user-facing-error";
import { quoteAnalytics } from "@/lib/quote-analytics";
import { browserTimer } from "@/lib/perf";
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
  if (item.unitType === "per_head" && item.category !== "equipment") {
    return `× ${guestCount} guests`;
  }
  if (item.unitType === "per_piece" || (item.category === "equipment" && item.unitType === "per_head")) {
    return `(${item.quantity} pieces)`;
  }
  if (item.unitType === "by_tray") {
    return item.quantity === 1 ? "(1 tray)" : `(${item.quantity} trays)`;
  }
  return "(flat)";
}

function QuoteBuilderPage() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get("eventId");

  const perfRef = useRef<ReturnType<typeof browserTimer> | null>(null);
  const perfEndedRef = useRef(false);
  if (!perfRef.current) {
    perfRef.current = browserTimer("quote-page");
    perfRef.current.step("mount");
  }

  const { data: builderData, isLoading: loading, error: queryError } = useQuoteBuilderQuery(eventId);
  const {
    addItemMutation,
    updateQuoteMutation,
    addPackageMutation,
    removePackageMutation,
    updateGuestCountMutation,
    duplicateMutation,
    selectPackageOptimistic,
    removePackageOptimistic,
    updateLineItemOptimistic,
    removeLineItemOptimistic,
    latestPackageIdRef,
    isGuestCountMutating,
    isSaving,
    isSaveSuccess,
    isSaveError
  } = useQuoteBuilderMutations(eventId);

  const quote = builderData?.quote ?? null;
  const lineItems = quote?.lineItems ?? [];
  const packages = (builderData?.packages ?? []) as CateringPackage[];
  const menuItemsByCategory = (builderData?.menuItemsByCategory ?? {}) as Partial<
    Record<ItemCategory, MenuItem[]>
  >;
  const packagesLoading = loading;
  const error = queryError?.message ?? null;

  const [pdfLoading, setPdfLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);

  const [taxPct, setTaxPct] = useState("8.75");
  const [depositPctInput, setDepositPctInput] = useState("50");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>();

  const [deliveryDistance, setDeliveryDistance] = useState("");
  const [deliveryRate, setDeliveryRate] = useState("");

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(MENU_SECTIONS.map((s) => [s.category, true]))
  );

  const [packageItemSelections, setPackageItemSelections] = useState<UiPackageSelections>(() =>
    Object.fromEntries(MENU_SECTIONS.map((s) => [s.category, {}]))
  );

  const settingsInitialized = useRef(false);
  const skipSettingsSaveRef = useRef(true);
  const packageSelectionsInitialized = useRef(false);
  const skipPackageSelectionsSaveRef = useRef(true);
  const quoteLoadedRef = useRef<string | null>(null);
  const quoteCreatedTrackedRef = useRef<string | null>(null);
  const quoteOpenedTrackedRef = useRef<string | null>(null);

  const [selectedPkgId, setSelectedPkgId] = useState<string | null>(null);

  const cachedGuestCount = quote?.event?.guestCountEstimate ?? 0;
  const [liveGuestCount, setLiveGuestCount] = useState(cachedGuestCount);

  useEffect(() => {
    setLiveGuestCount(quote?.event?.guestCountEstimate ?? 0);
  }, [quote?.event?.guestCountEstimate]);

  const handleGuestCountPreview = useCallback((count: number) => {
    setLiveGuestCount(count);
  }, []);

  const packageLineItem = useMemo(() => {
    const packageLines = lineItems.filter((item) => item.unitType === "tiered_per_head");
    if (packageLines.length === 0) return null;
    const inFlight = packageLines.find((item) => item.id.startsWith("temp_pkg_"));
    return inFlight ?? packageLines[packageLines.length - 1]!;
  }, [lineItems]);

  const selectedPackage = useMemo(
    () => (selectedPkgId ? (packages.find((p) => p.id === selectedPkgId) ?? null) : null),
    [selectedPkgId, packages]
  );

  const savingPackageId =
    addPackageMutation.isPending && addPackageMutation.variables?.packageId
      ? addPackageMutation.variables.packageId
      : null;

  const customerType = quote?.event?.customerType ?? "b2c";

  const taxRate = useMemo(() => {
    const t = parseFloat(taxPct) / 100;
    return Number.isFinite(t) ? t : (quote?.taxRate ?? 0.0875);
  }, [taxPct, quote?.taxRate]);

  const depositPct = useMemo(() => {
    const d = parseFloat(depositPctInput) / 100;
    return Number.isFinite(d) ? d : (quote?.depositPct ?? 0.5);
  }, [depositPctInput, quote?.depositPct]);

  const displayLineItems = useMemo(() => {
    return lineItems.map((item) => {
      if (item.unitType !== "tiered_per_head") return item;
      const tiers =
        item.package?.tiers ?? packages.find((p) => p.id === item.packageId)?.tiers ?? [];
      if (tiers.length === 0) return item;
      const tier = getActiveTier(tiers, liveGuestCount, customerType);
      if (!tier) {
        return { ...item, unitPrice: 0, appliedTier: null };
      }
      return { ...item, unitPrice: tier.pricePerHead, appliedTier: tier.pricePerHead };
    });
  }, [lineItems, liveGuestCount, customerType, packages]);

  const totals = useMemo(
    () => calculateQuoteTotals(displayLineItems, taxRate, depositPct, liveGuestCount),
    [displayLineItems, taxRate, depositPct, liveGuestCount]
  );

  const deliveryTotal = useMemo(() => {
    const d = parseFloat(deliveryDistance);
    const r = parseFloat(deliveryRate);
    if (!Number.isFinite(d) || !Number.isFinite(r)) return 0;
    return d * r;
  }, [deliveryDistance, deliveryRate]);

  useEffect(() => {
    if (!quote?.id) return;
    if (quoteLoadedRef.current === quote.id) return;
    quoteLoadedRef.current = quote.id;

    const initialPackageId =
      quote.lineItems.find((item) => item.unitType === "tiered_per_head")?.packageId ?? null;
    setSelectedPkgId(initialPackageId);
    latestPackageIdRef.current = initialPackageId;
  }, [quote?.id, quote?.lineItems, latestPackageIdRef]);

  useEffect(() => {
    if (!quote || !eventId) return;
    if (quoteCreatedTrackedRef.current === quote.id) return;

    const storageKey = `ph_quote_created_${quote.id}`;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(storageKey)) {
      quoteCreatedTrackedRef.current = quote.id;
      return;
    }

    const ageMs = quote.createdAt ? Date.now() - new Date(quote.createdAt).getTime() : Number.POSITIVE_INFINITY;
    if (ageMs < 30_000) {
      quoteCreatedTrackedRef.current = quote.id;
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(storageKey, "1");
      }
      quoteAnalytics.quoteCreated({
        eventId,
        quoteId: quote.id,
        hasPackage: lineItems.some((item) => item.unitType === "tiered_per_head")
      });
    }
  }, [quote, eventId, lineItems]);

  useEffect(() => {
    if (!quote || !eventId) return;
    if (quoteOpenedTrackedRef.current === quote.id) return;
    quoteOpenedTrackedRef.current = quote.id;
    quoteAnalytics.opened({
      eventId,
      quoteId: quote.id,
      status: quote.status,
      guestCount: liveGuestCount,
      lineItemCount: lineItems.length
    });
  }, [quote, eventId, liveGuestCount, lineItems.length]);

  useEffect(() => {
    if (!quote) return;
    skipSettingsSaveRef.current = true;
    settingsInitialized.current = true;
    setTaxPct(String((quote.taxRate * 100).toFixed(2).replace(/\.?0+$/, "")));
    setDepositPctInput(String(Math.round(quote.depositPct * 100)));
    setNotes(quote.notes ?? "");
    setDueDate(quote.dueDate ? new Date(quote.dueDate) : undefined);

    skipPackageSelectionsSaveRef.current = true;
    packageSelectionsInitialized.current = true;
    setPackageItemSelections(storedSelectionsToUi(quote.packageSelections));
  }, [quote?.id]);

  const savePackageSelections = useDebouncedCallback(
    useCallback(() => {
      if (!packageSelectionsInitialized.current || !quote) return;
      if (skipPackageSelectionsSaveRef.current) {
        skipPackageSelectionsSaveRef.current = false;
        return;
      }

      const stored = uiSelectionsToStored(packageItemSelections, menuItemsByCategory);
      if (packageSelectionsEqual(stored, quote.packageSelections)) return;

      updateQuoteMutation.mutate({
        quoteId: quote.id,
        data: { packageSelections: stored }
      });
    }, [quote, packageItemSelections, menuItemsByCategory, updateQuoteMutation]),
    500
  );

  const flushPackageSelections = useCallback(async () => {
    if (!packageSelectionsInitialized.current || !quote) return;
    const stored = uiSelectionsToStored(packageItemSelections, menuItemsByCategory);
    if (packageSelectionsEqual(stored, quote.packageSelections)) return;
    await updateQuoteMutation.mutateAsync({
      quoteId: quote.id,
      data: { packageSelections: stored }
    });
  }, [quote, packageItemSelections, menuItemsByCategory, updateQuoteMutation]);

  const saveSettings = useDebouncedCallback(() => {
    if (!settingsInitialized.current || !quote) return;
    if (skipSettingsSaveRef.current) {
      skipSettingsSaveRef.current = false;
      return;
    }

    const tax = parseFloat(taxPct) / 100;
    const deposit = parseFloat(depositPctInput) / 100;
    if (!Number.isFinite(tax) || !Number.isFinite(deposit)) return;

    const nextNotes = notes.trim() || null;
    const nextDueDate = dueDate ? dueDate.toISOString() : null;
    const currentDueDate = quote.dueDate ? new Date(quote.dueDate).toISOString() : null;
    if (
      tax === quote.taxRate &&
      deposit === quote.depositPct &&
      nextNotes === (quote.notes ?? null) &&
      nextDueDate === currentDueDate
    ) {
      return;
    }

    updateQuoteMutation.mutate({
      quoteId: quote.id,
      data: {
        taxRate: tax,
        depositPct: deposit,
        notes: nextNotes,
        dueDate: nextDueDate
      }
    });
  }, 800);

  useEffect(() => {
    if (perfEndedRef.current || loading || packagesLoading) return;
    if (quote) {
      perfEndedRef.current = true;
      perfRef.current?.step("render:complete");
      perfRef.current?.end();
    } else if (error) {
      perfEndedRef.current = true;
      perfRef.current?.end();
    }
  }, [quote, loading, packagesLoading, error]);

  useEffect(() => {
    if (!quote || !settingsInitialized.current) return;
    saveSettings();
  }, [taxPct, depositPctInput, notes, dueDate, saveSettings]);

  useEffect(() => {
    if (!quote || !packageSelectionsInitialized.current) return;
    savePackageSelections();
  }, [packageItemSelections, savePackageSelections, quote]);

  const addLineItemOptimistic = useCallback(
    (category: ItemCategory, payload: AddItemPayload) => {
      if (!quote) return;

      const tempId = `temp_${Date.now()}`;
      const tempItem: QuoteLineItem = {
        id: tempId,
        quoteId: quote.id,
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

      addItemMutation.mutate({
        quoteId: quote.id,
        item: {
          category,
          name: payload.name,
          quantity: payload.quantity,
          unitPrice: payload.unitPrice,
          unitType: payload.unitType,
          menuItemId: payload.menuItemId ?? null
        },
        tempItem
      });
    },
    [quote, addItemMutation]
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
    quoteAnalytics.deliveryAdded({
      eventId: eventId ?? undefined,
      quoteId: quote.id,
      distance: dist,
      rate,
      total: deliveryTotal
    });
    setDeliveryDistance("");
    setDeliveryRate("");
  }, [quote, deliveryTotal, deliveryDistance, deliveryRate, addLineItemOptimistic, eventId]);

  const clearPackageSelections = useCallback(() => {
    // Cancel any pending debounced save and skip the next auto-save after clearing.
    savePackageSelections.cancel();
    skipPackageSelectionsSaveRef.current = true;
    setPackageItemSelections(Object.fromEntries(MENU_SECTIONS.map((s) => [s.category, {}])));
  }, [savePackageSelections]);

  const addPackageToQuote = useCallback(
    (packageId: string) => {
      if (!quote) return;
      const pkg = packages.find((p) => p.id === packageId);
      if (!pkg) return;
      setSelectedPkgId(packageId);
      selectPackageOptimistic(pkg, packages);
      clearPackageSelections();
      const activeTier = getActiveTier(pkg.tiers, liveGuestCount, quote.event?.customerType ?? "b2c");
      quoteAnalytics.packageSelected({
        eventId,
        quoteId: quote.id,
        packageId: pkg.id,
        packageName: pkg.name,
        guestCount: liveGuestCount,
        tierPrice: activeTier?.pricePerHead
      });
      addPackageMutation.mutate(
        { quoteId: quote.id, packageId },
        {
          onError: (err) => {
            setSelectedPkgId(latestPackageIdRef.current);
            const msg = err instanceof Error ? err.message : "Failed to add package. Check the guest count.";
            toast.error(msg);
          }
        }
      );
    },
    [
      quote,
      packages,
      addPackageMutation,
      clearPackageSelections,
      selectPackageOptimistic,
      latestPackageIdRef,
      liveGuestCount
    ]
  );

  const removePackageFromQuote = useCallback(() => {
    if (!quote) return;
    quoteAnalytics.packageRemoved({
      eventId,
      quoteId: quote.id,
      packageId: selectedPkgId,
      packageName: selectedPackage?.name ?? null
    });
    setSelectedPkgId(null);
    removePackageOptimistic();
    clearPackageSelections();
    removePackageMutation.mutate(quote.id, {
      onError: () => {
        setSelectedPkgId(latestPackageIdRef.current);
      }
    });
  }, [
    quote,
    eventId,
    selectedPkgId,
    selectedPackage,
    removePackageMutation,
    clearPackageSelections,
    removePackageOptimistic,
    latestPackageIdRef
  ]);

  const updateGuestCount = useCallback(
    (nextGuestCount: number) => {
      if (!quote) return;
      updateGuestCountMutation.mutate({ quoteId: quote.id, guestCount: nextGuestCount });
    },
    [quote, updateGuestCountMutation]
  );

  const handlePackageItemsChange = useCallback(
    (category: string, selections: Record<string, string[]>) => {
      setPackageItemSelections((prev) => ({
        ...prev,
        [category]: selections
      }));
    },
    []
  );

  const saveDraft = useCallback(() => {
    if (!quote) return;
    quoteAnalytics.draftSaved({ eventId, quoteId: quote.id });
    updateQuoteMutation.mutate(
      { quoteId: quote.id, data: { status: "draft" } },
      { onSuccess: () => toast.success("Draft saved.") }
    );
  }, [quote, eventId, updateQuoteMutation]);

  const duplicateQuote = useCallback(() => {
    if (!quote) return;
    duplicateMutation.mutate(quote.id);
  }, [quote, duplicateMutation]);

  const duplicateLoading = duplicateMutation.isPending;

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
    return MENU_SECTIONS.map((s) => s.category).filter((cat) =>
      lineItems.some((i) => i.category === cat)
    );
  }, [lineItems]);

  const summaryPanel = quote ? (
    <>
      <Card className="hidden w-full lg:block">
          <CardHeader>
            <CardTitle className="text-lg">Quote summary</CardTitle>
            <p className="text-sm text-muted-foreground">
              Guest count: <span className="font-medium text-foreground">{liveGuestCount}</span>
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
                    {packageSummaryLabel(packageLineItem, liveGuestCount)}
                  </span>
                  <span className="shrink-0 font-medium">
                    {formatUsd(
                      lineItemTotal(
                        displayLineItems.find((i) => i.id === packageLineItem.id) ?? packageLineItem,
                        liveGuestCount
                      )
                    )}
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
                        {item.name} {unitTypeSummary(item, liveGuestCount)}
                      </span>
                      <span className="shrink-0 font-medium">
                        {formatUsd(lineItemTotal(item, liveGuestCount, item.category))}
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
              <span>Tax ({formatTaxRatePercent(taxRate)}%)</span>
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
                        {packageSummaryLabel(packageLineItem, liveGuestCount)}
                      </span>
                      <span>
                        {formatUsd(
                          lineItemTotal(
                            displayLineItems.find((i) => i.id === packageLineItem.id) ??
                              packageLineItem,
                            liveGuestCount
                          )
                        )}
                      </span>
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
                          <span>{formatUsd(lineItemTotal(item, liveGuestCount, item.category))}</span>
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
  const eventTypeLabel =
    quote.event?.eventTypeLabel ??
    (quote.event?.eventType ? formatEventType(quote.event.eventType) : quote.event?.title ?? "Event");
  const location =
    [quote.event?.venueName, quote.event?.venueAddress].filter(Boolean).join(" · ") ||
    "Location TBD";

  const backHref = `/dashboard/events?eventId=${encodeURIComponent(eventId)}`;

  return (
    <div className="relative p-4 pb-28 md:p-6 lg:pb-24">
      <SaveIndicator
        isPending={isSaving}
        isSuccess={isSaveSuccess && !isSaving}
        isError={isSaveError}
      />

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-2" asChild>
            <Link href={backHref}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to event
            </Link>
          </Button>
          <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
            Quote for {guestName} — {eventTypeLabel}{" "}
            <Badge
              variant="outline"
              className={cn(
                "align-middle text-xs font-semibold",
                customerType === "b2b"
                  ? "border-blue-300 bg-blue-50 text-blue-800"
                  : "border-slate-300 bg-slate-100 text-slate-700"
              )}
            >
              {formatCustomerType(customerType)}
            </Badge>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatEventDateWithTime(
              quote.event?.eventDate ?? "",
              quote.event?.startTime,
              quote.event?.endTime
            )}{" "}
            · {location}
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
            guestCount={cachedGuestCount}
            customerType={customerType}
            packageLineItem={packageLineItem}
            selectedPackageId={selectedPkgId}
            savingPackageId={savingPackageId}
            loading={packagesLoading}
            guestCountUpdating={isGuestCountMutating}
            onGuestCountPreview={handleGuestCountPreview}
            onGuestCountCommit={updateGuestCount}
            onAdd={addPackageToQuote}
            onRemove={removePackageFromQuote}
          />

          {MENU_SECTION_GROUPS.map((group) => (
            <div key={group.groupLabel}>
              <h3 className="border-b px-2 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.groupLabel}
              </h3>
              <div className="space-y-4 pt-4">
                {group.categories.map((category) => {
                  if (category === "delivery") {
                    return (
                      <Card key="delivery">
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
                                      onClick={() => removeLineItemOptimistic(item.id)}
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
                    );
                  }

                  const section = MENU_SECTIONS.find((s) => s.category === category);
                  if (!section) return null;

                  const includedItems = getPackageSlotsForSection(
                    selectedPackage?.items,
                    section.category
                  );

                  return (
                    <QuoteSection
                      key={section.category}
                      category={section.category}
                      label={section.label}
                      borderClass={section.borderClass}
                      emptyMessage={section.emptyMessage}
                      items={itemsByCategory.get(section.category) ?? []}
                      guestCount={liveGuestCount}
                      isOpen={openSections[section.category] ?? true}
                      onOpenChange={(open) => {
                        setOpenSections((prev) => ({ ...prev, [section.category]: open }));
                        quoteAnalytics.sectionToggled({
                          eventId,
                          quoteId: quote.id,
                          category: section.category,
                          isOpen: open
                        });
                      }}
                      onAdd={(payload) => addLineItemOptimistic(section.category, payload)}
                      onUpdate={updateLineItemOptimistic}
                      onDelete={removeLineItemOptimistic}
                      includedPackageName={
                        includedItems !== undefined ? selectedPackage?.name : undefined
                      }
                      includedItems={includedItems}
                      catalogItems={menuItemsByCategory[section.category]}
                      customerType={customerType}
                      selectedPackageItems={packageItemSelections[section.category]}
                      onPackageItemsChange={(selections) =>
                        handlePackageItemsChange(section.category, selections)
                      }
                    />
                  );
                })}
              </div>
            </div>
          ))}
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
                toast.message("Generating PDF — this can take up to a minute…");
                try {
                  await flushPackageSelections();
                  const res = await fetch(
                    `/api/quotes/${encodeURIComponent(quote.id)}/pdf`,
                    { method: "POST", credentials: "include" }
                  );
                  if (!res.ok) {
                    const body = (await res.json().catch(() => null)) as { error?: string } | null;
                    toast.error(parseApiError(body, res.status, res.statusText));
                    return;
                  }
                  const blob = await res.blob();
                  if (blob.size === 0) {
                    toast.error("PDF download was empty. Please try again.");
                    return;
                  }
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "quote.pdf";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 150);
                  toast.success("PDF downloaded!");
                  quoteAnalytics.pdfGenerated({
                    eventId,
                    quoteId: quote.id,
                    grandTotal: totals.grandTotal
                  });
                } catch {
                  toast.error("Failed to generate PDF.");
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
                toast.message("Sending quote — generating PDF and email…");
                try {
                  await flushPackageSelections();
                  const res = await fetch(
                    `/api/quotes/${encodeURIComponent(quote.id)}/send`,
                    { method: "POST", credentials: "include" }
                  );
                  const body = (await res.json().catch(() => null)) as {
                    error?: string;
                    quote?: { event?: { primaryGuest?: { email?: string | null } } };
                  } | null;
                  if (!res.ok) {
                    toast.error(parseApiError(body, res.status, res.statusText));
                    return;
                  }
                  const guestEmail =
                    body?.quote?.event?.primaryGuest?.email ??
                    quote.event?.primaryGuest?.email ??
                    "guest";
                  toast.success(`Quote sent to ${guestEmail}!`);
                  quoteAnalytics.sent({
                    eventId,
                    quoteId: quote.id,
                    grandTotal: totals.grandTotal,
                    guestEmail
                  });
                  quoteAnalytics.statusChanged({
                    eventId,
                    quoteId: quote.id,
                    fromStatus: quote.status,
                    toStatus: "sent"
                  });
                } catch {
                  toast.error("Failed to send quote.");
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
