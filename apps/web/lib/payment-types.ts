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
};

export type EventPaymentsPayload = {
  eventId: string;
  eventStatus: string;
  paymentsEnabled: boolean;
  quoteId: string | null;
  quoteTotal: number;
  totalPaid: number;
  balanceDue: number;
  payments: PaymentRecord[];
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
