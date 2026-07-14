export type PaymentMethod = "cash" | "credit_card" | "bank_transfer" | "other";

export type PaymentRecord = {
  id: string;
  eventId: string;
  quoteId: string | null;
  amount: number;
  method: PaymentMethod;
  status: string;
  note: string | null;
  addedBy: string;
  addedByName: string | null;
  paymentDate: string;
  createdAt: string;
  provider?: string | null;
  checkoutSessionId?: string | null;
  checkoutUrl?: string | null;
  expiresAt?: string | null;
  externalPaymentId?: string | null;
};

export type EventPaymentsPayload = {
  eventId: string;
  eventStatus: string;
  paymentsEnabled: boolean;
  cloverConfigured?: boolean;
  quoteId: string | null;
  quoteTotal: number;
  totalPaid: number;
  balanceDue: number;
  payments: PaymentRecord[];
};

export type CreatePaymentLinkResult = EventPaymentsPayload & {
  payment: PaymentRecord;
  checkoutUrl: string | null;
  emailSent: boolean;
  reused: boolean;
};

export type ClientHistoryEntry = {
  id: string;
  title: string;
  status: string;
  eventDate: string;
  guestCountEstimate: number | null;
  location: string | null;
  guest: {
    name: string;
    email: string | null;
    phone: string | null;
  } | null;
  latestQuote: {
    id: string;
    totalAmount: number;
    status: string;
    updatedAt: string;
  } | null;
};
