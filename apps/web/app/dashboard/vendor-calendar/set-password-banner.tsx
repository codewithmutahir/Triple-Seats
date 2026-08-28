"use client";

import { KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

type SetPasswordBannerProps = {
  open: boolean;
};

export function SetPasswordBanner({ open }: SetPasswordBannerProps) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await api.account.setPassword({ password, confirmPassword });
      await qc.invalidateQueries({ queryKey: queryKeys.team.me() });
      toast.success("Password saved — you can sign in with email and password next time.");
      setDialogOpen(false);
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Set a password for next time</p>
            <p className="mt-0.5 text-amber-900/90">
              You signed in with an email link. Add a password so you can log in again from any device
              without waiting for a new link.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          className="shrink-0 bg-[#1B2A4A] hover:bg-[#152238]"
          onClick={() => setDialogOpen(true)}
        >
          Set password
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set your password</DialogTitle>
            <DialogDescription>
              Use at least 8 characters with uppercase, lowercase, and a number.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
            <div className="space-y-2">
              <Label htmlFor="set-password">New password</Label>
              <Input
                id="set-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="set-password-confirm">Confirm password</Label>
              <Input
                id="set-password-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="submit" className="bg-[#1B2A4A] hover:bg-[#152238]" disabled={submitting}>
                {submitting ? "Saving…" : "Save password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
