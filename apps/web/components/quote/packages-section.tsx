"use client";

import { Check, ChevronDown, Info, Package } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { CateringPackage, QuoteLineItem } from "@/components/quote/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatTierRange,
  formatUsd,
  getActiveTier,
  guestCountForTier,
  lineItemTotal,
  packageLineTotal
} from "@/lib/quote-totals";
import { cn } from "@/lib/utils";

type PackagesSectionProps = {
  packages: CateringPackage[];
  guestCount: number;
  customerType?: "b2b" | "b2c";
  packageLineItem: QuoteLineItem | null;
  selectedPackageId: string | null;
  savingPackageId?: string | null;
  loading?: boolean;
  guestCountUpdating?: boolean;
  onGuestCountPreview?: (guestCount: number) => void;
  onGuestCountCommit: (guestCount: number) => void;
  onAdd: (packageId: string) => void;
  onRemove: () => void;
  readOnly?: boolean;
};

function formatIncludedItems(items: CateringPackage["items"]): string {
  return items
    .map((item) => (item.quantity > 1 ? `${item.label} ×${item.quantity}` : item.label))
    .join(", ");
}

function parseGuestInput(value: string): number | null {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function PackageCard({
  pkg,
  guestCount,
  customerType,
  isSelected,
  isSaving,
  tierUnavailable,
  onAdd,
  onRemove,
  onSelectTier,
  readOnly = false
}: {
  pkg: CateringPackage;
  guestCount: number;
  customerType: "b2b" | "b2c";
  isSelected: boolean;
  isSaving?: boolean;
  tierUnavailable: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onSelectTier: (guestCount: number) => void;
  readOnly?: boolean;
}) {
  const [tiersOpen, setTiersOpen] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const activeTier = getActiveTier(pkg.tiers, guestCount, customerType);
  const itemCount = pkg.items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <Card
      className={cn(
        "relative flex flex-col",
        isSelected && "border-primary ring-2 ring-[#1B2A4A]"
      )}
    >
      {isSaving ? (
        <div
          className="absolute right-2 top-2 h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground"
          aria-hidden
        />
      ) : null}
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-heading text-lg font-semibold">{pkg.name}</h3>
            <p className="text-sm text-muted-foreground">{itemCount} items</p>
          </div>
          {isSelected ? (
            <Badge className="shrink-0 bg-emerald-600 hover:bg-emerald-600">Selected ✓</Badge>
          ) : null}
        </div>

        {activeTier ? (
          <div className="rounded-md bg-muted/60 px-3 py-2 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Active tier
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {formatUsd(activeTier.pricePerHead)}
              <span className="text-sm font-normal text-muted-foreground">/person</span>
            </p>
            <p className="text-xs text-muted-foreground">({formatTierRange(activeTier)} guests)</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No tier for current guest count</p>
        )}

        <Collapsible open={tiersOpen} onOpenChange={setTiersOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-full justify-between px-2">
              View tiers
              <ChevronDown className={cn("h-4 w-4 transition-transform", tiersOpen && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="overflow-hidden rounded-md border text-sm">
              <div className="grid grid-cols-2 bg-muted/50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Guests</span>
                <span className="text-right">Per Head</span>
              </div>
              {pkg.tiers.map((tier) => {
                const isActive =
                  activeTier?.minGuests === tier.minGuests &&
                  activeTier?.maxGuests === tier.maxGuests;
                return (
                  <button
                    key={`${tier.minGuests}-${tier.maxGuests ?? "plus"}`}
                    type="button"
                    disabled={readOnly}
                    onClick={() => !readOnly && onSelectTier(guestCountForTier(tier))}
                    className={cn(
                      "grid w-full grid-cols-2 border-t px-3 py-2 text-left tabular-nums transition-colors hover:bg-muted/80",
                      isActive && "bg-primary text-primary-foreground hover:bg-primary/90"
                    )}
                  >
                    <span>{formatTierRange(tier)}</span>
                    <span className="text-right font-medium">
                      {formatUsd(tier.pricePerHead)}
                      {isActive ? " ✓" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible open={itemsOpen} onOpenChange={setItemsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-full justify-between px-2">
              Included items
              <ChevronDown className={cn("h-4 w-4 transition-transform", itemsOpen && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-1">
            <ul className="space-y-1 text-sm text-muted-foreground">
              {pkg.items.map((item) => (
                <li key={item.id} className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                  {item.quantity > 1 ? `${item.label} ×${item.quantity}` : item.label}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>

        {!readOnly && (isSelected ? (
          <Button
            type="button"
            variant="outline"
            className="mt-auto border-destructive text-destructive hover:bg-destructive/10"
            onClick={onRemove}
          >
            Remove
          </Button>
        ) : (
          <Button
            type="button"
            className="mt-auto"
            disabled={tierUnavailable}
            onClick={onAdd}
          >
            Add Package
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

export function PackagesSection({
  packages,
  guestCount,
  customerType = "b2c",
  packageLineItem,
  selectedPackageId,
  savingPackageId = null,
  loading,
  guestCountUpdating = false,
  onGuestCountPreview,
  onGuestCountCommit,
  onAdd,
  onRemove,
  readOnly = false
}: PackagesSectionProps) {
  const [sectionOpen, setSectionOpen] = useState(true);
  const [guestInput, setGuestInput] = useState(String(guestCount || ""));
  const [previewGuestCount, setPreviewGuestCount] = useState(guestCount);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastEmittedRef = useRef<number>(guestCount);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const selectedPackage = selectedPackageId
    ? (packages.find((p) => p.id === selectedPackageId) ?? null)
    : null;

  const selectedPackageTier = selectedPackage
    ? getActiveTier(selectedPackage.tiers, previewGuestCount, customerType)
    : null;

  const previewPackageLineItem = packageLineItem
    ? (() => {
        if (packageLineItem.unitType !== "tiered_per_head") return packageLineItem;
        const tiers =
          packageLineItem.package?.tiers ??
          packages.find((p) => p.id === packageLineItem.packageId)?.tiers ??
          [];
        const tier = getActiveTier(tiers, previewGuestCount, customerType);
        if (!tier) {
          return { ...packageLineItem, unitPrice: 0, appliedTier: null };
        }
        return {
          ...packageLineItem,
          unitPrice: tier.pricePerHead,
          appliedTier: tier.pricePerHead
        };
      })()
    : null;

  // Reflect cached guestCount when input is not focused.
  useEffect(() => {
    const el = inputRef.current;
    const isFocused = el && document.activeElement === el;
    if (!isFocused) {
      lastEmittedRef.current = guestCount;
      setGuestInput(String(guestCount || ""));
      setPreviewGuestCount(guestCount);
    }
  }, [guestCount]);

  useEffect(() => () => clearTimeout(commitTimerRef.current), []);

  function applyPreview(parsed: number) {
    setPreviewGuestCount(parsed);
    onGuestCountPreview?.(parsed);
  }

  function commitGuestCount(parsed: number) {
    if (parsed !== lastEmittedRef.current) {
      lastEmittedRef.current = parsed;
      onGuestCountCommit(parsed);
    }
  }

  function handleGuestInputChange(raw: string) {
    setGuestInput(raw);

    const parsed = parseGuestInput(raw);
    if (parsed === null) return;

    applyPreview(parsed);

    clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => {
      commitGuestCount(parsed);
    }, 600);
  }

  function handleBlur() {
    clearTimeout(commitTimerRef.current);
    const parsed = parseGuestInput(guestInput);
    if (parsed === null) {
      setGuestInput(String(guestCount || ""));
      applyPreview(guestCount);
      return;
    }
    applyPreview(parsed);
    commitGuestCount(parsed);
  }

  function handleTierGuestCount(nextGuestCount: number) {
    clearTimeout(commitTimerRef.current);
    lastEmittedRef.current = nextGuestCount;
    setGuestInput(String(nextGuestCount || ""));
    applyPreview(nextGuestCount);
    onGuestCountCommit(nextGuestCount);
  }

  return (
    <Collapsible open={sectionOpen} onOpenChange={setSectionOpen}>
      <Card className="border-l-4 border-l-[#1B2A4A]">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 p-4 text-left hover:bg-muted/40"
          >
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <span className="font-medium">Packages</span>
              <span
                className="inline-flex text-muted-foreground"
                title="Select a full meal package for bulk pricing"
              >
                <Info className="h-4 w-4" />
              </span>
              {selectedPackageId ? (
                <Badge variant="secondary" className="ml-1">
                  1
                </Badge>
              ) : null}
            </div>
            <ChevronDown
              className={cn("h-4 w-4 transition-transform duration-200", sectionOpen && "rotate-180")}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-visible data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <CardContent className="space-y-4 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              Set guest count to pick a pricing tier, or click a tier row below.
            </p>

            <div className="max-w-xs space-y-2">
              <Label htmlFor="package-guest-count">Guest count</Label>
              <div className="relative">
                <Input
                  id="package-guest-count"
                  ref={inputRef}
                  type="number"
                  min={0}
                  step={1}
                  value={guestInput}
                  readOnly={readOnly}
                  disabled={readOnly}
                  onChange={(e) => !readOnly && handleGuestInputChange(e.target.value)}
                  onBlur={readOnly ? undefined : handleBlur}
                  placeholder="e.g. 200"
                  className={guestCountUpdating ? "pr-7" : undefined}
                />
                {guestCountUpdating ? (
                  <div
                    className="absolute right-3 top-1/2 h-1.5 w-1.5 -translate-y-1/2 animate-pulse rounded-full bg-muted-foreground/60"
                    aria-hidden
                  />
                ) : null}
              </div>
              {selectedPackageTier ? (
                <p className="text-xs text-muted-foreground">
                  Active tier: {formatUsd(selectedPackageTier.pricePerHead)}/person (
                  {formatTierRange(selectedPackageTier)} guests)
                </p>
              ) : activeTierLabel(previewGuestCount, packages, customerType) ? (
                <p className="text-xs text-muted-foreground">
                  {activeTierLabel(previewGuestCount, packages, customerType)}
                </p>
              ) : previewGuestCount > 0 ? (
                <p className="text-xs text-amber-700">No package tier matches this guest count.</p>
              ) : (
                <p className="text-xs text-muted-foreground">Enter guests to preview package pricing.</p>
              )}
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">Loading packages…</p>
            ) : packages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No packages configured yet.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                {packages.map((pkg) => (
                  <PackageCard
                    key={pkg.id}
                    pkg={pkg}
                    guestCount={previewGuestCount}
                    customerType={customerType}
                    isSelected={selectedPackageId === pkg.id}
                    isSaving={savingPackageId === pkg.id}
                    tierUnavailable={
                      previewGuestCount <= 0 ||
                      !getActiveTier(pkg.tiers, previewGuestCount, customerType)
                    }
                    onSelectTier={handleTierGuestCount}
                    onAdd={() => onAdd(pkg.id)}
                    onRemove={onRemove}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            )}

            {previewPackageLineItem ? (
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-medium">
                      <Package className="h-4 w-4" />
                      {previewPackageLineItem.name}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {previewPackageLineItem.appliedTierLabel ??
                        previewPackageLineItem.notes ??
                        `${formatUsd(previewPackageLineItem.unitPrice)}/person`}{" "}
                      × {previewGuestCount} guests
                    </p>
                    {previewPackageLineItem.package?.items?.length ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Includes: {formatIncludedItems(previewPackageLineItem.package.items)}
                      </p>
                    ) : null}
                  </div>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatUsd(lineItemTotal(previewPackageLineItem, previewGuestCount))}
                  </p>
                </div>
                {!readOnly ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 border-destructive text-destructive hover:bg-destructive/10"
                  onClick={onRemove}
                >
                  Remove package
                </Button>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export function packageSummaryLabel(item: QuoteLineItem, guestCount: number): string {
  if (item.unitType !== "tiered_per_head") return item.name;
  return `${item.name} × ${guestCount} guests`;
}

function activeTierLabel(
  guestCount: number,
  packages: CateringPackage[],
  customerType: "b2b" | "b2c"
): string | null {
  if (guestCount <= 0 || packages.length === 0) return null;
  for (const pkg of packages) {
    const tier = getActiveTier(pkg.tiers, guestCount, customerType);
    if (tier) {
      return `Active tier: ${formatUsd(tier.pricePerHead)}/person (${formatTierRange(tier)} guests)`;
    }
  }
  return null;
}

export { packageLineTotal };
