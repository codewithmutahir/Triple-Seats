"use client";

import { Check, ChevronDown, Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import type { MenuItem, PackageIncludedItem } from "@/components/quote/types";
import type { UiPackageSelectionEntry } from "@/lib/package-selections";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { motion } from "@/lib/motion";
import { formatUsd } from "@/lib/quote-totals";
import { cn } from "@/lib/utils";

const PACKAGE_CATEGORY_LABELS: Record<string, string> = {
  Appetizer: "appetizer",
  "Veg Gravy": "veg_gravy",
  "Chicken Gravy": "chicken_gravy",
  "Mutton Gravy": "mutton_gravy",
  "Rice Chicken": "rice_chicken",
  "Rice Mutton": "rice_mutton",
  BBQ: "bbq",
  Grill: "bbq",
  Dessert: "dessert",
  Naan: "breads",
  Salad: "side_items",
  Raita: "side_items",
  "Mirchi Ka Salan": "side_items",
  Beverages: "beverages"
};

function isCategoryLabel(label: string): boolean {
  return label in PACKAGE_CATEGORY_LABELS;
}

type PackageItemSelectorProps = {
  includedItem: PackageIncludedItem;
  catalogItems: MenuItem[];
  selectedItemIds: string[];
  onSelect: (item: MenuItem) => void;
  onDeselect: (itemId: string) => void;
  disabled?: boolean;
};

export function PackageItemSelector({
  includedItem,
  catalogItems,
  selectedItemIds,
  onSelect,
  onDeselect,
  disabled
}: PackageItemSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const allowedCount = includedItem.quantity;
  const currentCount = selectedItemIds.length;
  const canSelectMore = currentCount < allowedCount;
  const isCategory = isCategoryLabel(includedItem.label);

  const selectedItems = useMemo(
    () => catalogItems.filter((item) => selectedItemIds.includes(item.id)),
    [catalogItems, selectedItemIds]
  );

  const availableItems = useMemo(
    () => catalogItems.filter((item) => !selectedItemIds.includes(item.id)),
    [catalogItems, selectedItemIds]
  );

  const handleToggle = useCallback(
    (itemId: string) => {
      if (selectedItemIds.includes(itemId)) {
        onDeselect(itemId);
      } else if (canSelectMore) {
        const menuItem = catalogItems.find((item) => item.id === itemId);
        if (menuItem) onSelect(menuItem);
      }
    },
    [selectedItemIds, canSelectMore, onSelect, onDeselect]
  );

  if (!isCategory) {
    return (
      <li className="flex items-center justify-between gap-2 rounded-md border bg-emerald-50/50 px-3 py-2 text-sm">
        <span className="flex items-center gap-2 font-medium text-emerald-900">
          <Check className="h-4 w-4 text-emerald-600" aria-hidden />
          {includedItem.label}
          {includedItem.quantity > 1 ? ` × ${includedItem.quantity}` : ""}
        </span>
        <span className="text-xs text-muted-foreground">Included in package</span>
      </li>
    );
  }

  return (
    <li className="rounded-md border bg-muted/30">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/50"
            disabled={disabled}
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">
                {includedItem.label}
              </span>
              <Badge
                variant={currentCount >= allowedCount ? "default" : "secondary"}
                className={cn(
                  "text-xs",
                  currentCount >= allowedCount
                    ? "bg-emerald-600 hover:bg-emerald-600"
                    : ""
                )}
              >
                {currentCount}/{allowedCount} selected
              </Badge>
            </div>
            <ChevronDown className={cn(motion.chevron, isOpen && motion.chevronOpen)} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2 border-t px-3 py-2">
            {selectedItems.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Selected items:
                </p>
                {selectedItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleToggle(item.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-md border bg-emerald-50 px-2 py-1.5 text-sm transition-colors hover:bg-emerald-100"
                  >
                    <span className="flex items-center gap-2 font-medium text-emerald-900">
                      <Check className="h-4 w-4 text-emerald-600" />
                      {item.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Click to remove
                    </span>
                  </button>
                ))}
              </div>
            )}

            {canSelectMore && availableItems.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {selectedItems.length > 0
                    ? `Select ${allowedCount - currentCount} more:`
                    : `Select ${allowedCount} item${allowedCount > 1 ? "s" : ""}:`}
                </p>
                <div className="flex flex-wrap gap-1">
                  {availableItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleToggle(item.id)}
                      className="flex items-center gap-1 rounded-full border bg-background px-2 py-1 text-xs transition-colors hover:bg-primary/10 hover:border-primary"
                    >
                      <Plus className="h-3 w-3" />
                      {item.name}
                      {item.defaultPrice != null && (
                        <span className="text-muted-foreground">
                          {formatUsd(item.defaultPrice)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!canSelectMore && (
              <p className="text-xs text-emerald-700">
                All {allowedCount} item{allowedCount > 1 ? "s" : ""} selected
              </p>
            )}

            {availableItems.length === 0 && selectedItems.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No items available in catalog for this category.
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

type PackageItemsSectionProps = {
  includedItems: PackageIncludedItem[];
  catalogItems: MenuItem[];
  packageName: string;
  selectedPackageItems: Record<string, UiPackageSelectionEntry[]>;
  onPackageItemsChange: (selections: Record<string, UiPackageSelectionEntry[]>) => void;
  disabled?: boolean;
};

export function PackageItemsSection({
  includedItems,
  catalogItems,
  packageName,
  selectedPackageItems,
  onPackageItemsChange,
  disabled
}: PackageItemsSectionProps) {
  const handleSelect = useCallback(
    (itemLabel: string, menuItem: MenuItem) => {
      const current = selectedPackageItems[itemLabel] ?? [];
      const updated = {
        ...selectedPackageItems,
        [itemLabel]: [...current, { id: menuItem.id, name: menuItem.name }]
      };
      onPackageItemsChange(updated);
    },
    [selectedPackageItems, onPackageItemsChange]
  );

  const handleDeselect = useCallback(
    (itemLabel: string, menuItemId: string) => {
      const current = selectedPackageItems[itemLabel] ?? [];
      const updated = {
        ...selectedPackageItems,
        [itemLabel]: current.filter((entry) => entry.id !== menuItemId)
      };
      onPackageItemsChange(updated);
    },
    [selectedPackageItems, onPackageItemsChange]
  );

  return (
    <ul className="space-y-2">
      {includedItems.map((item) => (
        <PackageItemSelector
          key={item.id}
          includedItem={item}
          catalogItems={catalogItems}
          selectedItemIds={(selectedPackageItems[item.label] ?? []).map((entry) => entry.id)}
          onSelect={(menuItem) => handleSelect(item.label, menuItem)}
          onDeselect={(menuItemId) => handleDeselect(item.label, menuItemId)}
          disabled={disabled}
        />
      ))}
    </ul>
  );
}
