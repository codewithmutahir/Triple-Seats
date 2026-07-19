"use client";

import { Check, Loader2, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { CateringPackage, ItemCategory, MenuItem } from "@/components/quote/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { PACKAGE_ITEM_SECTIONS } from "@/lib/event-customer-types";
import { expandPackageSlotLabels } from "@/lib/menu-preference-slots";
import type { MenuPreferenceEntry } from "@/lib/menu-preference-types";
import { cn } from "@/lib/utils";

export type PackageSelectionModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  pkg: CateringPackage | null;
  menuItemsByCategory: Partial<Record<ItemCategory, MenuItem[]>>;
  existingPreferences?: MenuPreferenceEntry[];
  confirming?: boolean;
  onConfirm: (preferences: MenuPreferenceEntry[]) => void;
};

type SelectedEntry = { id: string; name: string };

function categoryForLabel(label: string): ItemCategory | null {
  return PACKAGE_ITEM_SECTIONS[label] ?? null;
}

function prefsToSelections(
  packageItems: { label: string; quantity: number }[],
  preferences: MenuPreferenceEntry[],
  menuItemsByCategory: Partial<Record<ItemCategory, MenuItem[]>>
): Record<string, SelectedEntry[]> {
  const result: Record<string, SelectedEntry[]> = {};
  const prefNamesByLabel = new Map<string, string[]>();

  for (const pref of preferences) {
    const match = pref.slotLabel.match(/^(.+?) Slot \d+$/);
    const label = match?.[1] ?? pref.slotLabel;
    const list = prefNamesByLabel.get(label) ?? [];
    if (pref.selectedItem?.trim()) list.push(pref.selectedItem.trim());
    prefNamesByLabel.set(label, list);
  }

  for (const item of packageItems) {
    const category = categoryForLabel(item.label);
    const options = category ? (menuItemsByCategory[category] ?? []) : [];
    const byName = new Map(options.map((o) => [o.name, o] as const));
    const fromPrefs = prefNamesByLabel.get(item.label) ?? [];
    const selected: SelectedEntry[] = [];

    for (const name of fromPrefs) {
      if (selected.length >= item.quantity) break;
      const match = byName.get(name);
      if (match && !selected.some((s) => s.id === match.id)) {
        selected.push({ id: match.id, name: match.name });
      }
    }

    // Fill remaining slots with catalog defaults
    for (const opt of options) {
      if (selected.length >= item.quantity) break;
      if (!selected.some((s) => s.id === opt.id)) {
        selected.push({ id: opt.id, name: opt.name });
      }
    }

    result[item.label] = selected;
  }

  return result;
}

function selectionsToPreferences(
  packageItems: { label: string; quantity: number }[],
  selectedByLabel: Record<string, SelectedEntry[]>
): MenuPreferenceEntry[] | null {
  const preferences: MenuPreferenceEntry[] = [];

  for (const item of packageItems) {
    const selected = selectedByLabel[item.label] ?? [];
    if (selected.length < item.quantity) return null;

    const slots = expandPackageSlotLabels([{ label: item.label, quantity: item.quantity }]);
    for (let i = 0; i < slots.length; i++) {
      const entry = selected[i];
      if (!entry) return null;
      preferences.push({ slotLabel: slots[i]!, selectedItem: entry.name });
    }
  }

  return preferences;
}

