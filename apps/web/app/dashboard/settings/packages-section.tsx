"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  Edit2,
  GripVertical,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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

type PriceTier = {
  id: string;
  customerType: "b2b" | "b2c";
  minGuests: number;
  maxGuests: number | null;
  pricePerHead: number;
};

type PackageItem = {
  id: string;
  label: string;
  quantity: number;
  sortOrder: number;
};

type Package = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  minGuests: number;
  tiers: PriceTier[];
  items: PackageItem[];
};

type PackageFormData = {
  name: string;
  description: string;
  minGuests: number;
  items: { label: string; quantity: number }[];
  b2cTiers: { minGuests: number; maxGuests: number | null; pricePerHead: number }[];
  b2bTiers: { minGuests: number; maxGuests: number | null; pricePerHead: number }[];
};

const EMPTY_FORM: PackageFormData = {
  name: "",
  description: "",
  minGuests: 200,
  items: [{ label: "", quantity: 1 }],
  b2cTiers: [{ minGuests: 200, maxGuests: 250, pricePerHead: 0 }],
  b2bTiers: [{ minGuests: 200, maxGuests: 250, pricePerHead: 0 }],
};

function packageToForm(pkg: Package): PackageFormData {
  const b2cTiers = pkg.tiers
    .filter((t) => t.customerType === "b2c")
    .map((t) => ({
      minGuests: t.minGuests,
      maxGuests: t.maxGuests,
      pricePerHead: t.pricePerHead,
    }));
  const b2bTiers = pkg.tiers
    .filter((t) => t.customerType === "b2b")
    .map((t) => ({
      minGuests: t.minGuests,
      maxGuests: t.maxGuests,
      pricePerHead: t.pricePerHead,
    }));

  return {
    name: pkg.name,
    description: pkg.description ?? "",
    minGuests: pkg.minGuests,
    items: pkg.items.map((i) => ({ label: i.label, quantity: i.quantity })),
    b2cTiers: b2cTiers.length ? b2cTiers : EMPTY_FORM.b2cTiers,
    b2bTiers: b2bTiers.length ? b2bTiers : EMPTY_FORM.b2bTiers,
  };
}

function TierEditor({
  label,
  tiers,
  onChange,
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
      { minGuests: nextMin, maxGuests: nextMin + 100, pricePerHead: lastTier?.pricePerHead ?? 0 },
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
                onChange={(e) =>
                  updateTier(i, "pricePerHead", parseFloat(e.target.value) || 0)
                }
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
  onChange,
}: {
  items: { label: string; quantity: number }[];
  onChange: (items: { label: string; quantity: number }[]) => void;
}) {
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

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Included Items</Label>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <GripVertical className="h-4 w-4 text-muted-foreground/50" />
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

function PackageFormDialog({
  open,
  onOpenChange,
  initialData,
  editingId,
  onSave,
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
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit Package" : "Create Package"}</DialogTitle>
          <DialogDescription>
            Configure package details, included items, and pricing tiers
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
            onChange={(items) => setForm((f) => ({ ...f, items }))}
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

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
}: {
  pkg: Package;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const itemCount = pkg.items.reduce((sum, i) => sum + i.quantity, 0);
  const b2cTiers = pkg.tiers.filter((t) => t.customerType === "b2c");

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
              {pkg.description && (
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {pkg.description}
                </p>
              )}
              <p className="mt-1 text-sm text-muted-foreground">
                Min {pkg.minGuests} guests • {b2cTiers.length} pricing tier
                {b2cTiers.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
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
          <div className="border-t px-4 py-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Included Items
                </p>
                <ul className="space-y-1 text-sm">
                  {pkg.items.map((item) => (
                    <li key={item.id}>
                      {item.label}
                      {item.quantity > 1 && (
                        <span className="text-muted-foreground"> ×{item.quantity}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  B2C Pricing
                </p>
                <div className="space-y-1 text-sm">
                  {b2cTiers.map((tier) => (
                    <div key={tier.id} className="flex justify-between">
                      <span className="text-muted-foreground">
                        {tier.minGuests}–{tier.maxGuests ?? "∞"} guests
                      </span>
                      <span className="font-medium">${tier.pricePerHead}/head</span>
                    </div>
                  ))}
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
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const formData: PackageFormData = editingId
    ? packageToForm(packages.find((p) => p.id === editingId)!)
    : EMPTY_FORM;

  const fetchPackages = useCallback(async () => {
    try {
      const res = await fetch("/api/packages?customerType=b2c", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load packages");
      const data = await res.json();
      setPackages(data.items ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load packages");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPackages();
  }, [fetchPackages]);

  async function handleSave(data: PackageFormData, id: string | null) {
    const body = {
      name: data.name.trim(),
      description: data.description.trim() || null,
      minGuests: data.minGuests,
      items: data.items
        .filter((i) => i.label.trim())
        .map((i, idx) => ({ label: i.label.trim(), quantity: i.quantity, sortOrder: idx })),
      tiers: [
        ...data.b2cTiers.map((t) => ({ ...t, customerType: "b2c" as const })),
        ...data.b2bTiers.map((t) => ({ ...t, customerType: "b2b" as const })),
      ],
    };

    const res = await fetch(id ? `/api/packages/${id}` : "/api/packages", {
      method: id ? "PUT" : "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      throw new Error(errorBody.error || "Failed to save package");
    }

    await fetchPackages();
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/packages/${deleteId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to delete");
      }
      await fetchPackages();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  if (loading) {
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
        </p>
        <Button
          onClick={() => {
            setEditingId(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          New Package
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

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
              Are you sure you want to delete this package? This action cannot be undone.
              Existing quotes using this package will not be affected.
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
