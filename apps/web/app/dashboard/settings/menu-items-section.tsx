"use client";

import { useCallback, useEffect, useState } from "react";
import { Edit2, Loader2, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ItemCategory =
  | "appetizer"
  | "main_course"
  | "bbq"
  | "dessert"
  | "equipment"
  | "delivery"
  | "other";

type QuoteUnit = "per_head" | "by_tray" | "flat";

type MenuItem = {
  id: string;
  catererId: string;
  category: ItemCategory;
  name: string;
  defaultPrice: number | null;
  defaultUnit: QuoteUnit;
  usageCount: number;
  isDefault: boolean;
};

const CATEGORIES: { value: ItemCategory; label: string }[] = [
  { value: "appetizer", label: "Appetizers" },
  { value: "main_course", label: "Main Course" },
  { value: "bbq", label: "BBQ" },
  { value: "dessert", label: "Desserts" },
  { value: "equipment", label: "Equipment" },
  { value: "delivery", label: "Delivery" },
  { value: "other", label: "Other" },
];

const UNITS: { value: QuoteUnit; label: string }[] = [
  { value: "per_head", label: "Per Head" },
  { value: "by_tray", label: "By Tray" },
  { value: "flat", label: "Flat Rate" },
];

function formatPrice(price: number | null, unit: QuoteUnit): string {
  if (price === null) return "—";
  const unitLabel = unit === "per_head" ? "/head" : unit === "by_tray" ? "/tray" : "";
  return `$${price.toFixed(2)}${unitLabel}`;
}

type ItemFormData = {
  name: string;
  defaultPrice: string;
  defaultUnit: QuoteUnit;
  category: ItemCategory;
};

function ItemFormDialog({
  open,
  onOpenChange,
  editingItem,
  category,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingItem: MenuItem | null;
  category: ItemCategory;
  onSave: (data: ItemFormData, id: string | null) => Promise<void>;
}) {
  const [form, setForm] = useState<ItemFormData>({
    name: "",
    defaultPrice: "",
    defaultUnit: "per_head",
    category,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingItem) {
      setForm({
        name: editingItem.name,
        defaultPrice: editingItem.defaultPrice?.toString() ?? "",
        defaultUnit: editingItem.defaultUnit,
        category: editingItem.category,
      });
    } else {
      setForm({
        name: "",
        defaultPrice: "",
        defaultUnit: category === "equipment" ? "flat" : "per_head",
        category,
      });
    }
    setError(null);
  }, [editingItem, category, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Item name is required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(form, editingItem?.id ?? null);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editingItem ? "Edit Item" : "Add Item"}</DialogTitle>
          <DialogDescription>
            {editingItem
              ? "Update the item details and pricing"
              : "Add a new item to your menu catalog"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="item-name">Item Name</Label>
            <Input
              id="item-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Chicken Biryani"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="item-price">Default Price</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="item-price"
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.defaultPrice}
                  onChange={(e) => setForm((f) => ({ ...f, defaultPrice: e.target.value }))}
                  className="pl-7"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-unit">Unit Type</Label>
              <Select
                value={form.defaultUnit}
                onValueChange={(v) => setForm((f) => ({ ...f, defaultUnit: v as QuoteUnit }))}
              >
                <SelectTrigger id="item-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!editingItem && (
            <div className="space-y-2">
              <Label htmlFor="item-category">Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v as ItemCategory }))}
              >
                <SelectTrigger id="item-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingItem ? "Save Changes" : "Add Item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ItemRow({
  item,
  onEdit,
  onDelete,
}: {
  item: MenuItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{item.name}</span>
          {item.isDefault && (
            <Badge variant="secondary" className="text-xs">
              Default
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {formatPrice(item.defaultPrice, item.defaultUnit)}
          {item.usageCount > 0 && (
            <span className="ml-2">• Used {item.usageCount} time{item.usageCount !== 1 ? "s" : ""}</span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onEdit}
        >
          <Edit2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function CategorySection({
  category,
  label,
  items,
  onRefresh,
}: {
  category: ItemCategory;
  label: string;
  items: MenuItem[];
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleSave(data: ItemFormData, id: string | null) {
    const body = {
      name: data.name.trim(),
      defaultPrice: data.defaultPrice ? parseFloat(data.defaultPrice) : null,
      defaultUnit: data.defaultUnit,
      category: data.category,
    };

    const res = await fetch(id ? `/api/menu-items/${id}` : "/api/menu-items", {
      method: id ? "PUT" : "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      throw new Error(errorBody.error || "Failed to save item");
    }

    onRefresh();
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/menu-items/${deleteId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to delete");
      }
      onRefresh();
    } catch {
      // Ignore error, will refresh anyway
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/50"
      >
        <div>
          <h4 className="font-medium">{label}</h4>
          <p className="text-sm text-muted-foreground">
            {items.length} item{items.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setEditingItem(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add
          </Button>
          <X
            className={cn(
              "h-4 w-4 rotate-45 text-muted-foreground transition-transform",
              expanded && "rotate-0"
            )}
          />
        </div>
      </button>

      {expanded && (
        <div className="border-t p-4">
          {items.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No items in this category
            </p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onEdit={() => {
                    setEditingItem(item);
                    setDialogOpen(true);
                  }}
                  onDelete={() => setDeleteId(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <ItemFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingItem={editingItem}
        category={category}
        onSave={handleSave}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this menu item? Existing quotes using this item
              will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function MenuItemsSection() {
  const [itemsByCategory, setItemsByCategory] = useState<Record<ItemCategory, MenuItem[]>>({
    appetizer: [],
    main_course: [],
    bbq: [],
    dessert: [],
    equipment: [],
    delivery: [],
    other: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const results = await Promise.all(
        CATEGORIES.map(async (cat) => {
          const res = await fetch(`/api/menu-items?category=${cat.value}`, {
            credentials: "include",
          });
          if (!res.ok) return { category: cat.value, items: [] };
          const data = await res.json();
          return { category: cat.value, items: data.items ?? [] };
        })
      );

      const grouped: Record<ItemCategory, MenuItem[]> = {
        appetizer: [],
        main_course: [],
        bbq: [],
        dessert: [],
        equipment: [],
        delivery: [],
        other: [],
      };

      for (const { category, items } of results) {
        grouped[category as ItemCategory] = items;
      }

      setItemsByCategory(grouped);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  const totalItems = Object.values(itemsByCategory).flat().length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {totalItems} total item{totalItems !== 1 ? "s" : ""} across all categories
      </p>

      <div className="space-y-3">
        {CATEGORIES.map((cat) => (
          <CategorySection
            key={cat.value}
            category={cat.value}
            label={cat.label}
            items={itemsByCategory[cat.value]}
            onRefresh={fetchItems}
          />
        ))}
      </div>
    </div>
  );
}
