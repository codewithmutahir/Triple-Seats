"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CUSTOMER_TYPE_LABELS,
  EVENT_TYPE_LABELS,
  EVENT_TYPE_VALUES,
  type CustomerTypeValue,
} from "@/lib/event-customer-types";
import { parseApiError } from "@/lib/user-facing-error";
import { CircleCheck } from "lucide-react";

const TIME_SLOTS = ["Breakfast", "Lunch", "Evening", "Late Night"] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateStep1(
  guestName: string,
  contactNumber: string,
  email: string,
): string | null {
  if (!guestName.trim()) return "Please enter your name.";
  if (!contactNumber.trim() || contactNumber.replace(/\D/g, "").length < 8) {
    return "Please enter a valid contact number.";
  }
  if (!EMAIL_RE.test(email.trim()))
    return "Please enter a valid email address.";
  return null;
}

function validateStep2(
  eventType: string,
  eventDate: string,
  eventStartTime: string,
  eventEndTime: string,
  eventLocation: string,
  numberOfGuests: string,
): string | null {
  if (!eventType) return "Please select an event.";
  if (!eventDate) return "Please choose an event date.";
  const d = new Date(eventDate);
  if (Number.isNaN(d.getTime())) return "Please enter a valid event date.";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d < today) return "Event date must be in the future.";
  if (!eventStartTime) return "Please choose when your event starts.";
  if (eventEndTime && eventEndTime <= eventStartTime) {
    return "End time must be after start time.";
  }
  if (!eventLocation.trim()) return "Please enter the event location.";
  const n = Number(numberOfGuests);
  if (!Number.isFinite(n) || n < 1)
    return "Please enter the number of guests (at least 1).";
  return null;
}

export type LeadIntakeFormEmbedProps = {
  catererSlug: string;
  catererName: string;
  /** API base URL for cross-origin submissions */
  apiBaseUrl?: string;
  /** Accent color (hex) */
  accentColor?: string;
};

