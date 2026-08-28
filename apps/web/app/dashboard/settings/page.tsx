"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, CreditCard, Loader2, Package, Shield, Users, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSettingsProfileQuery } from "@/hooks/use-settings-queries";
import { BusinessProfileSection } from "./business-profile-section";
import { CloverPaymentsSection } from "./clover-payments-section";
import { PackagesSection } from "./packages-section";
import { MenuItemsSection } from "./menu-items-section";
import { TeamSection } from "./team-section";
import { SecuritySection } from "./security-section";

export type CatererProfile = import("@/lib/settings-types").SettingsProfile;

const VALID_TABS = ["profile", "packages", "menu", "team", "payments", "security"] as const;
type SettingsTab = (typeof VALID_TABS)[number];

const OAUTH_TOAST: Record<string, { type: "success" | "error"; message: string }> = {
  connected: { type: "success", message: "Clover connected via OAuth" },
  oauth_denied: { type: "error", message: "Clover authorization was denied" },
  oauth_failed: { type: "error", message: "Clover OAuth failed — try again" },
  oauth_invalid_state: { type: "error", message: "OAuth session expired — try Connect again" },
  oauth_missing_code: { type: "error", message: "Clover did not return an auth code" },
  oauth_missing_merchant: { type: "error", message: "Clover did not return a merchant ID" },
  oauth_merchant_taken: {
    type: "error",
    message: "That Clover merchant is already linked to another account"
  },
  oauth_not_configured: { type: "error", message: "Clover OAuth app credentials are not set" },
  oauth_login_required: { type: "error", message: "Log in to Tripleseats, then Connect Clover again" },
  oauth_encrypt_failed: { type: "error", message: "Could not store Clover tokens securely" }
};

function parseTab(raw: string | null): SettingsTab {
  if (raw && VALID_TABS.includes(raw as SettingsTab)) {
    return raw as SettingsTab;
  }
  return "profile";
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = parseTab(searchParams.get("tab"));
  const [profileDirty, setProfileDirty] = useState(false);

  const { data: profile, isLoading: loading, isFetching: refreshing, error: queryError } =
    useSettingsProfileQuery();
  const error = queryError?.message ?? null;

  useEffect(() => {
    const flag = searchParams.get("clover");
    if (!flag) return;
    const cfg = OAUTH_TOAST[flag];
    if (cfg?.type === "success") toast.success(cfg.message);
    else if (cfg?.type === "error") toast.error(cfg.message);
    // Drop query noise but keep payments tab
    router.replace(`/dashboard/settings?tab=payments`);
  }, [searchParams, router]);

  const handleTabSwitch = useCallback(
    (tab: string) => {
      if (profileDirty && tab !== activeTab) {
        const confirmed = window.confirm("You have unsaved changes. Leave anyway?");
        if (!confirmed) return;
      }
      router.replace(`/dashboard/settings?tab=${tab}`);
    },
    [profileDirty, activeTab, router]
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

      <Tabs value={activeTab} onValueChange={handleTabSwitch} className="space-y-6">
        <TabsList className="grid w-full max-w-4xl grid-cols-3 sm:grid-cols-6">
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
          <TabsTrigger value="payments" className="gap-2">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Payments</span>
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Staff</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Security</span>
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
              {profile ? (
                <BusinessProfileSection profile={profile} onDirtyChange={setProfileDirty} />
              ) : null}
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

        <TabsContent value="payments" forceMount className="data-[state=inactive]:hidden">
          <Card>
            <CardHeader>
              <CardTitle>Card payments</CardTitle>
              <CardDescription>
                Connect your Clover Hosted Checkout account to send payment links to guests
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CloverPaymentsSection />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" forceMount className="data-[state=inactive]:hidden">
          <Card>
            <CardHeader>
              <CardTitle>Staff &amp; Access</CardTitle>
              <CardDescription>
                Manage administrators and employees who access your workspace
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TeamSection />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" forceMount className="data-[state=inactive]:hidden">
          <Card>
            <CardHeader>
              <CardTitle>Account security</CardTitle>
              <CardDescription>
                Protect your login with two-factor authentication and strong password policies
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SecuritySection />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SettingsPageInner />
    </Suspense>
  );
}
