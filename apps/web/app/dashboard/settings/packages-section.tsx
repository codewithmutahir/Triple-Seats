"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  Edit2,
  GripVertical,
  Loader2,
  Plus,
  Trash2,
  X
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  useCreatePackageMutation,
  useDeletePackageMutation,
  useSettingsPackagesQuery,
  useUpdatePackageMutation,
  useUpdateTierPriceMutation,
  type PackageWriteBody
} from "@/hooks/use-settings-queries";
import { usePermissions } from "@/hooks/use-permissions";
import type { SettingsPackage } from "@/lib/settings-types";
import {
  KITCHEN_GUEST_BANDS,
  kitchenQtysFromPackage,
  syncKitchenQtyRows,
  uniqueKitchenCategories,
  type KitchenQtyFormRow
} from "@/lib/package-kitchen-qty";
import { formatUsd } from "@/lib/quote-totals";
import { cn } from "@/lib/utils";

type Package = SettingsPackage;

type PackageFormData = {
  name: string;
  description: string;
  minGuests: number;
  items: { label: string; quantity: number }[];
  b2cTiers: { minGuests: number; maxGuests: number | null; pricePerHead: number }[];
  b2bTiers: { minGuests: number; maxGuests: number | null; pricePerHead: number }[];
  kitchenQtys: KitchenQtyFormRow[];
};

const EMPTY_FORM: PackageFormData = {
  name: "",
  description: "",
  minGuests: 200,
  items: [{ label: "", quantity: 1 }],
  b2cTiers: [{ minGuests: 200, maxGuests: 250, pricePerHead: 0 }],
  b2bTiers: [{ minGuests: 200, maxGuests: 250, pricePerHead: 0 }],
  kitchenQtys: []
};

function packageToForm(pkg: Package): PackageFormData {
  const b2cTiers = pkg.tiers
    .filter((t) => t.customerType === "b2c")
    .map((t) => ({
      minGuests: t.minGuests,
      maxGuests: t.maxGuests,
      pricePerHead: t.pricePerHead
    }));
  const b2bTiers = pkg.tiers
    .filter((t) => t.customerType === "b2b")
    .map((t) => ({
      minGuests: t.minGuests,
      maxGuests: t.maxGuests,
      pricePerHead: t.pricePerHead
    }));

  const items = pkg.items.map((i) => ({ label: i.label, quantity: i.quantity }));
  return {
    name: pkg.name,
    description: pkg.description ?? "",
    minGuests: pkg.minGuests,
    items,
    b2cTiers: b2cTiers.length ? b2cTiers : EMPTY_FORM.b2cTiers,
    b2bTiers: b2bTiers.length ? b2bTiers : EMPTY_FORM.b2bTiers,
    kitchenQtys: kitchenQtysFromPackage(
      items.map((i) => i.label),
      pkg.kitchenQtys ?? []
    )
  };
}

function formToBody(data: PackageFormData): PackageWriteBody {
  const items = data.items
    .filter((i) => i.label.trim())
    .map((i, idx) => ({ label: i.label.trim(), quantity: i.quantity, sortOrder: idx }));
  return {
    name: data.name.trim(),
    description: data.description.trim() || null,
    minGuests: data.minGuests,
    items,
    tiers: [
      ...data.b2cTiers.map((t) => ({ ...t, customerType: "b2c" as const })),
      ...data.b2bTiers.map((t) => ({ ...t, customerType: "b2b" as const }))
    ],
    kitchenQtys: syncKitchenQtyRows(
      items.map((i) => i.label),
      data.kitchenQtys
    )
  };
}

function InlinePriceInput({
  value,
  onSave
}: {
  value: number;
  onSave: (price: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  function commit() {
    const parsed = parseFloat(draft);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed !== value) {
      onSave(parsed);
    } else {
      setDraft(String(value));
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <Input
        autoFocus
        type="number"
        min={0}
        step={0.01}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            setDraft(String(value));
            setEditing(false);
          }
        }}
        className="h-7 w-24 tabular-nums"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="font-medium tabular-nums hover:underline"
    >
      {formatUsd(value)}/head
    </button>
  );
}

