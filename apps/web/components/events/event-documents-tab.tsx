"use client";

import { format } from "date-fns";
import { ChefHat, ClipboardList, FileText, Loader2, Send, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEventPaymentsQuery } from "@/hooks/use-payments-query";
import { useQuoteBuilderQuery } from "@/hooks/use-quote-builder";
import { api } from "@/lib/api";
import { drainQuoteBuilderMutations } from "@/lib/quote-builder-mutations";
import { buildExportPayloadFromBuilder, downloadPdfFromResponse } from "@/lib/quote-export";
import { formatUsd } from "@/lib/quote-totals";
import { parseApiError } from "@/lib/user-facing-error";

type EventDocumentsTabProps = {
  eventId: string;
};

type DocumentKind = "quote" | "kitchen" | "labor";

export function EventDocumentsTab({ eventId }: EventDocumentsTabProps) {
  const qc = useQueryClient();
  const { data: paymentsData } = useEventPaymentsQuery(eventId);
  const { data: builderData, isLoading } = useQuoteBuilderQuery(eventId);
  const quote = builderData?.quote;
  const quoteId = paymentsData?.quoteId ?? quote?.id ?? null;

  const [pdfLoading, setPdfLoading] = useState(false);
  const [kitchenLoading, setKitchenLoading] = useState(false);
  const [laborLoading, setLaborLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);

  const exportPayload = useCallback(() => buildExportPayloadFromBuilder(), []);

  async function downloadPdf(kind: DocumentKind) {
    if (!quoteId) {
      toast.error("Create a quote first.");
      return;
    }
    const payload = exportPayload();

    const setLoading =
      kind === "quote" ? setPdfLoading : kind === "kitchen" ? setKitchenLoading : setLaborLoading;
    setLoading(true);
    try {
      // Drain pending quote ops so PDFs never read a stale DB snapshot.
      try {
        await drainQuoteBuilderMutations(qc, eventId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Still saving changes — please try again.");
        return;
      }
      const res =
        kind === "quote"
          ? await api.quotes.pdf(quoteId, payload)
          : kind === "kitchen"
            ? await api.quotes.kitchenSheet(quoteId, payload)
            : await api.quotes.laborSheet(quoteId, payload);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(parseApiError(body, res.status, res.statusText));
        return;
      }
      const filename =
        kind === "quote"
          ? `quote-${quoteId}.pdf`
          : kind === "kitchen"
            ? `kitchen-sheet-${quoteId}.pdf`
            : `labor-sheet-${quoteId}.pdf`;
      const saved = await downloadPdfFromResponse(res, filename);
      if (!saved.ok) {
        toast.error(
          saved.reason === "empty"
            ? "Download was empty. Please try again."
            : "Download was invalid. Please try again."
        );
        return;
      }
      toast.success(
        kind === "quote"
          ? "Quote PDF downloaded."
          : kind === "kitchen"
            ? "Kitchen sheet downloaded."
            : "Labor sheet downloaded."
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setLoading(false);
    }
  }

  async function sendQuote() {
    if (!quoteId) {
      toast.error("Create a quote first.");
      return;
    }
    const payload = exportPayload();
    if (!payload) return;

    setSendLoading(true);
    try {
      await drainQuoteBuilderMutations(qc, eventId);
      await api.quotes.send(quoteId, payload);
      toast.success("Quote send started — email will go out shortly.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send quote.");
    } finally {
      setSendLoading(false);
    }
  }

  if (isLoading && !builderData) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!quoteId) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium text-[#1B2A4A]">No active quote yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Build a quote to generate customer PDFs, kitchen sheets, and labor sheets.
            </p>
          </div>
          <Button asChild className="bg-[#1B2A4A] hover:bg-[#1B2A4A]/90">
            <Link href={`/dashboard/quotes?eventId=${encodeURIComponent(eventId)}`}>
              Open Quote Builder
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const lastUpdated = quote?.updatedAt
    ? format(new Date(quote.updatedAt), "MMM d, yyyy")
    : "—";
  const staffingCount =
    quote?.lineItems.filter((item) => item.category === "labor").length ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            Customer quote
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Last updated {lastUpdated}
            {quote?.totalAmount != null ? ` · ${formatUsd(quote.totalAmount)}` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pdfLoading}
              onClick={() => void downloadPdf("quote")}
            >
              {pdfLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Generate PDF
            </Button>
            <Button type="button" disabled={sendLoading} onClick={() => void sendQuote()}>
              {sendLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send to guest
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ChefHat className="h-5 w-5" />
            Kitchen sheet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Items and quantities only — no pricing. Always generated from the latest menu
            preferences.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={kitchenLoading}
            onClick={() => void downloadPdf("kitchen")}
          >
            {kitchenLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Generate kitchen sheet
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            Labor sheet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Staffing headcount only — no pricing.
            {staffingCount > 0
              ? ` ${staffingCount} role${staffingCount === 1 ? "" : "s"} on quote.`
              : " Add staffing in Quote Builder first."}
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={laborLoading}
            onClick={() => void downloadPdf("labor")}
          >
            {laborLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ClipboardList className="mr-2 h-4 w-4" />
            )}
            Generate labor sheet
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
