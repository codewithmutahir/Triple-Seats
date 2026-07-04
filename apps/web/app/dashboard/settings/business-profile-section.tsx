"use client";

import { useEffect, useState } from "react";

import { SaveIndicator } from "@/components/save-indicator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useUpdateProfileMutation, type ProfileUpdatePayload } from "@/hooks/use-settings-queries";
import type { CatererProfile } from "./page";

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "Eastern Time (US)" },
  { value: "America/Chicago", label: "Central Time (US)" },
  { value: "America/Denver", label: "Mountain Time (US)" },
  { value: "America/Los_Angeles", label: "Pacific Time (US)" },
  { value: "Asia/Karachi", label: "Pakistan Standard Time" },
  { value: "Asia/Dubai", label: "Gulf Standard Time" },
  { value: "Europe/London", label: "GMT (London)" }
];

const CURRENCIES = [
  { value: "USD", label: "USD ($)" },
  { value: "PKR", label: "PKR (₨)" },
  { value: "AED", label: "AED (د.إ)" },
  { value: "GBP", label: "GBP (£)" },
  { value: "EUR", label: "EUR (€)" }
];

type Props = {
  profile: CatererProfile;
  onDirtyChange?: (dirty: boolean) => void;
};

function profileToForm(profile: CatererProfile) {
  return {
    name: profile.name,
    email: profile.email,
    phone: profile.phone ?? "",
    timezone: profile.timezone ?? "UTC",
    currencyCode: profile.currencyCode,
    websiteUrl: profile.websiteUrl ?? ""
  };
}

function formToPayload(form: ReturnType<typeof profileToForm>): ProfileUpdatePayload {
  return {
    name: form.name.trim(),
    email: form.email.trim(),
    phone: form.phone.trim() || null,
    timezone: form.timezone,
    currencyCode: form.currencyCode,
    websiteUrl: form.websiteUrl.trim() || null
  };
}

export function BusinessProfileSection({ profile, onDirtyChange }: Props) {
  const updateProfileMutation = useUpdateProfileMutation();
  const [form, setForm] = useState(() => profileToForm(profile));

  const savedPayload = formToPayload(profileToForm(profile));
  const currentPayload = formToPayload(form);
  const isDirty =
    currentPayload.name !== savedPayload.name ||
    currentPayload.email !== savedPayload.email ||
    currentPayload.phone !== savedPayload.phone ||
    currentPayload.timezone !== savedPayload.timezone ||
    currentPayload.currencyCode !== savedPayload.currencyCode ||
    currentPayload.websiteUrl !== savedPayload.websiteUrl;

  useEffect(() => {
    setForm(profileToForm(profile));
  }, [profile]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  function updateField<K extends keyof ReturnType<typeof profileToForm>>(
    key: K,
    value: ReturnType<typeof profileToForm>[K]
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSave() {
    if (!isDirty) return;
    updateProfileMutation.mutate(formToPayload(form), {
      onSuccess: () => {
        onDirtyChange?.(false);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="business-name">Business Name</Label>
          <Input
            id="business-name"
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            placeholder="Your business name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="business-email">Email</Label>
          <Input
            id="business-email"
            type="email"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder="contact@example.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="business-phone">Phone</Label>
          <Input
            id="business-phone"
            type="tel"
            value={form.phone}
            onChange={(e) => updateField("phone", e.target.value)}
            placeholder="+1 234 567 8900"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="business-website">Website</Label>
          <Input
            id="business-website"
            type="url"
            value={form.websiteUrl}
            onChange={(e) => updateField("websiteUrl", e.target.value)}
            placeholder="https://example.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="business-timezone">Timezone</Label>
          <Select value={form.timezone} onValueChange={(v) => updateField("timezone", v)}>
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
          <Select value={form.currencyCode} onValueChange={(v) => updateField("currencyCode", v)}>
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

      <div className="flex items-center justify-between gap-3">
        {isDirty ? (
          <span className="flex items-center gap-1.5 text-xs text-amber-600">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
            Unsaved changes
          </span>
        ) : (
          <span />
        )}
        <Button type="button" onClick={handleSave}>
          Save Profile
        </Button>
      </div>

      <SaveIndicator
        isPending={updateProfileMutation.isPending}
        isSuccess={updateProfileMutation.isSuccess}
        isError={updateProfileMutation.isError}
      />
    </div>
  );
}