function TierEditor({
  label,
  tiers,
  onChange
}: {
  label: string;
  tiers: { minGuests: number; maxGuests: number | null; pricePerHead: number }[];
  onChange: (
    tiers: { minGuests: number; maxGuests: number | null; pricePerHead: number }[]
  ) => void;
}) {
  function updateTier(
    index: number,
    field: "minGuests" | "maxGuests" | "pricePerHead",
    value: number | null
  ) {
    const updated = [...tiers];
    updated[index] = { ...updated[index]!, [field]: value };
    onChange(updated);
  }

  function addTier() {
    const lastTier = tiers[tiers.length - 1];
    const nextMin = lastTier?.maxGuests ? lastTier.maxGuests + 1 : 200;
    onChange([
      ...tiers,
      { minGuests: nextMin, maxGuests: nextMin + 100, pricePerHead: lastTier?.pricePerHead ?? 0 }
    ]);
  }

  function removeTier(index: number) {
    if (tiers.length <= 1) return;
    onChange(tiers.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="space-y-2">
        {tiers.map((tier, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              value={tier.minGuests}
              onChange={(e) => updateTier(i, "minGuests", parseInt(e.target.value) || 0)}
              className="w-20"
              placeholder="Min"
            />
            <span className="text-muted-foreground">—</span>
            <Input
              type="number"
              min={0}
              value={tier.maxGuests ?? ""}
              onChange={(e) =>
                updateTier(i, "maxGuests", e.target.value ? parseInt(e.target.value) : null)
              }
              className="w-20"
              placeholder="Max"
            />
            <span className="text-muted-foreground">guests @</span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={tier.pricePerHead}
                onChange={(e) => updateTier(i, "pricePerHead", parseFloat(e.target.value) || 0)}
                className="w-24 pl-7"
                placeholder="0.00"
              />
            </div>
            <span className="text-sm text-muted-foreground">/head</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => removeTier(i)}
              disabled={tiers.length <= 1}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addTier}>
        <Plus className="mr-1 h-3 w-3" />
        Add Tier
      </Button>
    </div>
  );
}

function ItemsEditor({
  items,
  onChange
}: {
  items: { label: string; quantity: number }[];
  onChange: (items: { label: string; quantity: number }[]) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function updateItem(index: number, field: "label" | "quantity", value: string | number) {
    const updated = [...items];
    updated[index] = { ...updated[index]!, [field]: value };
    onChange(updated);
  }

  function addItem() {
    onChange([...items, { label: "", quantity: 1 }]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    onChange(items.filter((_, i) => i !== index));
  }

  function moveItem(from: number, to: number) {
    if (from === to) return;
    const updated = [...items];
    const [moved] = updated.splice(from, 1);
    if (!moved) return;
    updated.splice(to, 0, moved);
    onChange(updated);
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null) return;
    moveItem(dragIndex, targetIndex);
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Included Items</Label>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div
            key={i}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOverIndex(i);
            }}
            onDragLeave={() => {
              if (overIndex === i) setOverIndex(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(i);
            }}
            className={cn(
              "flex items-center gap-2 rounded-md transition-colors",
              dragIndex === i && "opacity-50",
              overIndex === i && dragIndex !== null && dragIndex !== i && "bg-muted/60"
            )}
          >
            <button
              type="button"
              draggable
              aria-label={`Reorder ${item.label || "item"}`}
              onDragStart={(e) => {
                setDragIndex(i);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(i));
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              className="flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground active:cursor-grabbing"
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <Input
              value={item.label}
              onChange={(e) => updateItem(i, "label", e.target.value)}
              placeholder="Item name (e.g. Appetizer, Chicken Gravy)"
              className="flex-1"
            />
            <span className="text-muted-foreground">×</span>
            <Input
              type="number"
              min={1}
              value={item.quantity}
              onChange={(e) => updateItem(i, "quantity", parseInt(e.target.value) || 1)}
              className="w-16"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => removeItem(i)}
              disabled={items.length <= 1}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addItem}>
        <Plus className="mr-1 h-3 w-3" />
        Add Item
      </Button>
    </div>
  );
}

function KitchenQtyEditor({
  categories,
  kitchenQtys,
  onChange
}: {
  categories: string[];
  kitchenQtys: KitchenQtyFormRow[];
  onChange: (rows: KitchenQtyFormRow[]) => void;
}) {
  function qtyFor(category: string, band: number): number {
    return (
      kitchenQtys.find((row) => row.category === category && row.guestBand === band)?.quantity ?? 0
    );
  }

  function updateQty(category: string, band: number, quantity: number) {
    const next = kitchenQtys.filter(
      (row) => !(row.category === category && row.guestBand === band)
    );
    next.push({ category, guestBand: band, quantity: Math.max(0, quantity) });
    onChange(syncKitchenQtyRows(categories, next));
  }

  if (categories.length === 0) {
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium">Kitchen prep quantities</Label>
        <p className="text-sm text-muted-foreground">
          Add included item labels to edit tray quantities by guest band.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm font-medium">Kitchen prep quantities</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Trays (or units) per guest band. Kitchen sheet scales with ceil((guests × qty) / band).
        </p>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Category</th>
              {KITCHEN_GUEST_BANDS.map((band) => (
                <th key={band} className="px-2 py-2 text-center font-medium tabular-nums">
                  {band}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{category}</td>
                {KITCHEN_GUEST_BANDS.map((band) => (
                  <td key={band} className="px-1 py-1.5">
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={qtyFor(category, band)}
                      onChange={(e) =>
                        updateQty(category, band, parseFloat(e.target.value) || 0)
                      }
                      className="h-8 w-16 mx-auto text-center tabular-nums"
                      aria-label={`${category} qty for ${band} guests`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PackageFormDialog({
  open,
  onOpenChange,
  initialData,
  editingId,
  onSave
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData: PackageFormData;
  editingId: string | null;
  onSave: (data: PackageFormData, id: string | null) => Promise<void>;
}) {
  const [form, setForm] = useState<PackageFormData>(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(initialData);
    setError(null);
  }, [initialData, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Package name is required");
      return;
    }
    if (form.items.every((i) => !i.label.trim())) {
      setError("At least one item with a name is required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(form, editingId);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save package");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit Package" : "Create Package"}</DialogTitle>
          <DialogDescription>
            Configure package details, included items, kitchen prep quantities, and pricing tiers
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pkg-name">Package Name</Label>
              <Input
                id="pkg-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Package 1, Premium Package"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pkg-min-guests">Minimum Guests</Label>
              <Input
                id="pkg-min-guests"
                type="number"
                min={1}
                value={form.minGuests}
                onChange={(e) =>
                  setForm((f) => ({ ...f, minGuests: parseInt(e.target.value) || 1 }))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pkg-description">Description (optional)</Label>
            <Input
              id="pkg-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Brief description of the package"
            />
          </div>

          <ItemsEditor
            items={form.items}
            onChange={(items) =>
              setForm((f) => ({
                ...f,
                items,
                kitchenQtys: syncKitchenQtyRows(
                  items.map((i) => i.label),
                  f.kitchenQtys
                )
              }))
            }
          />

          <KitchenQtyEditor
            categories={uniqueKitchenCategories(form.items.map((i) => i.label))}
            kitchenQtys={form.kitchenQtys}
            onChange={(kitchenQtys) => setForm((f) => ({ ...f, kitchenQtys }))}
          />

          <div className="space-y-4">
            <TierEditor
              label="B2C Pricing Tiers (Consumers)"
              tiers={form.b2cTiers}
              onChange={(b2cTiers) => setForm((f) => ({ ...f, b2cTiers }))}
            />
            <TierEditor
              label="B2B Pricing Tiers (Business)"
              tiers={form.b2bTiers}
              onChange={(b2bTiers) => setForm((f) => ({ ...f, b2bTiers }))}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {editingId ? "Save Changes" : "Create Package"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PackageCard({
  pkg,
  onEdit,
  onDelete,
  onTierPriceSave,
  canWrite = true
}: {
  pkg: Package;
  onEdit: () => void;
  onDelete: () => void;
  onTierPriceSave: (tierId: string, price: number) => void;
  canWrite?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tierView, setTierView] = useState<"b2c" | "b2b">("b2c");
  const itemCount = pkg.items.reduce((sum, i) => sum + i.quantity, 0);
  const visibleTiers = pkg.tiers.filter((t) => t.customerType === tierView);

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="rounded-lg border bg-card">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/50"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-medium">{pkg.name}</h4>
                <Badge variant="secondary" className="text-xs">
                  {itemCount} items
                </Badge>
              </div>
              {pkg.description ? (
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{pkg.description}</p>
              ) : null}
              <p className="mt-1 text-sm text-muted-foreground">
                Min {pkg.minGuests} guests • {pkg.tiers.length} pricing tier
                {pkg.tiers.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canWrite ? (
              <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              </>
              ) : null}
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  expanded && "rotate-180"
                )}
              />
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-4 border-t px-4 py-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Included Items
                </p>
                <ul className="space-y-1 text-sm">
                  {pkg.items.map((item) => (
                    <li key={item.id}>
                      {item.label}
                      {item.quantity > 1 ? (
                        <span className="text-muted-foreground"> ×{item.quantity}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Pricing Tiers
                  </p>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={tierView === "b2c" ? "default" : "outline"}
                      className="h-7 px-2 text-xs"
                      onClick={() => setTierView("b2c")}
                    >
                      B2C
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={tierView === "b2b" ? "default" : "outline"}
                      className="h-7 px-2 text-xs"
                      onClick={() => setTierView("b2b")}
                    >
                      B2B
                    </Button>
                  </div>
                </div>
                <div className="overflow-hidden rounded-md border text-sm">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 text-left font-medium">Guests</th>
                        <th className="px-3 py-2 text-right font-medium">Per Head</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleTiers.map((tier) => (
                        <tr key={tier.id} className="border-b last:border-0">
                          <td className="px-3 py-2 text-muted-foreground">
                            {tier.minGuests}–{tier.maxGuests ?? "∞"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <InlinePriceInput
                              value={tier.pricePerHead}
                              onSave={(price) => onTierPriceSave(tier.id, price)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {visibleTiers.length === 0 ? (
                    <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                      No {tierView.toUpperCase()} tiers configured
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function PackagesSection() {
  const {
    data: packages = [],
    isLoading: loading,
    isFetching: refreshing,
    error: queryError
  } = useSettingsPackagesQuery();
  const createPackageMutation = useCreatePackageMutation();
  const updatePackageMutation = useUpdatePackageMutation();
  const deletePackageMutation = useDeletePackageMutation();
  const updateTierPriceMutation = useUpdateTierPriceMutation();
  const { can } = usePermissions();
  const canWrite = can("settings:write");

  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadError = queryError?.message ?? error;

  const formData: PackageFormData = editingId
    ? packageToForm(packages.find((p) => p.id === editingId)!)
    : EMPTY_FORM;

  async function handleSave(data: PackageFormData, id: string | null) {
    const body = formToBody(data);
    if (id) {
      await updatePackageMutation.mutateAsync({ id, body });
    } else {
      await createPackageMutation.mutateAsync(body);
    }
  }

  function handleDelete() {
    if (!deleteId) return;
    deletePackageMutation.mutate(deleteId, {
      onSettled: () => setDeleteId(null)
    });
  }

  if (loading && packages.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {packages.length} package{packages.length !== 1 ? "s" : ""} configured
          {refreshing ? " · refreshing…" : ""}
        </p>
        {canWrite ? (
        <Button
          onClick={() => {
            setEditingId(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          New Package
        </Button>
        ) : null}
      </div>

      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

      {packages.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-muted-foreground">No packages yet. Create your first package.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {packages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              onEdit={() => {
                setEditingId(pkg.id);
                setDialogOpen(true);
              }}
              onDelete={() => setDeleteId(pkg.id)}
              onTierPriceSave={(tierId, price) =>
                updateTierPriceMutation.mutate({ tierId, pricePerHead: price })
              }
              canWrite={canWrite}
            />
          ))}
        </div>
      )}

      <PackageFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialData={formData}
        editingId={editingId}
        onSave={handleSave}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Package</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this package? This action cannot be undone. Existing
              quotes using this package will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
