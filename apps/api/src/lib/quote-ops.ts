import type { Prisma } from "@tripeseats/database";
import { prisma } from "@tripeseats/database";

import { findIdempotentLineItemId, recordIdempotentLineItem } from "./quote-item-idempotency";
import {
  addPackageToQuote,
  removePackageFromQuote,
  updateGuestCountOnly,
  updatePackageTierOnQuote
} from "./quote-package-mutations";
import { parseItemCategory, parseQuoteUnit } from "./quote-serialize";

export type QuoteOp =
  | {
      type: "add_item";
      clientRequestId: string;
      category: string;
      name: string;
      quantity?: number;
      unitPrice: number;
      unitType: string;
      notes?: string | null;
      menuItemId?: string | null;
    }
  | { type: "remove_item"; itemId: string }
  | {
      type: "update_item";
      itemId: string;
      patch: {
        name?: string;
        quantity?: number;
        unitPrice?: number;
        unitType?: string;
        notes?: string | null;
        category?: string;
      };
    }
  | { type: "set_guest_count"; guestCount: number }
  | { type: "add_package"; packageId: string; tierId?: string | null }
  | { type: "remove_package" }
  | { type: "set_package_tier"; tierId: string };

/** @deprecated Use QuoteOp */
export type QuoteLineOp = QuoteOp;

export class QuoteOpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "QuoteOpError";
    this.status = status;
  }
}

function parseAddItemOp(raw: Record<string, unknown>): QuoteOp {
  if (typeof raw.clientRequestId !== "string" || !raw.clientRequestId.trim()) {
    throw new QuoteOpError("add_item requires clientRequestId.", 400);
  }
  if (typeof raw.name !== "string" || !raw.name.trim()) {
    throw new QuoteOpError("add_item requires name.", 400);
  }
  if (typeof raw.unitPrice !== "number" || !Number.isFinite(raw.unitPrice)) {
    throw new QuoteOpError("add_item requires unitPrice.", 400);
  }
  if (typeof raw.category !== "string" || typeof raw.unitType !== "string") {
    throw new QuoteOpError("add_item requires category and unitType.", 400);
  }

  return {
    type: "add_item",
    clientRequestId: raw.clientRequestId.trim(),
    category: raw.category,
    name: raw.name,
    quantity: typeof raw.quantity === "number" ? raw.quantity : undefined,
    unitPrice: raw.unitPrice,
    unitType: raw.unitType,
    notes: typeof raw.notes === "string" || raw.notes === null ? raw.notes : undefined,
    menuItemId:
      typeof raw.menuItemId === "string" || raw.menuItemId === null ? raw.menuItemId : undefined
  };
}

function parseRemoveItemOp(raw: Record<string, unknown>): QuoteOp {
  if (typeof raw.itemId !== "string" || !raw.itemId.trim()) {
    throw new QuoteOpError("remove_item requires itemId.", 400);
  }
  return { type: "remove_item", itemId: raw.itemId.trim() };
}

function parseUpdateItemOp(raw: Record<string, unknown>): QuoteOp {
  if (typeof raw.itemId !== "string" || !raw.itemId.trim()) {
    throw new QuoteOpError("update_item requires itemId.", 400);
  }
  if (!raw.patch || typeof raw.patch !== "object" || Array.isArray(raw.patch)) {
    throw new QuoteOpError("update_item requires patch object.", 400);
  }
  const patch = raw.patch as Record<string, unknown>;
  const normalized: QuoteOp & { type: "update_item" } = {
    type: "update_item",
    itemId: raw.itemId.trim(),
    patch: {}
  };

  if (patch.name !== undefined) normalized.patch.name = String(patch.name);
  if (typeof patch.quantity === "number") normalized.patch.quantity = patch.quantity;
  if (typeof patch.unitPrice === "number") normalized.patch.unitPrice = patch.unitPrice;
  if (patch.unitType !== undefined) normalized.patch.unitType = String(patch.unitType);
  if (patch.notes !== undefined) {
    normalized.patch.notes =
      typeof patch.notes === "string" || patch.notes === null ? patch.notes : null;
  }
  if (patch.category !== undefined) normalized.patch.category = String(patch.category);

  if (Object.keys(normalized.patch).length === 0) {
    throw new QuoteOpError("update_item patch cannot be empty.", 400);
  }

  return normalized;
}

function parseSetGuestCountOp(raw: Record<string, unknown>): QuoteOp {
  const guestCount =
    typeof raw.guestCount === "number" ? raw.guestCount : parseInt(String(raw.guestCount ?? ""), 10);
  if (!Number.isFinite(guestCount) || guestCount < 0) {
    throw new QuoteOpError("set_guest_count requires a non-negative guestCount.", 400);
  }
  return { type: "set_guest_count", guestCount: Math.floor(guestCount) };
}

function parseAddPackageOp(raw: Record<string, unknown>): QuoteOp {
  if (typeof raw.packageId !== "string" || !raw.packageId.trim()) {
    throw new QuoteOpError("add_package requires packageId.", 400);
  }
  return {
    type: "add_package",
    packageId: raw.packageId.trim(),
    tierId:
      typeof raw.tierId === "string" && raw.tierId.trim() ? raw.tierId.trim() : null
  };
}

function parseSetPackageTierOp(raw: Record<string, unknown>): QuoteOp {
  if (typeof raw.tierId !== "string" || !raw.tierId.trim()) {
    throw new QuoteOpError("set_package_tier requires tierId.", 400);
  }
  return { type: "set_package_tier", tierId: raw.tierId.trim() };
}

