"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Copy, CreditCard, Loader2, Unplug } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDisconnectCloverMutation,
  useSettingsCloverQuery,
  useUpdateCloverMutation
} from "@/hooks/use-settings-queries";
import { usePermissions } from "@/hooks/use-permissions";

export function CloverPaymentsSection() {
  const { data, isLoading, isError, refetch } = useSettingsCloverQuery();
  const updateMutation = useUpdateCloverMutation();
  const disconnectMutation = useDisconnectCloverMutation();
  const { can } = usePermissions();
  const canWrite = can("settings:write");

  const [merchantId, setMerchantId] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [publicKey, setPublicKey] = useState("");

  useEffect(() => {
    if (!data) return;
    setMerchantId(data.merchantId ?? "");
    setPublicKey(data.publicKey ?? "");
    setPrivateKey("");
    setWebhookSecret("");
  }, [data]);

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy");
    }
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!merchantId.trim()) {
      toast.error("Merchant ID is required");
      return;
    }
    if (!data?.hasPrivateKey && !privateKey.trim()) {
      toast.error("Private token is required for first-time connect");
      return;
    }

    updateMutation.mutate({
      merchantId: merchantId.trim(),
      ...(privateKey.trim() ? { privateKey: privateKey.trim() } : {}),
      ...(webhookSecret.trim() ? { webhookSecret: webhookSecret.trim() } : {}),
      publicKey: publicKey.trim()
    });
  }

  if (isLoading && !data) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (isError && !data) {
    return (
      <p className="text-sm text-destructive">
        Failed to load Clover settings.{" "}
        <button type="button" className="underline" onClick={() => void refetch()}>
          Retry
        </button>
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-medium">
            <CreditCard className="h-4 w-4" />
            Connect Clover
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Each catering business connects its own Clover Hosted Checkout tokens. Card payments then
            settle to that merchant.
          </p>
        </div>
        {data?.connected ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Connected
            {data.source === "env" ? " (server fallback also active)" : ""}
          </span>
        ) : data?.configured && data.source === "env" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900">
            Using server env keys
          </span>
        ) : (
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            Not connected
          </span>
        )}
      </div>

      {data ? (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
          <p className="font-medium">Paste these into Clover → Hosted Checkout → Edit</p>
          {(
            [
              ["Webhook URL", data.webhookUrl],
              ["Success URL", data.successUrl],
              ["Failure URL", data.failureUrl],
              ["Cancel URL", data.cancelUrl]
            ] as const
          ).map(([label, url]) => (
            <div key={label} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
              <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
              <code className="flex-1 truncate rounded bg-background px-2 py-1 text-xs">{url}</code>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 shrink-0"
                onClick={() => void copyText(label, url)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <form onSubmit={handleSave} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="clover-mid">Merchant ID (MID)</Label>
          <Input
            id="clover-mid"
            value={merchantId}
            onChange={(e) => setMerchantId(e.target.value)}
            placeholder="e.g. N2G6S7A6CT041"
            disabled={!canWrite}
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="clover-private">
            Ecommerce private token (Hosted Checkout)
            {data?.hasPrivateKey ? (
              <span className="ml-2 font-normal text-muted-foreground">
                saved {data.privateKeyHint}
              </span>
            ) : null}
          </Label>
          <Input
            id="clover-private"
            type="password"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            placeholder={data?.hasPrivateKey ? "Leave blank to keep current" : "Private token"}
            disabled={!canWrite}
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="clover-webhook">
            Webhook signing secret
            {data?.hasWebhookSecret ? (
              <span className="ml-2 font-normal text-muted-foreground">
                saved {data.webhookSecretHint}
              </span>
            ) : null}
          </Label>
          <Input
            id="clover-webhook"
            type="password"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder={
              data?.hasWebhookSecret ? "Leave blank to keep current" : "hcp_… from Generate"
            }
            disabled={!canWrite}
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="clover-public">Public token (optional)</Label>
          <Input
            id="clover-public"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            placeholder="Only needed for iframe later"
            disabled={!canWrite}
            autoComplete="off"
          />
        </div>

        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save Clover connection
            </Button>
            {data?.connected ? (
              <Button
                type="button"
                variant="outline"
                disabled={disconnectMutation.isPending}
                onClick={() => {
                  if (window.confirm("Disconnect Clover from this account?")) {
                    disconnectMutation.mutate();
                  }
                }}
              >
                <Unplug className="mr-2 h-4 w-4" />
                Disconnect
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">You need settings write access to change this.</p>
        )}
      </form>
    </div>
  );
}
