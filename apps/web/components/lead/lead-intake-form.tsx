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
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CUSTOMER_TYPE_LABELS,
  EVENT_TYPE_LABELS,
  EVENT_TYPE_VALUES,
  type CustomerTypeValue
} from "@/lib/event-customer-types";
import { broadcastNewLead } from "@/lib/caterpro-events";
import { captureAnalytics } from "@/lib/posthog";
import { parseApiError } from "@/lib/user-facing-error";
import { Check, CircleCheck, UtensilsCrossed } from "lucide-react";

const TIME_SLOTS = ["Breakfast", "Lunch", "Evening", "Late Night"] as const;

const TRUST_ITEMS = [
  "Free consultation",
  "Reply within 2 hours",
  "Personalized menu planning"
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateStep1(guestName: string, contactNumber: string, email: string): string | null {
  if (!guestName.trim()) return "Please enter your name.";
  if (!contactNumber.trim() || contactNumber.replace(/\D/g, "").length < 8) {
    return "Please enter a valid contact number.";
  }
  if (!EMAIL_RE.test(email.trim())) return "Please enter a valid email address.";
  return null;
}

function validateStep2(
  eventType: string,
  eventDate: string,
  eventStartTime: string,
  eventEndTime: string,
  eventLocation: string,
  numberOfGuests: string
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
  if (!Number.isFinite(n) || n < 1) return "Please enter the number of guests (at least 1).";
  return null;
}

export type LeadIntakeFormProps = {
  catererSlug: string;
  catererName: string;
};

export function LeadIntakeForm({ catererSlug, catererName }: LeadIntakeFormProps) {
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
    "Late Night": slotLateNight
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
        numberOfGuests
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
      numberOfGuests
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
      preferredTimeSlots
    };
    if (eventEndTime) payload.eventEndTime = eventEndTime;
    const notesTrim = additionalNotes.trim();
    if (notesTrim) payload.additionalNotes = notesTrim;

    setSubmitting(true);
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(parseApiError(body, response.status, response.statusText));
      }

      captureAnalytics("lead_form_submitted", {
        eventType,
        guestCount: Number(numberOfGuests)
      });

      broadcastNewLead();

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
      setSubmitError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function startAnother() {
    setSuccess(false);
    setSubmitError(null);
    setStepError(null);
  }

  return (
    <div className="grid min-h-screen w-full font-sans lg:grid-cols-5">
      <aside
        className="relative flex w-full flex-col justify-between overflow-hidden bg-[#1B2A4A] px-8 py-10 text-white lg:col-span-2 lg:sticky lg:top-0 lg:min-h-screen lg:self-start lg:px-10 lg:py-12"
        aria-label={`${catererName} introduction`}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px),
              radial-gradient(circle at 15% 25%, rgba(255,255,255,0.14) 0%, transparent 42%),
              radial-gradient(circle at 85% 60%, rgba(255,255,255,0.1) 0%, transparent 38%),
              radial-gradient(circle at 50% 90%, rgba(255,255,255,0.08) 0%, transparent 35%)
            `,
            backgroundSize: "28px 28px, 28px 28px, auto, auto, auto"
          }}
          aria-hidden
        />

        <div className="relative z-10 flex-1">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/20 bg-white/10 backdrop-blur-sm">
              <UtensilsCrossed className="h-6 w-6 text-white" aria-hidden />
            </div>
            <div>
              <p className="font-heading text-2xl font-semibold tracking-tight">{catererName}</p>
              <p className="text-sm text-white/70">Catering & events</p>
            </div>
          </div>

          <h1 className="font-heading text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Professional Catering for Every Occasion
          </h1>

          <ul className="mt-10 space-y-4">
            {TRUST_ITEMS.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-white/90 sm:text-base">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 mt-10 text-xs text-white/50 lg:mt-0">
          Powered by Tripeseats
        </p>
      </aside>

      <section className="flex w-full flex-col bg-white lg:col-span-3">
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-6 py-10 sm:px-10 sm:py-14">
          {success ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center animate-in fade-in-0 zoom-in-95 duration-300">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <CircleCheck className="h-9 w-9 text-emerald-600" strokeWidth={2} aria-hidden />
              </div>
              <h2 className="font-heading text-2xl font-semibold text-[#1B2A4A] sm:text-3xl">
                You&apos;re all set
              </h2>
              <p className="mt-3 max-w-sm text-muted-foreground">
                {catererName} will contact you shortly to discuss your event.
              </p>
              <Button type="button" variant="outline" className="mt-8" onClick={startAnother}>
                Submit another inquiry
              </Button>
            </div>
          ) : (
            <>
              <header className="mb-8">
                <h2 className="font-heading text-2xl font-semibold text-[#1B2A4A] sm:text-3xl">
                  {catererName}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Request a consultation — tell us about your event. It only takes a minute.
                </p>
              </header>

              <div className="mb-8 space-y-2">
                <div className="flex justify-between text-xs font-medium text-muted-foreground">
                  <span className={step >= 1 ? "text-[#1B2A4A]" : ""}>Your details</span>
                  <span className={step >= 2 ? "text-[#1B2A4A]" : ""}>Event</span>
                  <span className={step >= 3 ? "text-[#1B2A4A]" : ""}>Preferences</span>
                </div>
                <Progress value={progressValue} className="h-1.5" />
              </div>

              <div
                key={step}
                className="flex flex-1 flex-col animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
              >
                {step === 1 ? (
                  <div className="space-y-5">
                    <h3 className="font-heading text-lg font-semibold text-foreground">Your details</h3>
                    <div className="space-y-2">
                      <Label htmlFor="guestName">Full name</Label>
                      <Input
                        id="guestName"
                        autoComplete="name"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="Jane Cooper"
                      />
                    </div>
                    <div className="space-y-2">
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
                    <div className="space-y-2">
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
                    <div className="space-y-3">
                      <Label>Customer Type</Label>
                      <RadioGroup
                        value={customerType}
                        onValueChange={(v) => setCustomerType(v as CustomerTypeValue)}
                        className="flex flex-col gap-3 sm:flex-row sm:gap-6"
                      >
                        <label className="flex cursor-pointer items-start gap-2 text-sm">
                          <RadioGroupItem value="b2c" className="mt-0.5" />
                          <span>
                            <span className="font-medium">{CUSTOMER_TYPE_LABELS.b2c}</span>
                            <span className="block text-muted-foreground">
                              B2C — personal / private event
                            </span>
                          </span>
                        </label>
                        <label className="flex cursor-pointer items-start gap-2 text-sm">
                          <RadioGroupItem value="b2b" className="mt-0.5" />
                          <span>
                            <span className="font-medium">{CUSTOMER_TYPE_LABELS.b2b}</span>
                            <span className="block text-muted-foreground">
                              B2B — venue / banquet hall
                            </span>
                          </span>
                        </label>
                      </RadioGroup>
                    </div>
                  </div>
                ) : null}

                {step === 2 ? (
                  <div className="space-y-5">
                    <h3 className="font-heading text-lg font-semibold text-foreground">Event details</h3>
                    <div className="space-y-2">
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
                    <div className="space-y-2">
                      <Label htmlFor="eventDate">Event date</Label>
                      <Input
                        id="eventDate"
                        type="date"
                        value={eventDate}
                        onChange={(e) => setEventDate(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="eventStartTime">Event start time</Label>
                        <Input
                          id="eventStartTime"
                          type="time"
                          value={eventStartTime}
                          onChange={(e) => setEventStartTime(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="eventEndTime">
                          Event end time <span className="font-normal text-muted-foreground">(optional)</span>
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
                    <div className="space-y-2">
                      <Label htmlFor="eventLocation">Event location</Label>
                      <Input
                        id="eventLocation"
                        value={eventLocation}
                        onChange={(e) => setEventLocation(e.target.value)}
                        placeholder="City, venue, or address"
                      />
                    </div>
                    <div className="space-y-2">
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
                  <div className="space-y-5">
                    <h3 className="font-heading text-lg font-semibold text-foreground">Preferences</h3>
                    <fieldset>
                      <legend className="mb-3 text-sm font-medium text-foreground">Preferred time slots</legend>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {TIME_SLOTS.map((slot) => (
                          <label
                            key={slot}
                            className="flex cursor-pointer items-center gap-3 rounded-lg border border-input bg-background p-3 text-sm transition-colors hover:bg-muted/40"
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
                    <div className="space-y-2">
                      <Label htmlFor="additionalNotes">Additional notes</Label>
                      <Textarea
                        id="additionalNotes"
                        value={additionalNotes}
                        onChange={(e) => setAdditionalNotes(e.target.value)}
                        placeholder="Dietary requirements, theme, budget, or anything else we should know."
                        rows={4}
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              {stepError ? <p className="mt-4 text-sm text-destructive">{stepError}</p> : null}
              {submitError ? <p className="mt-4 text-sm text-destructive">{submitError}</p> : null}

              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-8">
                {step > 1 ? (
                  <Button type="button" variant="outline" onClick={goBack}>
                    Back
                  </Button>
                ) : (
                  <span />
                )}
                {step < 3 ? (
                  <Button type="button" className="min-w-[120px] lg:ml-auto" onClick={goNext}>
                    Continue
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="min-w-[120px] lg:ml-auto"
                    disabled={submitting}
                    onClick={handleSubmit}
                  >
                    {submitting ? "Submitting…" : "Submit"}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
