"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CatererProfile } from "./page";

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "Eastern Time (US)" },
  { value: "America/Chicago", label: "Central Time (US)" },
  { value: "America/Denver", label: "Mountain Time (US)" },
  { value: "America/Los_Angeles", label: "Pacific Time (US)" },
  { value: "Asia/Karachi", label: "Pakistan Standard Time" },
  { value: "Asia/Dubai", label: "Gulf Standard Time" },
  { value: "Europe/London", label: "GMT (London)" },
];

const CURRENCIES = [
  { value: "USD", label: "USD ($)" },
  { value: "PKR", label: "PKR (₨)" },
  { value: "AED", label: "AED (د.إ)" },
  { value: "GBP", label: "GBP (£)" },
  { value: "EUR", label: "EUR (€)" },
];

type Props = {
  profile: CatererProfile;
  onUpdate: (profile: CatererProfile) => void;
};

export function BusinessProfileSection({ profile, onUpdate }: Props) {
  const [form, setForm] = useState({
    name: profile.name,
    email: profile.email,
    phone: profile.phone ?? "",
    timezone: profile.timezone ?? "UTC",
    currencyCode: profile.currencyCode,
    websiteUrl: profile.websiteUrl ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const hasChanges =
    form.name !== profile.name ||
    form.email !== profile.email ||
    form.phone !== (profile.phone ?? "") ||
    form.timezone !== (profile.timezone ?? "UTC") ||
    form.currencyCode !== profile.currencyCode ||
    form.websiteUrl !== (profile.websiteUrl ?? "");

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/caterer", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          timezone: form.timezone,
          currencyCode: form.currencyCode,
          websiteUrl: form.websiteUrl.trim() || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save");
      }

      const data = await res.json();
      onUpdate(data.caterer);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="business-name">Business Name</Label>
          <Input
            id="business-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Your business name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="business-email">Email</Label>
          <Input
            id="business-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="contact@example.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="business-phone">Phone</Label>
          <Input
            id="business-phone"
            type="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="+1 234 567 8900"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="business-website">Website</Label>
          <Input
            id="business-website"
            type="url"
            value={form.websiteUrl}
            onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))}
            placeholder="https://example.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="business-timezone">Timezone</Label>
          <Select
            value={form.timezone}
            onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}
          >
            <SelectTrigger id="business-timezone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="business-currency">Currency</Label>
          <Select
            value={form.currencyCode}
            onValueChange={(v) => setForm((f) => ({ ...f, currencyCode: v }))}
          >
            <SelectTrigger id="business-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-emerald-600">Profile saved successfully!</p>}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !hasChanges}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
