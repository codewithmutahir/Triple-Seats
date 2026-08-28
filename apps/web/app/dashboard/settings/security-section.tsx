"use client";

import { Loader2, Shield, ShieldCheck, ShieldOff } from "lucide-react";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { twoFactor, useSession, type AuthSessionUser } from "@/lib/auth-client";
import { parseAuthError } from "@/lib/user-facing-error";

type SetupPhase = "idle" | "qr" | "backup";

export function SecuritySection() {
  const { data: session, refetch } = useSession();
  const twoFactorEnabled = Boolean((session?.user as AuthSessionUser | undefined)?.twoFactorEnabled);

  const [enableOpen, setEnableOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [phase, setPhase] = useState<SetupPhase>("idle");
  const [totpUri, setTotpUri] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetEnableFlow() {
    setPassword("");
    setTotpCode("");
    setPhase("idle");
    setTotpUri("");
    setBackupCodes([]);
    setError(null);
  }

  async function startEnable(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!password) {
      setError("Enter your current password.");
      return;
    }

    setBusy(true);
    try {
      const result = await twoFactor.enable({ password, method: "totp", issuer: "Tripeseats" });
      if (result.error) {
        setError(parseAuthError(result.error.message, "signIn"));
        return;
      }
      if (result.data?.method === "totp" && result.data.totpURI) {
        setTotpUri(result.data.totpURI);
        setBackupCodes(result.data.backupCodes ?? []);
        setPhase("qr");
      }
    } catch {
      setError("Could not start two-factor setup. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmTotp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const code = totpCode.trim();
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }

    setBusy(true);
    try {
      const result = await twoFactor.verifyTotp({ code });
      if (result.error) {
        setError(parseAuthError(result.error.message, "signIn"));
        return;
      }
      setPhase("backup");
      await refetch();
      toast.success("Two-factor authentication enabled.");
    } catch {
      setError("Verification failed. Check the code and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function disable2fa(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!password) {
      setError("Enter your current password.");
      return;
    }

    setBusy(true);
    try {
      const result = await twoFactor.disable({ password });
      if (result.error) {
        setError(parseAuthError(result.error.message, "signIn"));
        return;
      }
      setDisableOpen(false);
      setPassword("");
      await refetch();
      toast.success("Two-factor authentication disabled.");
    } catch {
      setError("Could not disable two-factor authentication.");
    } finally {
      setBusy(false);
    }
  }

  function copyBackupCodes() {
    if (!backupCodes.length) return;
    void navigator.clipboard.writeText(backupCodes.join("\n"));
    toast.success("Backup codes copied to clipboard.");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-[#1B2A4A]" aria-hidden />
            <h3 className="text-lg font-semibold">Two-factor authentication</h3>
            {twoFactorEnabled ? (
              <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">Enabled</Badge>
            ) : (
              <Badge variant="secondary">Not enabled</Badge>
            )}
          </div>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Add an extra layer of security with an authenticator app such as Google Authenticator,
            Microsoft Authenticator, or Authy. You will be asked for a code when signing in.
          </p>
        </div>
        {twoFactorEnabled ? (
          <Button variant="outline" onClick={() => setDisableOpen(true)}>
            <ShieldOff className="mr-2 h-4 w-4" />
            Disable 2FA
          </Button>
        ) : (
          <Button onClick={() => setEnableOpen(true)}>
            <ShieldCheck className="mr-2 h-4 w-4" />
            Enable 2FA
          </Button>
        )}
      </div>

      <Dialog
        open={enableOpen}
        onOpenChange={(open) => {
          setEnableOpen(open);
          if (!open) resetEnableFlow();
        }}
      >
        <DialogContent className="max-w-md">
          {phase === "idle" ? (
            <>
              <DialogHeader>
                <DialogTitle>Enable two-factor authentication</DialogTitle>
                <DialogDescription>
                  Confirm your password to generate a QR code for your authenticator app.
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={startEnable}>
                <div className="space-y-2">
                  <Label htmlFor="enable-password">Current password</Label>
                  <Input
                    id="enable-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                {error ? (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                ) : null}
                <DialogFooter>
                  <Button type="submit" disabled={busy}>
                    {busy ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Starting…
                      </>
                    ) : (
                      "Continue"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : null}

          {phase === "qr" ? (
            <>
              <DialogHeader>
                <DialogTitle>Scan QR code</DialogTitle>
                <DialogDescription>
                  Open your authenticator app, scan the code, then enter the 6-digit verification code.
                </DialogDescription>
              </DialogHeader>
              <div className="mx-auto w-fit rounded-lg border bg-white p-4">
                <QRCodeSVG value={totpUri} size={200} aria-label="QR code for authenticator app setup" />
              </div>
              <form className="space-y-4" onSubmit={confirmTotp}>
                <div className="space-y-2">
                  <Label htmlFor="setup-totp">Verification code</Label>
                  <Input
                    id="setup-totp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                </div>
                {error ? (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                ) : null}
                <DialogFooter>
                  <Button type="submit" disabled={busy}>
                    {busy ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying…
                      </>
                    ) : (
                      "Verify and enable"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : null}

          {phase === "backup" ? (
            <>
              <DialogHeader>
                <DialogTitle>Save your backup codes</DialogTitle>
                <DialogDescription>
                  Store these codes in a safe place. Each code works once if you lose access to your
                  authenticator app.
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-md border bg-muted/40 p-4 font-mono text-sm">
                {backupCodes.map((code) => (
                  <div key={code}>{code}</div>
                ))}
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={copyBackupCodes}>
                  Copy codes
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setEnableOpen(false);
                    resetEnableFlow();
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={disableOpen}
        onOpenChange={(open) => {
          setDisableOpen(open);
          if (!open) {
            setPassword("");
            setError(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disable two-factor authentication</DialogTitle>
            <DialogDescription>
              Enter your password to turn off 2FA. Your account will only be protected by your password.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={disable2fa}>
            <div className="space-y-2">
              <Label htmlFor="disable-password">Current password</Label>
              <Input
                id="disable-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="submit" variant="destructive" disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Disabling…
                  </>
                ) : (
                  "Disable 2FA"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
