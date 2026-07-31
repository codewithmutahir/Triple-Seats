"use client";

import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ItemCategory, QuoteLineItem, QuoteUnit } from "@/components/quote/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { motion } from "@/lib/motion";
import { formatUsd, lineItemTotal } from "@/lib/quote-totals";
import { cn } from "@/lib/utils";

type LineItemRowProps = {
  item: QuoteLineItem;
  guestCount: number;
  category?: ItemCategory;
  onUpdate: (itemId: string, patch: Partial<Pick<QuoteLineItem, "quantity" | "unitPrice" | "unitType">>) => void;
  onDelete: (itemId: string) => void;
  readOnly?: boolean;
};

export function LineItemRow({ item, guestCount, category, onUpdate, onDelete, readOnly = false }: LineItemRowProps) {
  const isEquipment = category === "equipment";
  const [editingField, setEditingField] = useState<"quantity" | "unitPrice" | null>(null);
  const [qtyDraft, setQtyDraft] = useState(String(item.quantity));
  const [priceDraft, setPriceDraft] = useState(String(item.unitPrice));
  const qtyRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingField !== "quantity") setQtyDraft(String(item.quantity));
    if (editingField !== "unitPrice") setPriceDraft(String(item.unitPrice));
  }, [item.quantity, item.unitPrice, editingField]);

  useEffect(() => {
    if (editingField === "quantity") qtyRef.current?.focus();
    if (editingField === "unitPrice") priceRef.current?.focus();
  }, [editingField]);

  const commitQty = useCallback(() => {
    const val = parseFloat(qtyDraft);
    if (Number.isFinite(val) && val >= 0 && val !== item.quantity) {
      onUpdate(item.id, { quantity: val });
    } else {
      setQtyDraft(String(item.quantity));
    }
    setEditingField(null);
  }, [qtyDraft, item.id, item.quantity, onUpdate]);

  const commitPrice = useCallback(() => {
    const val = parseFloat(priceDraft);
    if (Number.isFinite(val) && val >= 0 && val !== item.unitPrice) {
      onUpdate(item.id, { unitPrice: val });
    } else {
      setPriceDraft(String(item.unitPrice));
    }
    setEditingField(null);
  }, [priceDraft, item.id, item.unitPrice, onUpdate]);

  const total = lineItemTotal(item, guestCount, category);
  const effectiveUnit =
    category === "equipment" && item.unitType === "per_head" ? "per_piece" : item.unitType;
  const calcHint =
    effectiveUnit === "per_head"
      ? `${formatUsd(item.unitPrice)} × ${guestCount} guests = ${formatUsd(total)}`
      : effectiveUnit === "by_tray"
        ? `${formatUsd(item.unitPrice)} × ${item.quantity} tray${item.quantity === 1 ? "" : "s"} = ${formatUsd(total)}`
        : effectiveUnit === "per_piece"
          ? `${formatUsd(item.unitPrice)} × ${item.quantity} pieces = ${formatUsd(total)}`
          : `${formatUsd(item.unitPrice)} × ${item.quantity} = ${formatUsd(total)}`;

  const showQtyInput = !readOnly && (isEquipment || editingField === "quantity");
  const showPriceInput = !readOnly && (isEquipment || editingField === "unitPrice");
  const isOptimistic = item.id.startsWith("temp_");
  const rowClass = cn(
    "rounded-md border bg-muted/20 px-3 py-2 text-sm",
    isOptimistic && motion.listEnter
  );

  if (readOnly) {
    return (
      <li className={rowClass}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">{item.name}</span>
          <span className="tabular-nums font-medium">{formatUsd(total)}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{calcHint}</p>
      </li>
    );
  }

  return (
    <li className={rowClass}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-[100px] flex-1 font-medium">{item.name}</span>

        <div className="flex items-center gap-1 text-muted-foreground">
          <span className="text-xs">qty</span>
          {showQtyInput ? (
            <Input
              ref={qtyRef}
              type="number"
              min={0}
              step="any"
              className="h-8 w-20 px-2 text-sm"
              value={qtyDraft}
              onChange={(e) => setQtyDraft(e.target.value)}
              onBlur={commitQty}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitQty();
                if (e.key === "Escape") {
                  setQtyDraft(String(item.quantity));
                  setEditingField(null);
                }
              }}
            />
          ) : (
            <button
              type="button"
              className={cn("rounded px-1 hover:bg-muted", motion.interactive)}
              onClick={() => setEditingField("quantity")}
            >
              {item.quantity}
            </button>
          )}
        </div>

        <Select
          value={item.unitType === "per_head" && category === "equipment" ? "per_piece" : item.unitType}
          onValueChange={(v) => {
            const next = v as QuoteLineItem["unitType"];
            onUpdate(item.id, {
              unitType: category === "equipment" && next === "per_head" ? "per_piece" : next
            });
          }}
        >
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {category === "equipment" ? (
              <>
                <SelectItem value="per_piece">Per Piece</SelectItem>
                <SelectItem value="flat">Flat Rate</SelectItem>
              </>
            ) : (
              <>
                <SelectItem value="per_head">Per Head</SelectItem>
                <SelectItem value="by_tray">By Tray</SelectItem>
                <SelectItem value="flat">Flat Rate</SelectItem>
              </>
            )}
          </SelectContent>
        </Select>

        {showPriceInput ? (
          <Input
            ref={priceRef}
            type="number"
            min={0}
            step="0.01"
            className="h-8 w-24 px-2 text-sm"
            value={priceDraft}
            onChange={(e) => setPriceDraft(e.target.value)}
            onBlur={commitPrice}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitPrice();
              if (e.key === "Escape") {
                setPriceDraft(String(item.unitPrice));
                setEditingField(null);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className={cn("rounded px-1 hover:bg-muted", motion.interactive)}
            onClick={() => setEditingField("unitPrice")}
          >
            {formatUsd(item.unitPrice)}
          </button>
        )}

        <span className="min-w-[72px] text-right font-medium tabular-nums">{formatUsd(total)}</span>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onDelete(item.id)}
          aria-label={`Remove ${item.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{calcHint}</p>
    </li>
  );
}
