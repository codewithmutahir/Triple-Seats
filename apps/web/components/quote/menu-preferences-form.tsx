"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { ItemCategory, MenuItem } from "@/components/quote/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { baseSlotLabel, categoryForSlotLabel } from "@/lib/menu-preference-slots";
import type { MenuPreferenceEntry, MenuPreferencesPayload } from "@/lib/menu-preference-types";
import { queryKeys } from "@/lib/query-keys";

type MenuPreferencesFormProps = {
  eventId: string;
  readOnly?: boolean;
  onSaved?: () => void;
  initialData?: MenuPreferencesPayload;
};

function groupSlotsByCategory(
  slotLabels: string[],
  packageItems: { label: string; quantity: number }[]
): { categoryLabel: string; slots: string[] }[] {
  const groups: { categoryLabel: string; slots: string[] }[] = [];
  const seen = new Set<string>();

  for (const item of packageItems) {
    if (seen.has(item.label)) continue;
    seen.add(item.label);
    const slots = slotLabels.filter((s) => baseSlotLabel(s) === item.label);
    if (slots.length === 0) continue;
    groups.push({ categoryLabel: item.label, slots });
  }

  return groups;
}

export function MenuPreferencesForm({
  eventId,
  readOnly = false,
  onSaved,
  initialData
}: MenuPreferencesFormProps) {
  const qc = useQueryClient();
  const key = queryKeys.events.menuPreferences(eventId);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: key,
    queryFn: () => api.events.menuPreferences(eventId),
    enabled: Boolean(eventId) && !initialData,
    staleTime: 60_000
  });

  const payload = initialData ?? data;

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!payload?.hasPackage) return;
    const next: Record<string, string> = {};
    for (const pref of payload.preferences ?? []) {
      next[pref.slotLabel] = pref.selectedItem;
    }
    for (const slot of payload.slotLabels ?? []) {
      if (!next[slot]) next[slot] = "";
    }
    setDraft(next);
    setDirty(false);
  }, [payload?.hasPackage, payload?.preferences, payload?.slotLabels, payload?.packageId]);

  const saveMutation = useMutation({
    mutationFn: (preferences: MenuPreferenceEntry[]) =>
      api.events.updateMenuPreferences(eventId, { preferences }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key });
      setDirty(false);
      toast.success("Menu preferences saved");
      onSaved?.();
    },
    onError: () => {
      toast.error("Failed to save menu preferences");
    }
  });

  const groups = useMemo(() => {
    if (!payload?.hasPackage || !payload.slotLabels || !payload.packageItems) return [];
    return groupSlotsByCategory(payload.slotLabels, payload.packageItems);
  }, [payload]);

  if (isLoading && !initialData) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading menu preferences…
      </div>
    );
  }

  if (isError && !initialData) {
    return (
      <div className="space-y-2 py-4 text-sm">
        <p className="text-destructive">Could not load menu preferences.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!payload?.hasPackage) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        Select a package on the quote to configure menu preferences.
      </p>
    );
  }

  const menuItemsByCategory = payload.menuItemsByCategory ?? {};

  function optionsForSlot(slotLabel: string): MenuItem[] {
    const category = categoryForSlotLabel(baseSlotLabel(slotLabel)) as ItemCategory | null;
    if (!category) return [];
    return menuItemsByCategory[category] ?? [];
  }

  function handleChange(slotLabel: string, value: string) {
    setDraft((prev) => ({ ...prev, [slotLabel]: value }));
    setDirty(true);
  }

  function handleSave() {
    if (!payload?.hasPackage) return;
    const preferences: MenuPreferenceEntry[] = (payload.slotLabels ?? []).map((slotLabel) => ({
      slotLabel,
      selectedItem: draft[slotLabel]?.trim() ?? ""
    }));
    saveMutation.mutate(preferences);
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {payload.packageName} — {payload.configuredCount ?? 0}/{payload.totalSlots ?? 0} slots
        configured
      </p>

      {groups.map((group) => (
        <div key={group.categoryLabel} className="space-y-3">
          <h4 className="text-sm font-medium">
            {group.categoryLabel}
            {group.slots.length > 1 ? ` (×${group.slots.length})` : ""}
          </h4>
          <div className="space-y-3">
            {group.slots.map((slotLabel, index) => {
              const options = optionsForSlot(slotLabel);
              const label =
                group.slots.length > 1 ? `Slot ${index + 1}` : group.categoryLabel;
              return (
                <div key={slotLabel} className="space-y-1.5">
                  <Label htmlFor={`pref-${slotLabel}`} className="text-xs text-muted-foreground">
                    {label}
                  </Label>
                  {readOnly ? (
                    <p className="text-sm font-medium">{draft[slotLabel] || "—"}</p>
                  ) : (
                    <Select
                      value={draft[slotLabel] || undefined}
                      onValueChange={(value) => handleChange(slotLabel, value)}
                    >
                      <SelectTrigger id={`pref-${slotLabel}`}>
                        <SelectValue placeholder="Select item" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((item) => (
                          <SelectItem key={item.id} value={item.name}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {!readOnly ? (
        <Button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saveMutation.isPending}
          className="w-full sm:w-auto"
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            "Save Menu Preferences"
          )}
        </Button>
      ) : null}
    </div>
  );
}

export function menuPreferencesSummary(payload: MenuPreferencesPayload | undefined): string {
  if (!payload?.hasPackage) return "No package selected";
  return `${payload.configuredCount ?? 0}/${payload.totalSlots ?? 0} slots configured`;
}
