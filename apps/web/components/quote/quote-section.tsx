"use client";

import { Beef, Cake, ChevronDown, Info, Package, Salad, UtensilsCrossed } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { AddItemForm, type AddItemPayload } from "@/components/quote/add-item-form";
import { LineItemRow } from "@/components/quote/line-item-row";
import { PackageItemsSection } from "@/components/quote/package-item-selector";
import type { ItemCategory, MenuItem, PackageIncludedItem, QuoteLineItem } from "@/components/quote/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatUsd, lineItemTotal } from "@/lib/quote-totals";
import { cn } from "@/lib/utils";

const SECTION_ICONS: Record<string, LucideIcon> = {
  appetizer: Salad,
  veg_gravy: UtensilsCrossed,
  chicken_gravy: Beef,
  mutton_gravy: Beef,
  rice_chicken: UtensilsCrossed,
  rice_mutton: UtensilsCrossed,
  breads: UtensilsCrossed,
  side_items: Salad,
  bbq: Beef,
  dessert: Cake,
  beverages: Cake,
  equipment: Package,
  delivery: Package
};

type QuoteSectionProps = {
  category: ItemCategory;
  label: string;
  borderClass: string;
  emptyMessage: string;
  items: QuoteLineItem[];
  guestCount: number;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (payload: AddItemPayload) => void;
  onUpdate: (itemId: string, patch: Partial<Pick<QuoteLineItem, "quantity" | "unitPrice" | "unitType">>) => void;
  onDelete: (itemId: string) => void;
  includedPackageName?: string;
  includedItems?: PackageIncludedItem[];
  catalogItems?: MenuItem[];
  customerType?: "b2b" | "b2c";
  selectedPackageItems?: Record<string, string[]>;
  onPackageItemsChange?: (selections: Record<string, string[]>) => void;
  readOnly?: boolean;
};

export function QuoteSection({
  category,
  label,
  borderClass,
  emptyMessage,
  items,
  guestCount,
  isOpen,
  onOpenChange,
  onAdd,
  onUpdate,
  onDelete,
  includedPackageName,
  includedItems,
  catalogItems,
  customerType = "b2c",
  selectedPackageItems,
  onPackageItemsChange,
  readOnly = false
}: QuoteSectionProps) {
  const Icon = SECTION_ICONS[category] ?? Package;
  const sectionSubtotal = items.reduce(
    (sum, item) => sum + lineItemTotal(item, guestCount, category),
    0
  );
  const isIncludedView = Boolean(includedPackageName && includedItems !== undefined);
  const isB2B = customerType === "b2b";
  const canAddItems = !isB2B || category === "equipment" || category === "delivery";

  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange}>
      <Card className={cn("border-l-4", borderClass)}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 p-4 text-left hover:bg-muted/40"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Icon className="h-5 w-5 text-primary" />
              <span className="font-medium">{label}</span>
              {isIncludedView ? (
                <span className="text-sm text-muted-foreground">
                  · Included in {includedPackageName}
                </span>
              ) : (
                <Badge variant="secondary" className="ml-1">
                  {items.length}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3">
              {!isIncludedView && items.length > 0 ? (
                <span className="text-sm font-medium tabular-nums">{formatUsd(sectionSubtotal)}</span>
              ) : null}
              <ChevronDown
                className={cn("h-4 w-4 transition-transform duration-200", isOpen && "rotate-180")}
              />
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-visible data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <CardContent className="space-y-3 overflow-visible border-t pt-4">
            {isIncludedView ? (
              <>
                <div className="flex gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <p>
                    These items are included in {includedPackageName}. Pricing is covered by the
                    package rate. Select your preferred items below.
                  </p>
                </div>
                {includedItems!.length > 0 ? (
                  onPackageItemsChange ? (
                    <PackageItemsSection
                      includedItems={includedItems!}
                      catalogItems={catalogItems ?? []}
                      packageName={includedPackageName!}
                      selectedPackageItems={selectedPackageItems ?? {}}
                      onPackageItemsChange={onPackageItemsChange}
                      disabled={readOnly}
                    />
                  ) : (
                    <ul className="space-y-2">
                      {includedItems!.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-2 rounded-md border bg-emerald-50/50 px-3 py-2 text-sm"
                        >
                          <span className="flex items-center gap-2 font-medium text-emerald-900">
                            {item.label}
                            {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                          </span>
                          <span className="text-xs text-muted-foreground">Included in package</span>
                        </li>
                      ))}
                    </ul>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">No items in this category for this package.</p>
                )}
              </>
            ) : (
              <>
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{emptyMessage}</p>
                ) : (
                  <ul className="space-y-2">
                    {items.map((item) => (
                      <LineItemRow
                        key={item.id}
                        item={item}
                        guestCount={guestCount}
                        category={category}
                        onUpdate={onUpdate}
                        onDelete={onDelete}
                        readOnly={readOnly}
                      />
                    ))}
                  </ul>
                )}

                {canAddItems && !readOnly ? (
                  <AddItemForm
                    category={category}
                    existingItems={items}
                    onAdd={onAdd}
                    catalogItems={catalogItems}
                  />
                ) : (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    B2B customers can only add packages. Individual items are not available for B2B quotes.
                  </div>
                )}
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
