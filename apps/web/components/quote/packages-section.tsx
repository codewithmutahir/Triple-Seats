"use client";

import { Check, ChevronDown, Info, Package } from "lucide-react";
import { useEffect, useState } from "react";

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
  loading?: boolean;
  guestCountSaving?: boolean;
  onGuestCountChange: (guestCount: number) => void;
  onAdd: (packageId: string) => void;
  onRemove: () => void;
  actionLoading?: boolean;
};

function formatIncludedItems(items: CateringPackage["items"]): string {
  return items
    .map((item) => (item.quantity > 1 ? `${item.label} ×${item.quantity}` : item.label))
    .join(", ");
}

function PackageCard({
  pkg,
  guestCount,
  customerType,
  isAdded,
  disabled,
  onAdd,
  onRemove,
  onSelectTier,
  actionLoading
}: {
  pkg: CateringPackage;
  guestCount: number;
  customerType: "b2b" | "b2c";
  isAdded: boolean;
  disabled: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onSelectTier: (guestCount: number) => void;
  actionLoading?: boolean;
}) {
  const [tiersOpen, setTiersOpen] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const activeTier = getActiveTier(pkg.tiers, guestCount, customerType);
  const itemCount = pkg.items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <Card className={cn("flex flex-col", isAdded && "border-primary ring-1 ring-primary/20")}>
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-heading text-lg font-semibold">{pkg.name}</h3>
            <p className="text-sm text-muted-foreground">{itemCount} items</p>
          </div>
          {isAdded ? (
            <Badge className="shrink-0 bg-emerald-600 hover:bg-emerald-600">Added ✓</Badge>
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
            <p className="text-xs text-muted-foreground">
              ({formatTierRange(activeTier)} guests)
            </p>
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
                    onClick={() => onSelectTier(guestCountForTier(tier))}
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

        {isAdded ? (
          <Button
            type="button"
            variant="outline"
            className="mt-auto border-destructive text-destructive hover:bg-destructive/10"
            disabled={actionLoading}
            onClick={onRemove}
          >
            Remove
          </Button>
        ) : (
          <Button
            type="button"
            className="mt-auto"
            disabled={disabled || actionLoading || !activeTier}
            onClick={onAdd}
          >
            Add Package
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function PackagesSection({
  packages,
  guestCount,
  customerType = "b2c",
  packageLineItem,
  loading,
  guestCountSaving,
  onGuestCountChange,
  onAdd,
  onRemove,
  actionLoading
}: PackagesSectionProps) {
  const [sectionOpen, setSectionOpen] = useState(true);
  const [guestInput, setGuestInput] = useState(String(guestCount || ""));
  const minGuests = packages[0]?.minGuests ?? 200;
  const belowMinimum = guestCount > 0 && guestCount < minGuests;
  const addedPackageId = packageLineItem?.packageId ?? null;

  useEffect(() => {
    setGuestInput(String(guestCount || ""));
  }, [guestCount]);

  function commitGuestInput() {
    const parsed = parseInt(guestInput, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setGuestInput(String(guestCount || ""));
      return;
    }
    if (parsed !== guestCount) {
      onGuestCountChange(parsed);
    }
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
              {packageLineItem ? (
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
              <Input
                id="package-guest-count"
                type="number"
                min={0}
                step={1}
                value={guestInput}
                disabled={guestCountSaving}
                onChange={(e) => setGuestInput(e.target.value)}
                onBlur={commitGuestInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitGuestInput();
                  }
                }}
                placeholder={`e.g. ${minGuests}`}
              />
              {guestCountSaving ? (
                <p className="text-xs text-muted-foreground">Updating tiers…</p>
              ) : activeTierLabel(guestCount, packages, customerType) ? (
                <p className="text-xs text-muted-foreground">{activeTierLabel(guestCount, packages, customerType)}</p>
              ) : guestCount > 0 ? (
                <p className="text-xs text-amber-700">No package tier matches this guest count.</p>
              ) : (
                <p className="text-xs text-muted-foreground">Enter guests to preview package pricing.</p>
              )}
            </div>

            {belowMinimum ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Packages require minimum {minGuests} guests. Current event has{" "}
                <span className="font-semibold">{guestCount}</span> guests.
              </div>
            ) : null}

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
                    guestCount={guestCount}
                    customerType={customerType}
                    isAdded={addedPackageId === pkg.id}
                    disabled={belowMinimum || guestCount <= 0}
                    actionLoading={actionLoading}
                    onSelectTier={onGuestCountChange}
                    onAdd={() => onAdd(pkg.id)}
                    onRemove={onRemove}
                  />
                ))}
              </div>
            )}

            {packageLineItem ? (
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-medium">
                      <Package className="h-4 w-4" />
                      {packageLineItem.name}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {packageLineItem.appliedTierLabel ??
                        packageLineItem.notes ??
                        `${formatUsd(packageLineItem.unitPrice)}/person`}{" "}
                      × {guestCount} guests
                    </p>
                    {packageLineItem.package?.items?.length ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Includes: {formatIncludedItems(packageLineItem.package.items)}
                      </p>
                    ) : null}
                  </div>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatUsd(lineItemTotal(packageLineItem, guestCount))}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 border-destructive text-destructive hover:bg-destructive/10"
                  disabled={actionLoading}
                  onClick={onRemove}
                >
                  Remove package
                </Button>
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
  const suffix = item.appliedTierLabel ?? item.notes ?? `${formatUsd(item.unitPrice)}/person`;
  return `${item.name} · ${suffix} × ${guestCount} guests`;
}

function activeTierLabel(
  guestCount: number,
  packages: CateringPackage[],
  customerType: "b2b" | "b2c"
): string | null {
  if (guestCount <= 0 || packages.length === 0) return null;
  const tier = getActiveTier(packages[0]!.tiers, guestCount, customerType);
  if (!tier) return null;
  return `Active tier: ${formatUsd(tier.pricePerHead)}/person (${formatTierRange(tier)} guests)`;
}

export { packageLineTotal };
