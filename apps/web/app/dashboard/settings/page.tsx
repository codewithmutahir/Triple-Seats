"use client";

import { useCallback } from "react";
import { Building2, Package, UtensilsCrossed, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSettingsProfileQuery } from "@/hooks/use-reports-query";
import type { SettingsProfile } from "@/lib/settings-types";
import { queryKeys } from "@/lib/query-keys";
import { BusinessProfileSection } from "./business-profile-section";
import { PackagesSection } from "./packages-section";
import { MenuItemsSection } from "./menu-items-section";

export type CatererProfile = SettingsProfile;

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data: profile, isLoading: loading, isFetching: refreshing, error: queryError } =
    useSettingsProfileQuery();
  const error = queryError?.message ?? null;

  const handleProfileUpdate = useCallback(
    (next: SettingsProfile) => {
      qc.setQueryData(queryKeys.settings.profile(), next);
    },
    [qc]
  );

  if (loading && !profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !profile) {
    return (
      <Card className="border-destructive">
        <CardContent className="py-8 text-center">
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Manage your business profile, packages, and menu items
          {refreshing ? " · refreshing…" : ""}
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="profile" className="gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="packages" className="gap-2">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Packages</span>
          </TabsTrigger>
          <TabsTrigger value="menu" className="gap-2">
            <UtensilsCrossed className="h-4 w-4" />
            <span className="hidden sm:inline">Menu</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" forceMount className="data-[state=inactive]:hidden">
          <Card>
            <CardHeader>
              <CardTitle>Business Profile</CardTitle>
              <CardDescription>
                Your business information that appears on quotes and communications
              </CardDescription>
            </CardHeader>
            <CardContent>
              {profile && (
                <BusinessProfileSection profile={profile} onUpdate={handleProfileUpdate} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="packages" forceMount className="data-[state=inactive]:hidden">
          <Card>
            <CardHeader>
              <CardTitle>Catering Packages</CardTitle>
              <CardDescription>
                Create and manage your catering packages with tiered pricing
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PackagesSection />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="menu" forceMount className="data-[state=inactive]:hidden">
          <Card>
            <CardHeader>
              <CardTitle>Menu Items</CardTitle>
              <CardDescription>
                Manage your menu catalog with default prices. These items appear as suggestions in
                the quote builder.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MenuItemsSection />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
