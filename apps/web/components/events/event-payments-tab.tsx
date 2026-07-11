"use client";

import { format } from "date-fns";
import { Banknote, CreditCard, Loader2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useEventPaymentsMutations, useEventPaymentsQuery } from "@/hooks/use-payments-query";
import { formatUsd } from "@/lib/quote-totals";

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  credit_card: "Credit Card",
  bank_transfer: "Bank Transfer",
  other: "Other"
};

type EventPaymentsTabProps = {
  eventId: string;
  eventStatus: string;
  onSuggestComplete?: () => void;
};

export function EventPaymentsTab({ eventId, eventStatus, onSuggestComplete }: EventPaymentsTabProps) {
  const { data, isLoading, isError, refetch } = useEventPaymentsQuery(eventId);
  const { recordMutation, deleteMutation, canWritePayments } = useEventPaymentsMutations(eventId);

  const [cashAmount, setCashAmount] = useState("");
  const [cashDate, setCashDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [cashNote, setCashNote] = useState("");
  const [cardAmount, setCardAmount] = useState("");
  const [cardNote, setCardNote] = useState("");

  const paymentsEnabled =
    data?.paymentsEnabled ?? (eventStatus === "booked" || eventStatus === "completed");

  const summary = useMemo(
    () => ({
      quoteTotal: data?.quoteTotal ?? 0,
      totalPaid: data?.totalPaid ?? 0,
      balanceDue: data?.balanceDue ?? 0
    }),
    [data]
  );

  function recordCashPayment() {
    const amount = Number.parseFloat(cashAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid payment amount.");
      return;
    }

    recordMutation.mutate(
      {
        amount,
        method: "cash",
        note: cashNote.trim() || undefined,
        paymentDate: cashDate ? new Date(`${cashDate}T12:00:00`).toISOString() : undefined
      },
      {
        onSuccess: (result) => {
          setCashAmount("");
          setCashNote("");
          toast.success("Cash payment recorded.");
          if (result.balanceDue <= 0.01) {
            onSuggestComplete?.();
          }
        }
      }
    );
  }

  function handlePaymentLink() {
    if (!cardAmount.trim()) {
      toast.error("Enter an amount for the payment link.");
      return;
    }
    toast.message("Payment link feature coming soon.", {
      description: "Use Clover integration (in progress). Record cash payments for now."
    });
  }

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Failed to load payments.{" "}
          <button type="button" className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {!paymentsEnabled ? (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="py-4 text-sm text-amber-950">
            Payments unlock when this event is marked <strong>Booked</strong>. You can still review
            quote totals below.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Quote total
            </p>
            <p className="mt-1 text-2xl font-semibold text-[#1B2A4A]">
              {formatUsd(summary.quoteTotal)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Total paid
            </p>
            <p className="mt-1 text-2xl font-semibold text-emerald-700">
              {formatUsd(summary.totalPaid)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Balance due
            </p>
            <p className="mt-1 text-2xl font-semibold text-[#1B2A4A]">
              {formatUsd(summary.balanceDue)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Payment history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data?.payments.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Added by</TableHead>
                  {canWritePayments ? <TableHead className="w-12" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      {format(new Date(payment.paymentDate), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>{METHOD_LABELS[payment.method] ?? payment.method}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatUsd(payment.amount)}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-muted-foreground">
                      {payment.note || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {payment.addedByName ?? "—"}
                    </TableCell>
                    {canWritePayments ? (
                      <TableCell>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => deleteMutation.mutate(payment.id)}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="px-6 py-8 text-sm text-muted-foreground">No payments recorded yet.</p>
          )}
        </CardContent>
      </Card>

      {canWritePayments && paymentsEnabled ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Banknote className="h-5 w-5" />
                Record cash payment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="cash-amount">Amount</Label>
                <Input
                  id="cash-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="cash-date">Date</Label>
                <Input
                  id="cash-date"
                  type="date"
                  value={cashDate}
                  onChange={(e) => setCashDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="cash-note">Note (optional)</Label>
                <Textarea
                  id="cash-note"
                  value={cashNote}
                  onChange={(e) => setCashNote(e.target.value)}
                  rows={2}
                />
              </div>
              <Button
                type="button"
                className="w-full bg-[#1B2A4A] hover:bg-[#1B2A4A]/90"
                disabled={recordMutation.isPending}
                onClick={() => recordCashPayment()}
              >
                {recordMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Record cash payment
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CreditCard className="h-5 w-5" />
                Send payment link
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="card-amount">Amount</Label>
                <Input
                  id="card-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={cardAmount}
                  onChange={(e) => setCardAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="card-note">Note</Label>
                <Input
                  id="card-note"
                  value={cardNote}
                  onChange={(e) => setCardNote(e.target.value)}
                  placeholder="Deposit payment"
                />
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={handlePaymentLink}>
                Generate payment link
              </Button>
              <p className="text-xs text-muted-foreground">
                Link will be sent to the guest email. Payment via Clover (coming soon).
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
