"use client";

import { Beef, Cake, ChevronDown, Package, Salad, UtensilsCrossed } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { AddItemForm, type AddItemPayload } from "@/components/quote/add-item-form";
import { LineItemRow } from "@/components/quote/line-item-row";
import type { ItemCategory, MenuItem, QuoteLineItem } from "@/components/quote/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { motion } from "@/lib/motion";
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
  customerType?: "b2b" | "b2c";
  readOnly?: boolean;
  catalogItems?: MenuItem[];
  sectionHint?: string;
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
  customerType = "b2c",
  readOnly = false,
  catalogItems,
  sectionHint
}: QuoteSectionProps) {
  const Icon = SECTION_ICONS[category] ?? Package;
  const sectionSubtotal = items.reduce(
    (sum, item) => sum + lineItemTotal(item, guestCount, category),
    0
  );
  const isB2B = customerType === "b2b";
  // B2B hides food à-la-carte adds; equipment / delivery / labor stay editable.
  const canAddItems =
    !isB2B ||
    category === "equipment" ||
    category === "delivery" ||
    category === "labor";

  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange}>
      <Card className={cn("border-l-4", borderClass)}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center justify-between gap-2 p-4 text-left hover:bg-muted/40",
              motion.interactive
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
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
              <ChevronDown className={cn(motion.chevron, isOpen && motion.chevronOpen)} />
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="data-[state=open]:overflow-visible">
          <CardContent className="space-y-3 border-t pt-4">
            {sectionHint ? (
              <p className="text-xs text-muted-foreground">{sectionHint}</p>
            ) : null}
            {!readOnly && canAddItems ? (
              <AddItemForm
                category={category}
                existingItems={items}
                catalogItems={catalogItems}
                onAdd={onAdd}
              />
            ) : null}

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
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
