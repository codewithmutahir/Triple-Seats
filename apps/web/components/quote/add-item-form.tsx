"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ItemCategory, MenuItem, QuoteLineItem, QuoteUnit } from "@/components/quote/types";
import { UNIT_SHORT } from "@/components/quote/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  createMenuItemIndex,
  highlightName,
  searchMenuItems,
  type SearchableMenuItem
} from "@/lib/menu-item-search";
import { formatUsd } from "@/lib/quote-totals";
import { cn } from "@/lib/utils";
import { parseApiError } from "@/lib/user-facing-error";

export type AddItemPayload = {
  name: string;
  quantity: number;
  unitPrice: number;
  unitType: QuoteUnit;
  menuItemId?: string;
};

type AddItemFormProps = {
  category: ItemCategory;
  existingItems?: QuoteLineItem[];
  onAdd: (payload: AddItemPayload) => void;
  catalogItems?: MenuItem[];
};

async function fetchMenuItems(category: ItemCategory): Promise<{ items: MenuItem[]; error?: string }> {
  try {
    const res = await fetch(`/api/menu-items?category=${encodeURIComponent(category)}`, {
      credentials: "include"
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return { items: [], error: parseApiError(body, res.status, res.statusText) };
    }
    const body = (await res.json()) as { items?: MenuItem[] };
    return { items: body.items ?? [] };
  } catch {
    return { items: [], error: "Could not load menu catalog" };
  }
}

function toSearchableFromCatalog(item: MenuItem): SearchableMenuItem {
  return {
    id: item.id,
    name: item.name,
    defaultPrice: item.defaultPrice,
    defaultUnit: item.defaultUnit,
    usageCount: item.usageCount,
    source: "catalog",
    menuItemId: item.id
  };
}

function toSearchableFromQuote(item: QuoteLineItem): SearchableMenuItem {
  return {
    id: item.menuItemId ?? `quote_${item.id}`,
    name: item.name,
    defaultPrice: item.unitPrice,
    defaultUnit: item.unitType,
    usageCount: 999,
    source: "quote",
    menuItemId: item.menuItemId ?? undefined
  };
}

function HighlightedName({ name, query }: { name: string; query: string }) {
  const parts = highlightName(name, query);
  return (
    <span>
      {parts.map((part, i) =>
        part.match ? (
          <mark key={i} className="rounded-sm bg-primary/15 px-0.5 font-medium text-foreground">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  );
}

export function AddItemForm({
  category,
  existingItems = [],
  onAdd,
  catalogItems
}: AddItemFormProps) {
  const [menuItems, setMenuItems] = useState<MenuItem[]>(catalogItems ?? []);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedItem, setSelectedItem] = useState<SearchableMenuItem | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [unitType, setUnitType] = useState<QuoteUnit>("per_head");
  const [unitPrice, setUnitPrice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (catalogItems) {
      setMenuItems(catalogItems);
      setCatalogError(null);
      return;
    }

    let cancelled = false;
    fetchMenuItems(category).then(({ items, error }) => {
      if (cancelled) return;
      setMenuItems(items);
      setCatalogError(error ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [category, catalogItems]);

  const allSearchable = useMemo(() => {
    const seen = new Set<string>();
    const merged: SearchableMenuItem[] = [];

    for (const line of existingItems) {
      const key = line.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(toSearchableFromQuote(line));
    }

    for (const item of menuItems) {
      const key = item.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(toSearchableFromCatalog(item));
    }

    return merged;
  }, [existingItems, menuItems]);

  const searchIndex = useMemo(
    () => createMenuItemIndex(allSearchable),
    [allSearchable]
  );

  const dropdownItems = useMemo(
    () => searchMenuItems(searchIndex, allSearchable, search),
    [searchIndex, allSearchable, search]
  );

  const exactMatch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return false;
    return allSearchable.some((m) => m.name.toLowerCase() === q);
  }, [allSearchable, search]);

  const quickAddItems = useMemo(() => searchMenuItems(searchIndex, allSearchable, "", 4), [searchIndex, allSearchable]);

  const selectableCount = dropdownItems.length + (!exactMatch && search.trim() ? 1 : 0);

  const selectItem = useCallback((item: SearchableMenuItem) => {
    setSelectedItem(item);
    setSearch(item.name);
    setUnitType(item.defaultUnit as QuoteUnit);
    setUnitPrice(item.defaultPrice != null ? String(item.defaultPrice) : "");
    setShowForm(true);
    setShowDropdown(false);
    setActiveIndex(-1);
  }, []);

  const resetForm = useCallback(() => {
    setSearch("");
    setSelectedItem(null);
    setQuantity("1");
    setUnitType("per_head");
    setUnitPrice("");
    setShowForm(false);
    setShowDropdown(false);
    setActiveIndex(-1);
  }, []);

  const refreshCatalog = useCallback(async () => {
    const { items, error } = await fetchMenuItems(category);
    setMenuItems(items);
    setCatalogError(error ?? null);
  }, [category]);

  const submitItem = useCallback(
    async (payload: AddItemPayload, menuItemId?: string) => {
      onAdd({ ...payload, menuItemId });
      if (menuItemId && !menuItemId.startsWith("quote_")) {
        void fetch(`/api/menu-items/${encodeURIComponent(menuItemId)}/increment`, {
          method: "PATCH",
          credentials: "include"
        });
      }
      resetForm();
      void refreshCatalog();
    },
    [onAdd, resetForm, refreshCatalog]
  );

  const handleAddToQuote = useCallback(async () => {
    const name = search.trim();
    const price = parseFloat(unitPrice);
    const qty = parseFloat(quantity) || 1;
    if (!name || !Number.isFinite(price)) return;

    const catalogId =
      selectedItem?.menuItemId ??
      (selectedItem && !selectedItem.id.startsWith("quote_") ? selectedItem.id : undefined);

    if (catalogId) {
      await submitItem(
        { name, quantity: qty, unitPrice: price, unitType, menuItemId: catalogId },
        catalogId
      );
      return;
    }

    const res = await fetch("/api/menu-items", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, name, defaultPrice: price, defaultUnit: unitType })
    });
    if (res.ok) {
      const body = (await res.json()) as { item?: MenuItem };
      const newId = body.item?.id;
      await submitItem({ name, quantity: qty, unitPrice: price, unitType, menuItemId: newId }, newId);
    } else {
      await submitItem({ name, quantity: qty, unitPrice: price, unitType });
    }
  }, [search, unitPrice, quantity, unitType, selectedItem, category, submitItem]);

  const handleQuickAdd = useCallback(
    (item: SearchableMenuItem) => {
      const price = item.defaultPrice ?? 0;
      const menuItemId = item.menuItemId ?? (item.id.startsWith("quote_") ? undefined : item.id);
      void submitItem(
        {
          name: item.name,
          quantity: 1,
          unitPrice: price,
          unitType: item.defaultUnit as QuoteUnit,
          menuItemId
        },
        menuItemId
      );
    },
    [submitItem]
  );

  const openCustomForm = useCallback(() => {
    setSelectedItem(null);
    setShowForm(true);
    setShowDropdown(false);
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-option-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showDropdown && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        setShowDropdown(true);
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % Math.max(selectableCount, 1));
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i <= 0 ? selectableCount - 1 : i - 1));
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < dropdownItems.length) {
          selectItem(dropdownItems[activeIndex]!);
        } else if (activeIndex === dropdownItems.length && !exactMatch && search.trim()) {
          openCustomForm();
        } else if (dropdownItems[0] && !showForm) {
          selectItem(dropdownItems[0]);
        }
        return;
      }

      if (e.key === "Escape") {
        setShowDropdown(false);
        setActiveIndex(-1);
      }
    },
    [
      showDropdown,
      selectableCount,
      activeIndex,
      dropdownItems,
      exactMatch,
      search,
      showForm,
      selectItem,
      openCustomForm
    ]
  );

  return (
    <div ref={containerRef} className="relative space-y-3">
      <div className="relative isolate">
        <Input
          ref={inputRef}
          placeholder="Search or add item..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelectedItem(null);
            setShowDropdown(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `suggestion-${activeIndex}` : undefined}
        />

        {catalogError ? (
          <p className="mt-1 text-xs text-destructive">{catalogError}</p>
        ) : null}

        {showDropdown ? (
          <div
            ref={listRef}
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover shadow-lg"
            role="listbox"
          >
            {dropdownItems.length === 0 && search.trim() ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">No matches in your menu</p>
            ) : null}

            {dropdownItems.map((item, i) => (
              <button
                key={item.id}
                id={`suggestion-${i}`}
                data-option-index={i}
                type="button"
                role="option"
                aria-selected={activeIndex === i}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors",
                  activeIndex === i ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                )}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => selectItem(item)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <HighlightedName name={item.name} query={search} />
                  {item.source === "quote" ? (
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      on quote
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {item.defaultPrice != null
                    ? `${formatUsd(item.defaultPrice)} / ${UNIT_SHORT[item.defaultUnit as QuoteUnit]}`
                    : "—"}
                </span>
              </button>
            ))}

            {!exactMatch && search.trim() ? (
              <button
                type="button"
                data-option-index={dropdownItems.length}
                role="option"
                aria-selected={activeIndex === dropdownItems.length}
                className={cn(
                  "flex w-full items-center gap-1 border-t px-3 py-2.5 text-left text-sm text-primary transition-colors",
                  activeIndex === dropdownItems.length ? "bg-accent" : "hover:bg-muted"
                )}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(dropdownItems.length)}
                onClick={openCustomForm}
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                Add &quot;{search.trim()}&quot; as custom item
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {quickAddItems.length > 0 && !showDropdown && !showForm ? (
        <div className="flex flex-wrap gap-2">
          {quickAddItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="rounded-full border bg-background px-3 py-1 text-xs transition-colors hover:bg-muted"
              onClick={() => handleQuickAdd(item)}
            >
              {item.name}
              {item.defaultPrice != null ? ` · ${formatUsd(item.defaultPrice)}` : ""}
            </button>
          ))}
        </div>
      ) : null}

      {showForm ? (
        <div className="grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-3">
          <div>
            <Label>Quantity</Label>
            <Input
              type="number"
              min={0}
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div>
            <Label>Unit</Label>
            <Select value={unitType} onValueChange={(v) => setUnitType(v as QuoteUnit)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="per_head">Per Head</SelectItem>
                <SelectItem value="by_tray">By Tray</SelectItem>
                <SelectItem value="flat">Flat Rate</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Price</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="flex gap-2 sm:col-span-3">
            <Button type="button" onClick={() => void handleAddToQuote()}>
              Add to Quote
            </Button>
            <Button type="button" variant="outline" onClick={resetForm}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
