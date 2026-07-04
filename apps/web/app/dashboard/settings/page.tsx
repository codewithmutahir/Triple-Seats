"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Package, UtensilsCrossed, Loader2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BusinessProfileSection } from "./business-profile-section";
import { PackagesSection } from "./packages-section";
import { MenuItemsSection } from "./menu-items-section";

export type CatererProfile = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  timezone: string | null;
  currencyCode: string;
  websiteUrl: string | null;
};

export default function SettingsPage() {
  const [profile, setProfile] = useState<CatererProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/caterer", { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load profile");
      }
      const data = await res.json();
      setProfile(data.caterer);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
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

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Business Profile</CardTitle>
              <CardDescription>
                Your business information that appears on quotes and communications
              </CardDescription>
            </CardHeader>
            <CardContent>
              {profile && (
                <BusinessProfileSection
                  profile={profile}
                  onUpdate={setProfile}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="packages">
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

        <TabsContent value="menu">
          <Card>
            <CardHeader>
              <CardTitle>Menu Items</CardTitle>
              <CardDescription>
                Manage your menu catalog with default prices. These items appear as suggestions in the quote builder.
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