export function LeadIntakeFormEmbed({
  catererSlug,
  catererName,
  apiBaseUrl = "",
  accentColor = "#1B2A4A",
}: LeadIntakeFormEmbedProps) {
  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState<string | null>(null);

  const [guestName, setGuestName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [email, setEmail] = useState("");
  const [customerType, setCustomerType] = useState<CustomerTypeValue>("b2c");

  const [eventType, setEventType] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventStartTime, setEventStartTime] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [numberOfGuests, setNumberOfGuests] = useState("");

  const [slotBreakfast, setSlotBreakfast] = useState(false);
  const [slotLunch, setSlotLunch] = useState(false);
  const [slotEvening, setSlotEvening] = useState(false);
  const [slotLateNight, setSlotLateNight] = useState(false);
  const [additionalNotes, setAdditionalNotes] = useState("");

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const progressValue = (step / 3) * 100;

  const slotState: Record<(typeof TIME_SLOTS)[number], boolean> = {
    Breakfast: slotBreakfast,
    Lunch: slotLunch,
    Evening: slotEvening,
    "Late Night": slotLateNight,
  };

  const setSlot = (slot: (typeof TIME_SLOTS)[number], checked: boolean) => {
    if (slot === "Breakfast") setSlotBreakfast(checked);
    if (slot === "Lunch") setSlotLunch(checked);
    if (slot === "Evening") setSlotEvening(checked);
    if (slot === "Late Night") setSlotLateNight(checked);
  };

  function goNext() {
    setStepError(null);
    if (step === 1) {
      const err = validateStep1(guestName, contactNumber, email);
      if (err) {
        setStepError(err);
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      const err = validateStep2(
        eventType,
        eventDate,
        eventStartTime,
        eventEndTime,
        eventLocation,
        numberOfGuests,
      );
      if (err) {
        setStepError(err);
        return;
      }
      setStep(3);
    }
  }

  function goBack() {
    setStepError(null);
    setStep((s) => Math.max(1, s - 1));
  }

  async function handleSubmit() {
    setStepError(null);
    setSubmitError(null);

    const err1 = validateStep1(guestName, contactNumber, email);
    if (err1) {
      setStepError(err1);
      setStep(1);
      return;
    }

    const err = validateStep2(
      eventType,
      eventDate,
      eventStartTime,
      eventEndTime,
      eventLocation,
      numberOfGuests,
    );
    if (err) {
      setStepError(err);
      setStep(2);
      return;
    }

    const preferredTimeSlots = TIME_SLOTS.filter((s) => slotState[s]);

    const payload: Record<string, unknown> = {
      catererSlug,
      guestName: guestName.trim(),
      contactNumber: contactNumber.trim(),
      email: email.trim(),
      eventType,
      customerType,
      eventLocation: eventLocation.trim(),
      eventDate,
      eventStartTime,
      numberOfGuests: Number(numberOfGuests),
      preferredTimeSlots,
    };
    if (eventEndTime) payload.eventEndTime = eventEndTime;
    const notesTrim = additionalNotes.trim();
    if (notesTrim) payload.additionalNotes = notesTrim;

    setSubmitting(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(
          parseApiError(body, response.status, response.statusText),
        );
      }

      // Notify parent window if embedded
      if (window.parent !== window) {
        window.parent.postMessage(
          { type: "tripeseats:lead_submitted", catererSlug },
          "*",
        );
      }

      setSuccess(true);
      setGuestName("");
      setContactNumber("");
      setEmail("");
      setCustomerType("b2c");
      setEventType("");
      setEventDate("");
      setEventStartTime("");
      setEventEndTime("");
      setEventLocation("");
      setNumberOfGuests("");
      setSlotBreakfast(false);
      setSlotLunch(false);
      setSlotEvening(false);
      setSlotLateNight(false);
      setAdditionalNotes("");
      setStep(1);
    } catch (e) {
      setSubmitError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function startAnother() {
    setSuccess(false);
    setSubmitError(null);
    setStepError(null);
  }

  const accentStyle = { "--accent-color": accentColor } as React.CSSProperties;

  return (
    <div className="min-h-full w-full bg-white font-sans" style={accentStyle}>
      <div className="mx-auto max-w-lg px-4 py-6 sm:px-6 sm:py-8">
        {success ? (
          <div className="flex flex-col items-center justify-center text-center py-12 animate-in fade-in-0 zoom-in-95 duration-300">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CircleCheck
                className="h-9 w-9 text-emerald-600"
                strokeWidth={2}
                aria-hidden
              />
            </div>
            <h2 className="font-heading text-2xl font-semibold text-gray-900">
              You&apos;re all set!
            </h2>
            <p className="mt-3 max-w-sm text-gray-600">
              {catererName} will contact you shortly to discuss your event.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-8"
              onClick={startAnother}
            >
              Submit another inquiry
            </Button>
          </div>
        ) : (
          <>
            <header className="mb-6">
              <h2
                className="font-heading text-xl font-semibold sm:text-2xl"
                style={{ color: accentColor }}
              >
                Request a consultation
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Tell {catererName} about your event.
              </p>
            </header>

            <div className="mb-6 space-y-2">
              <div className="flex justify-between text-xs font-medium text-gray-500">
                <span className={step >= 1 ? "text-gray-900" : ""}>
                  Your details
                </span>
                <span className={step >= 2 ? "text-gray-900" : ""}>Event</span>
                <span className={step >= 3 ? "text-gray-900" : ""}>
                  Preferences
                </span>
              </div>
              <Progress value={progressValue} className="h-1.5" />
            </div>

            <div
              key={step}
              className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
            >
              {step === 1 ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="guestName">Full name</Label>
                    <Input
                      id="guestName"
                      autoComplete="name"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Jane Cooper"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contactNumber">Contact number</Label>
                    <Input
                      id="contactNumber"
                      type="tel"
                      autoComplete="tel"
                      value={contactNumber}
                      onChange={(e) => setContactNumber(e.target.value)}
                      placeholder="+1 555 0100"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Customer Type</Label>
                    <RadioGroup
                      value={customerType}
                      onValueChange={(v) =>
                        setCustomerType(v as CustomerTypeValue)
                      }
                      className="flex flex-col gap-2 sm:flex-row sm:gap-4"
                    >
                      <label className="flex cursor-pointer items-start gap-2 text-sm">
                        <RadioGroupItem value="b2c" className="mt-0.5" />
                        <span>
                          <span className="font-medium">{CUSTOMER_TYPE_LABELS.b2c}</span>
                          <span className="block text-muted-foreground">B2C</span>
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-2 text-sm">
                        <RadioGroupItem value="b2b" className="mt-0.5" />
                        <span>
                          <span className="font-medium">{CUSTOMER_TYPE_LABELS.b2b}</span>
                          <span className="block text-muted-foreground">B2B</span>
                        </span>
                      </label>
                    </RadioGroup>
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Event</Label>
                    <Select value={eventType} onValueChange={setEventType}>
                      <SelectTrigger aria-label="Event">
                        <SelectValue placeholder="Select event" />
                      </SelectTrigger>
                      <SelectContent>
                        {EVENT_TYPE_VALUES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {EVENT_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="eventDate">Event date</Label>
                    <Input
                      id="eventDate"
                      type="date"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="eventStartTime">Start time</Label>
                      <Input
                        id="eventStartTime"
                        type="time"
                        value={eventStartTime}
                        onChange={(e) => setEventStartTime(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="eventEndTime">
                        End time{" "}
                        <span className="font-normal text-gray-400">
                          (optional)
                        </span>
                      </Label>
                      <Input
                        id="eventEndTime"
                        type="time"
                        value={eventEndTime}
                        onChange={(e) => setEventEndTime(e.target.value)}
                        min={eventStartTime || undefined}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="eventLocation">Event location</Label>
                    <Input
                      id="eventLocation"
                      value={eventLocation}
                      onChange={(e) => setEventLocation(e.target.value)}
                      placeholder="City, venue, or address"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="numberOfGuests">Number of guests</Label>
                    <Input
                      id="numberOfGuests"
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={numberOfGuests}
                      onChange={(e) => setNumberOfGuests(e.target.value)}
                      placeholder="120"
                    />
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="space-y-4">
                  <fieldset>
                    <legend className="mb-2 text-sm font-medium">
                      Preferred time slots
                    </legend>
                    <div className="grid grid-cols-2 gap-2">
                      {TIME_SLOTS.map((slot) => (
                        <label
                          key={slot}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white p-2.5 text-sm transition-colors hover:bg-gray-50"
                        >
                          <Checkbox
                            checked={slotState[slot]}
                            onCheckedChange={(v) => setSlot(slot, v === true)}
                            aria-label={slot}
                          />
                          <span>{slot}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="space-y-1.5">
                    <Label htmlFor="additionalNotes">Additional notes</Label>
                    <Textarea
                      id="additionalNotes"
                      value={additionalNotes}
                      onChange={(e) => setAdditionalNotes(e.target.value)}
                      placeholder="Dietary requirements, theme, budget..."
                      rows={3}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            {stepError ? (
              <p className="mt-3 text-sm text-red-600">{stepError}</p>
            ) : null}
            {submitError ? (
              <p className="mt-3 text-sm text-red-600">{submitError}</p>
            ) : null}

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-gray-100 pt-6">
              {step > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={goBack}
                >
                  Back
                </Button>
              ) : (
                <span />
              )}
              {step < 3 ? (
                <Button
                  type="button"
                  size="sm"
                  className="min-w-[100px]"
                  style={{ backgroundColor: accentColor }}
                  onClick={goNext}
                >
                  Continue
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="min-w-[100px]"
                  style={{ backgroundColor: accentColor }}
                  disabled={submitting}
                  onClick={handleSubmit}
                >
                  {submitting ? "Submitting…" : "Submit"}
                </Button>
              )}
            </div>

            <p className="mt-6 text-center text-xs text-gray-400">
              Powered by{" "}
              <a
                href="https://tripeseats.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-gray-600"
              >
                Tripeseats
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