export function parseQuoteOps(rawOps: unknown[]): QuoteOp[] {
  if (rawOps.length === 0) {
    throw new QuoteOpError("ops array cannot be empty.", 400);
  }
  if (rawOps.length > 50) {
    throw new QuoteOpError("Too many operations (max 50).", 400);
  }

  return rawOps.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new QuoteOpError(`Invalid operation at index ${index}.`, 400);
    }
    const op = raw as Record<string, unknown>;
    switch (op.type) {
      case "add_item":
        return parseAddItemOp(op);
      case "remove_item":
        return parseRemoveItemOp(op);
      case "update_item":
        return parseUpdateItemOp(op);
      case "set_guest_count":
        return parseSetGuestCountOp(op);
      case "add_package":
        return parseAddPackageOp(op);
      case "remove_package":
        return { type: "remove_package" };
      case "set_package_tier":
        return parseSetPackageTierOp(op);
      default:
        throw new QuoteOpError(`Unknown operation type at index ${index}.`, 400);
    }
  });
}

/** @deprecated Use parseQuoteOps */
export const parseQuoteLineOps = parseQuoteOps;

async function applyAddItemOp(
  quoteId: string,
  catererId: string,
  op: Extract<QuoteOp, { type: "add_item" }>
) {
  const existingByKey = await findIdempotentLineItemId(quoteId, op.clientRequestId);
  if (existingByKey) return;

  const category = parseItemCategory(op.category);
  const unitType = parseQuoteUnit(op.unitType);
  if (!category || !unitType) {
    throw new QuoteOpError("Invalid category or unitType.", 400);
  }

  const quantity =
    typeof op.quantity === "number" && Number.isFinite(op.quantity) ? op.quantity : 1;

  let menuItemId: string | null = null;
  if (op.menuItemId) {
    const menuItem = await prisma.menuItem.findFirst({
      where: { id: op.menuItemId, catererId }
    });
    if (menuItem) menuItemId = menuItem.id;
  }

  const trimmedName = op.name.trim();
  const existing = await prisma.quoteLineItem.findFirst({
    where: { quoteId, category, name: trimmedName, unitType }
  });

  let resultLineItemId: string;
  if (existing) {
    await prisma.quoteLineItem.update({
      where: { id: existing.id },
      data: {
        quantity: existing.quantity + Math.max(0, quantity),
        unitPrice: Math.max(0, op.unitPrice)
      }
    });
    resultLineItemId = existing.id;
  } else {
    const created = await prisma.quoteLineItem.create({
      data: {
        quoteId,
        menuItemId,
        category,
        name: trimmedName,
        quantity: Math.max(0, quantity),
        unitPrice: Math.max(0, op.unitPrice),
        unitType,
        notes: op.notes?.trim() || null
      }
    });
    resultLineItemId = created.id;
  }

  await recordIdempotentLineItem(quoteId, op.clientRequestId, resultLineItemId);
}

async function applyRemoveItemOp(quoteId: string, op: Extract<QuoteOp, { type: "remove_item" }>) {
  const existing = await prisma.quoteLineItem.findFirst({
    where: { id: op.itemId, quoteId }
  });
  if (!existing) return;
  await prisma.quoteLineItem.delete({ where: { id: op.itemId } });
}

async function applyUpdateItemOp(quoteId: string, op: Extract<QuoteOp, { type: "update_item" }>) {
  const existing = await prisma.quoteLineItem.findFirst({
    where: { id: op.itemId, quoteId }
  });
  if (!existing) {
    throw new QuoteOpError("Line item not found.", 404);
  }

  const body = op.patch;
  const data: Prisma.QuoteLineItemUpdateInput = {};

  if (body.name !== undefined) {
    if (!body.name.trim()) {
      throw new QuoteOpError("name cannot be empty.", 400);
    }
    data.name = body.name.trim();
  }
  if (typeof body.quantity === "number" && Number.isFinite(body.quantity)) {
    data.quantity = Math.max(0, body.quantity);
  }
  if (typeof body.unitPrice === "number" && Number.isFinite(body.unitPrice)) {
    data.unitPrice = Math.max(0, body.unitPrice);
  }
  if (body.unitType !== undefined) {
    const unitType = parseQuoteUnit(body.unitType);
    if (!unitType) {
      throw new QuoteOpError("Invalid unitType.", 400);
    }
    data.unitType = unitType;
  }
  if (body.notes !== undefined) {
    data.notes = body.notes?.trim() || null;
  }
  if (body.category !== undefined) {
    const category = parseItemCategory(body.category);
    if (!category) {
      throw new QuoteOpError("Invalid category.", 400);
    }
    data.category = category;
  }

  if (Object.keys(data).length === 0) return;

  await prisma.quoteLineItem.update({ where: { id: op.itemId }, data });
}

export async function applyQuoteOps(
  quoteId: string,
  catererId: string,
  ops: QuoteOp[]
): Promise<void> {
  const deferTotals = { deferTotals: true as const };

  for (const op of ops) {
    switch (op.type) {
      case "add_item":
        await applyAddItemOp(quoteId, catererId, op);
        break;
      case "remove_item":
        await applyRemoveItemOp(quoteId, op);
        break;
      case "update_item":
        await applyUpdateItemOp(quoteId, op);
        break;
      case "set_guest_count":
        await updateGuestCountOnly(quoteId, catererId, op.guestCount, deferTotals);
        break;
      case "add_package":
        await addPackageToQuote(quoteId, catererId, op.packageId, op.tierId ?? null, deferTotals);
        break;
      case "remove_package":
        await removePackageFromQuote(quoteId, catererId, deferTotals);
        break;
      case "set_package_tier":
        await updatePackageTierOnQuote(quoteId, catererId, op.tierId, deferTotals);
        break;
      default:
        throw new QuoteOpError("Unknown operation.", 400);
    }
  }
}

/** @deprecated Use applyQuoteOps */
export const applyQuoteLineOps = applyQuoteOps;