export function PackageSelectionModal({
  open,
  onOpenChange,
  mode,
  pkg,
  menuItemsByCategory,
  existingPreferences = [],
  confirming = false,
  onConfirm
}: PackageSelectionModalProps) {
  const [selectedByLabel, setSelectedByLabel] = useState<Record<string, SelectedEntry[]>>({});
  const [error, setError] = useState<string | null>(null);

  const packageItems = useMemo(
    () => (pkg?.items ?? []).map((i) => ({ label: i.label, quantity: i.quantity, id: i.id })),
    [pkg?.items]
  );

  useEffect(() => {
    if (!open || !pkg) return;
    setSelectedByLabel(
      prefsToSelections(
        packageItems.map((i) => ({ label: i.label, quantity: i.quantity })),
        existingPreferences,
        menuItemsByCategory
      )
    );
    setError(null);
  }, [open, pkg?.id, packageItems, existingPreferences, menuItemsByCategory]);

  function toggleItem(label: string, quantity: number, item: MenuItem) {
    setSelectedByLabel((prev) => {
      const current = prev[label] ?? [];
      const exists = current.some((s) => s.id === item.id);
      if (exists) {
        return { ...prev, [label]: current.filter((s) => s.id !== item.id) };
      }
      if (current.length >= quantity) return prev;
      return { ...prev, [label]: [...current, { id: item.id, name: item.name }] };
    });
    setError(null);
  }

  function handleConfirm() {
    if (!pkg) return;
    const preferences = selectionsToPreferences(
      packageItems.map((i) => ({ label: i.label, quantity: i.quantity })),
      selectedByLabel
    );
    if (!preferences) {
      setError("Select the required number of dishes for every category.");
      return;
    }
    setError(null);
    onConfirm(preferences);
  }

  const title =
    mode === "edit"
      ? `Edit Menu Selections — ${pkg?.name ?? "Package"}`
      : `Select Menu Items — ${pkg?.name ?? "Package"}`;

  const allComplete = packageItems.every((item) => {
    const selected = selectedByLabel[item.label] ?? [];
    return selected.length >= item.quantity;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100%-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:rounded-lg">
        <DialogHeader className="shrink-0 border-b px-4 py-4 sm:px-6">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Tap badges to pick dishes for each category. These appear on the kitchen sheet.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          {!pkg ? (
            <p className="text-sm text-muted-foreground">No package selected.</p>
          ) : packageItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">This package has no menu slots.</p>
          ) : (
            <ul className="space-y-3">
              {packageItems.map((item) => {
                const category = categoryForLabel(item.label);
                const options = category ? (menuItemsByCategory[category] ?? []) : [];
                const selected = selectedByLabel[item.label] ?? [];
                const selectedIds = new Set(selected.map((s) => s.id));
                const available = options.filter((o) => !selectedIds.has(o.id));
                const complete = selected.length >= item.quantity;
                const remaining = item.quantity - selected.length;

                return (
                  <li key={item.id ?? item.label} className="rounded-lg border bg-muted/20 p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[#1B2A4A]">{item.label}</span>
                        <Badge
                          variant={complete ? "default" : "secondary"}
                          className={cn(
                            "text-xs",
                            complete && "bg-emerald-600 hover:bg-emerald-600"
                          )}
                        >
                          {selected.length}/{item.quantity} selected
                        </Badge>
                      </div>
                      {complete ? (
                        <span className="text-xs font-medium text-emerald-700">Complete</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Select {remaining} more
                        </span>
                      )}
                    </div>

                    {selected.length > 0 ? (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {selected.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            disabled={confirming}
                            onClick={() => {
                              const menuItem = options.find((o) => o.id === entry.id);
                              if (menuItem) toggleItem(item.label, item.quantity, menuItem);
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900 transition-colors hover:bg-emerald-100"
                          >
                            <Check className="h-3 w-3 text-emerald-600" aria-hidden />
                            {entry.name}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {!complete && available.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {available.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={confirming}
                            onClick={() => toggleItem(item.label, item.quantity, opt)}
                            className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs transition-colors hover:border-[#1B2A4A]/40 hover:bg-[#1B2A4A]/5"
                          >
                            <Plus className="h-3 w-3 text-muted-foreground" aria-hidden />
                            {opt.name}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {options.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No catalog items for this category.
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t px-4 py-4 sm:px-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={confirming}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={confirming || !pkg || !allComplete}
          >
            {confirming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : mode === "edit" ? (
              "Save Changes"
            ) : (
              "Confirm & Add Package"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
