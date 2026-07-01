"use client";

import { Beef, Cake, ChevronDown, Package, Salad, UtensilsCrossed } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { AddItemForm, type AddItemPayload } from "@/components/quote/add-item-form";
import { LineItemRow } from "@/components/quote/line-item-row";
import type { ItemCategory, QuoteLineItem } from "@/components/quote/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatUsd, lineItemTotal } from "@/lib/quote-totals";
import { cn } from "@/lib/utils";

const SECTION_ICONS: Record<string, LucideIcon> = {
  appetizer: Salad,
  main_course: UtensilsCrossed,
  bbq: Beef,
  dessert: Cake,
  equipment: Package
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
  tempItemIds: Set<string>;
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
  tempItemIds
}: QuoteSectionProps) {
  const Icon = SECTION_ICONS[category] ?? Package;
  const sectionSubtotal = items.reduce((sum, item) => sum + lineItemTotal(item, guestCount), 0);

  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange}>
      <Card className={cn("border-l-4", borderClass)}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 p-4 text-left hover:bg-muted/40"
          >
            <div className="flex items-center gap-2">
              <Icon className="h-5 w-5 text-primary" />
              <span className="font-medium">{label}</span>
              <Badge variant="secondary" className="ml-1">
                {items.length}
              </Badge>
            </div>
            <div className="flex items-center gap-3">
              {items.length > 0 ? (
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
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            ) : (
              <ul className="space-y-2">
                {items.map((item) => (
                  <LineItemRow
                    key={item.id}
                    item={item}
                    guestCount={guestCount}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    isTemp={tempItemIds.has(item.id)}
                  />
                ))}
              </ul>
            )}

            <AddItemForm
              category={category}
              existingItems={items}
              onAdd={onAdd}
            />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
