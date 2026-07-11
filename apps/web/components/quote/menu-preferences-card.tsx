"use client";

import { useQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useState } from "react";

import {
  MenuPreferencesForm,
  menuPreferencesSummary
} from "@/components/quote/menu-preferences-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

type MenuPreferencesCardProps = {
  eventId: string;
  readOnly?: boolean;
  variant?: "compact" | "full";
  quoteBuilderLink?: string;
};

export function MenuPreferencesCard({
  eventId,
  readOnly = false,
  variant = "compact",
  quoteBuilderLink
}: MenuPreferencesCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const key = queryKeys.events.menuPreferences(eventId);

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => api.events.menuPreferences(eventId),
    enabled: Boolean(eventId),
    staleTime: 60_000
  });

  if (isLoading) {
    return null;
  }

  if (!data?.hasPackage && variant === "compact") {
    return null;
  }

  if (variant === "full") {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">Menu Preferences</CardTitle>
          {readOnly && quoteBuilderLink ? (
            <Button variant="outline" size="sm" asChild>
              <a href={quoteBuilderLink}>Edit in Quote Builder</a>
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <MenuPreferencesForm eventId={eventId} readOnly={readOnly} />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Menu Preferences</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {data?.packageName ? `${data.packageName} — ` : ""}
            {menuPreferencesSummary(data)}
          </p>
          {!readOnly ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setSheetOpen(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit Preferences
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Menu Preferences</SheetTitle>
            <SheetDescription>
              Choose dishes for each package slot. Saves apply to the kitchen sheet.
            </SheetDescription>
          </SheetHeader>
          <div className="px-6 pb-6">
            <MenuPreferencesForm
              eventId={eventId}
              initialData={data}
              onSaved={() => setSheetOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
