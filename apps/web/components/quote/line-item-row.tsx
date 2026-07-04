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
import { formatUsd, lineItemTotal } from "@/lib/quote-totals";
import { cn } from "@/lib/utils";

type LineItemRowProps = {
  item: QuoteLineItem;
  guestCount: number;
  category?: ItemCategory;
  onUpdate: (itemId: string, patch: Partial<Pick<QuoteLineItem, "quantity" | "unitPrice" | "unitType">>) => void;
  onDelete: (itemId: string) => void;
  isTemp?: boolean;
};

export function LineItemRow({ item, guestCount, category, onUpdate, onDelete, isTemp }: LineItemRowProps) {
  const [editingField, setEditingField] = useState<"quantity" | "unitPrice" | null>(null);
  const [qtyDraft, setQtyDraft] = useState(String(item.quantity));
  const [priceDraft, setPriceDraft] = useState(String(item.unitPrice));
  const qtyRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQtyDraft(String(item.quantity));
    setPriceDraft(String(item.unitPrice));
  }, [item.quantity, item.unitPrice]);

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

  return (
    <li
      className={cn(
        "group rounded-md border bg-muted/20 px-3 py-2 text-sm transition-opacity",
        isTemp && "opacity-70"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-[100px] flex-1 font-medium">{item.name}</span>

        <div className="flex items-center gap-1 text-muted-foreground">
          <span>qty</span>
          {editingField === "quantity" ? (
            <Input
              ref={qtyRef}
              type="number"
              min={0}
              step="any"
              className="h-7 w-16 px-1 text-sm"
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
              className="rounded px-1 hover:bg-muted"
              onClick={() => setEditingField("quantity")}
            >
              {item.quantity}
            </button>
          )}
        </div>

        <Select
          value={effectiveUnit === "per_piece" && item.unitType === "per_head" ? "per_piece" : item.unitType}
          onValueChange={(v) => onUpdate(item.id, { unitType: v as QuoteUnit })}
        >
          <SelectTrigger className="h-7 w-[110px] text-xs">
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

        {editingField === "unitPrice" ? (
          <Input
            ref={priceRef}
            type="number"
            min={0}
            step="0.01"
            className="h-7 w-20 px-1 text-sm"
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
            className="rounded px-1 hover:bg-muted"
            onClick={() => setEditingField("unitPrice")}
          >
            {formatUsd(item.unitPrice)}
          </button>
        )}

        <span className="font-medium">{formatUsd(total)}</span>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={() => onDelete(item.id)}
          aria-label="Remove item"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{calcHint}</p>
    </li>
  );
}
