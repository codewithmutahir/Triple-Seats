import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { usePermissions } from "@/hooks/use-permissions";
import { api } from "@/lib/api";
import { denyMutation, handleMutationError } from "@/lib/mutation-guard";
import { queryKeys } from "@/lib/query-keys";
import {
  EMPTY_MENU_ITEMS_BY_CATEGORY,
  type SettingsMenuItemsByCategory,
  type SettingsPackage,
  type SettingsProfile
} from "@/lib/settings-types";

export type ProfileFormData = {
  name: string;
  email: string;
  phone: string;
  timezone: string;
  currencyCode: string;
  websiteUrl: string;
};

export type ProfileUpdatePayload = {
  name: string;
  email: string;
  phone: string | null;
  timezone: string;
  currencyCode: string;
  websiteUrl: string | null;
};

export type PackageWriteBody = {
  name: string;
  description: string | null;
  minGuests: number;
  items: { label: string; quantity: number; sortOrder: number }[];
  tiers: {
    customerType: "b2b" | "b2c";
    minGuests: number;
    maxGuests: number | null;
    pricePerHead: number;
  }[];
};

function invalidateQuoteBuilders(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: queryKeys.quotes.all });
}

function useSettingsWriteAccess() {
  const { can } = usePermissions();
  return can("settings:write");
}

export function useSettingsProfileQuery() {
  return useQuery({
    queryKey: queryKeys.settings.profile(),
    queryFn: api.settings.profile,
    staleTime: 5 * 60 * 1000
  });
}

export function useSettingsPackagesQuery() {
  return useQuery({
    queryKey: queryKeys.settings.packages(),
    queryFn: api.settings.packages,
    staleTime: 5 * 60 * 1000
  });
}

export function useSettingsMenuItemsQuery() {
  return useQuery({
    queryKey: queryKeys.menuItems.allGrouped(),
    queryFn: api.settings.menuItemsAll,
    staleTime: 5 * 60 * 1000
  });
}

export function useUpdateProfileMutation() {
  const qc = useQueryClient();
  const canWrite = useSettingsWriteAccess();

  return useMutation({
    mutationFn: (data: ProfileUpdatePayload) => api.settings.updateProfile(data),
    onMutate: async (newData) => {
      if (!canWrite) return denyMutation();
      await qc.cancelQueries({ queryKey: queryKeys.settings.profile() });
      const snapshot = qc.getQueryData<SettingsProfile>(queryKeys.settings.profile());
      qc.setQueryData<SettingsProfile>(queryKeys.settings.profile(), (old) =>
        old ? { ...old, ...newData } : ({ id: "", ...newData } as SettingsProfile)
      );
      return { snapshot };
    },
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.settings.profile(), updated);
      toast.success("Profile saved");
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.snapshot) {
        qc.setQueryData(queryKeys.settings.profile(), ctx.snapshot);
      }
      handleMutationError(err, ctx, "Failed to save profile");
    }
  });
}

export function useCreatePackageMutation() {
  const qc = useQueryClient();
  const canWrite = useSettingsWriteAccess();

  return useMutation({
    mutationFn: (body: PackageWriteBody) => api.settings.createPackage(body),
    onMutate: async (body) => {
      if (!canWrite) return denyMutation();
      await qc.cancelQueries({ queryKey: queryKeys.settings.packages() });
      const snapshot = qc.getQueryData<SettingsPackage[]>(queryKeys.settings.packages());
      const tempId = `temp_${Date.now()}`;
      const temp: SettingsPackage = {
        id: tempId,
        name: body.name,
        description: body.description,
        sortOrder: (snapshot?.length ?? 0) + 1,
        minGuests: body.minGuests,
        tiers: body.tiers.map((t, i) => ({
          id: `temp_tier_${tempId}_${i}`,
          customerType: t.customerType,
          minGuests: t.minGuests,
          maxGuests: t.maxGuests,
          pricePerHead: t.pricePerHead
        })),
        items: body.items.map((item, idx) => ({
          id: `temp_item_${tempId}_${idx}`,
          label: item.label,
          quantity: item.quantity,
          sortOrder: item.sortOrder
        }))
      };
      qc.setQueryData<SettingsPackage[]>(queryKeys.settings.packages(), (old = []) => [...old, temp]);
      return { snapshot, tempId };
    },
    onSuccess: (created, _vars, ctx) => {
      qc.setQueryData<SettingsPackage[]>(queryKeys.settings.packages(), (old = []) =>
        old.map((p) => (p.id === ctx?.tempId ? created : p))
      );
      invalidateQuoteBuilders(qc);
      toast.success("Package saved");
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.snapshot) {
        qc.setQueryData(queryKeys.settings.packages(), ctx.snapshot);
      }
      handleMutationError(err, ctx, "Failed to create package");
    }
  });
}

export function useUpdatePackageMutation() {
  const qc = useQueryClient();
  const canWrite = useSettingsWriteAccess();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: PackageWriteBody }) =>
      api.settings.updatePackage(id, body),
    onMutate: async ({ id, body }) => {
      if (!canWrite) return denyMutation();
      await qc.cancelQueries({ queryKey: queryKeys.settings.packages() });
      const snapshot = qc.getQueryData<SettingsPackage[]>(queryKeys.settings.packages());
      qc.setQueryData<SettingsPackage[]>(queryKeys.settings.packages(), (old = []) =>
        old.map((p) =>
          p.id === id
            ? {
                ...p,
                name: body.name,
                description: body.description,
                minGuests: body.minGuests,
                items: body.items.map((item, idx) => ({
                  id: p.items[idx]?.id ?? `temp_item_${id}_${idx}`,
                  label: item.label,
                  quantity: item.quantity,
                  sortOrder: item.sortOrder
                })),
                tiers: body.tiers.map((t, i) => ({
                  id: p.tiers.find(
                    (tier) =>
                      tier.customerType === t.customerType &&
                      tier.minGuests === t.minGuests &&
                      tier.maxGuests === t.maxGuests
                  )?.id ?? `temp_tier_${id}_${i}`,
                  customerType: t.customerType,
                  minGuests: t.minGuests,
                  maxGuests: t.maxGuests,
                  pricePerHead: t.pricePerHead
                }))
              }
            : p
        )
      );
      return { snapshot };
    },
    onSuccess: (updated) => {
      qc.setQueryData<SettingsPackage[]>(queryKeys.settings.packages(), (old = []) =>
        old.map((p) => (p.id === updated.id ? updated : p))
      );
      invalidateQuoteBuilders(qc);
      toast.success("Package saved");
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.snapshot) {
        qc.setQueryData(queryKeys.settings.packages(), ctx.snapshot);
      }
      handleMutationError(err, ctx, "Failed to save package");
    }
  });
}

export function useDeletePackageMutation() {
  const qc = useQueryClient();
  const canWrite = useSettingsWriteAccess();

  return useMutation({
    mutationFn: (packageId: string) => api.settings.deletePackage(packageId),
    onMutate: async (packageId) => {
      if (!canWrite) return denyMutation();
      await qc.cancelQueries({ queryKey: queryKeys.settings.packages() });
      const snapshot = qc.getQueryData<SettingsPackage[]>(queryKeys.settings.packages());
      qc.setQueryData<SettingsPackage[]>(queryKeys.settings.packages(), (old = []) =>
        old.filter((p) => p.id !== packageId)
      );
      return { snapshot };
    },
    onSuccess: () => {
      invalidateQuoteBuilders(qc);
      toast.success("Package deleted");
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.snapshot) {
        qc.setQueryData(queryKeys.settings.packages(), ctx.snapshot);
      }
      handleMutationError(err, ctx, "Failed to delete package");
    }
  });
}

export function useUpdateTierPriceMutation() {
  const qc = useQueryClient();
  const canWrite = useSettingsWriteAccess();

  return useMutation({
    mutationFn: ({ tierId, pricePerHead }: { tierId: string; pricePerHead: number }) =>
      api.settings.updateTierPrice(tierId, pricePerHead),
    onMutate: async ({ tierId, pricePerHead }) => {
      if (!canWrite) return denyMutation();
      await qc.cancelQueries({ queryKey: queryKeys.settings.packages() });
      const snapshot = qc.getQueryData<SettingsPackage[]>(queryKeys.settings.packages());
      qc.setQueryData<SettingsPackage[]>(queryKeys.settings.packages(), (old = []) =>
        old.map((pkg) => ({
          ...pkg,
          tiers: pkg.tiers.map((tier) =>
            tier.id === tierId ? { ...tier, pricePerHead } : tier
          )
        }))
      );
      return { snapshot };
    },
    onSuccess: () => {
      invalidateQuoteBuilders(qc);
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.snapshot) {
        qc.setQueryData(queryKeys.settings.packages(), ctx.snapshot);
      }
      handleMutationError(err, ctx, "Failed to update tier price");
    }
  });
}

export type MenuItemWriteBody = {
  name: string;
  defaultPrice: number | null;
  defaultUnit: string;
  category: string;
};

export function useCreateMenuItemMutation() {
  const qc = useQueryClient();
  const canWrite = useSettingsWriteAccess();
  const menuKey = queryKeys.menuItems.allGrouped();

  return useMutation({
    mutationFn: (body: MenuItemWriteBody) => api.settings.createMenuItem(body),
    onMutate: async (body) => {
      if (!canWrite) return denyMutation();
      await qc.cancelQueries({ queryKey: menuKey });
      const snapshot = qc.getQueryData<SettingsMenuItemsByCategory>(menuKey);
      const category = body.category as keyof SettingsMenuItemsByCategory;
      const tempId = `temp_${Date.now()}`;
      qc.setQueryData<SettingsMenuItemsByCategory>(menuKey, (old) => {
        const base = old ?? { ...EMPTY_MENU_ITEMS_BY_CATEGORY };
        return {
          ...base,
          [category]: [
            ...(base[category] ?? []),
            {
              id: tempId,
              catererId: "",
              category,
              name: body.name,
              defaultPrice: body.defaultPrice,
              defaultUnit: body.defaultUnit as SettingsMenuItemsByCategory[typeof category][number]["defaultUnit"],
              usageCount: 0,
              isDefault: false
            }
          ]
        };
      });
      return { snapshot, tempId, category };
    },
    onSuccess: (created, vars, ctx) => {
      if (!ctx) return;
      qc.setQueryData<SettingsMenuItemsByCategory>(menuKey, (old) => {
        const base = old ?? { ...EMPTY_MENU_ITEMS_BY_CATEGORY };
        return {
          ...base,
          [ctx.category]: (base[ctx.category] ?? []).map((item) =>
            item.id === ctx.tempId ? created : item
          )
        };
      });
      invalidateQuoteBuilders(qc);
      toast.success("Menu item saved");
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.snapshot) {
        qc.setQueryData(menuKey, ctx.snapshot);
      }
      handleMutationError(err, ctx, "Failed to save menu item");
    }
  });
}

export function useUpdateMenuItemMutation() {
  const qc = useQueryClient();
  const canWrite = useSettingsWriteAccess();
  const menuKey = queryKeys.menuItems.allGrouped();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: MenuItemWriteBody }) =>
      api.settings.updateMenuItem(id, body),
    onMutate: async ({ id, body }) => {
      if (!canWrite) return denyMutation();
      await qc.cancelQueries({ queryKey: menuKey });
      const snapshot = qc.getQueryData<SettingsMenuItemsByCategory>(menuKey);
      const category = body.category as keyof SettingsMenuItemsByCategory;
      qc.setQueryData<SettingsMenuItemsByCategory>(menuKey, (old) => {
        const base = old ?? { ...EMPTY_MENU_ITEMS_BY_CATEGORY };
        return {
          ...base,
          [category]: (base[category] ?? []).map((item) =>
            item.id === id
              ? {
                  ...item,
                  name: body.name,
                  defaultPrice: body.defaultPrice,
                  defaultUnit: body.defaultUnit as typeof item.defaultUnit
                }
              : item
          )
        };
      });
      return { snapshot };
    },
    onSuccess: (updated) => {
      qc.setQueryData<SettingsMenuItemsByCategory>(menuKey, (old) => {
        if (!old) return old;
        const category = updated.category as keyof SettingsMenuItemsByCategory;
        return {
          ...old,
          [category]: (old[category] ?? []).map((item) => (item.id === updated.id ? updated : item))
        };
      });
      invalidateQuoteBuilders(qc);
      toast.success("Menu item saved");
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.snapshot) {
        qc.setQueryData(menuKey, ctx.snapshot);
      }
      handleMutationError(err, ctx, "Failed to save menu item");
    }
  });
}

export function useDeleteMenuItemMutation() {
  const qc = useQueryClient();
  const canWrite = useSettingsWriteAccess();
  const menuKey = queryKeys.menuItems.allGrouped();

  return useMutation({
    mutationFn: ({ id }: { id: string; category: keyof SettingsMenuItemsByCategory }) =>
      api.settings.deleteMenuItem(id),
    onMutate: async ({ id, category }) => {
      if (!canWrite) return denyMutation();
      await qc.cancelQueries({ queryKey: menuKey });
      const snapshot = qc.getQueryData<SettingsMenuItemsByCategory>(menuKey);
      qc.setQueryData<SettingsMenuItemsByCategory>(menuKey, (old) => {
        const base = old ?? { ...EMPTY_MENU_ITEMS_BY_CATEGORY };
        return {
          ...base,
          [category]: (base[category] ?? []).filter((item) => item.id !== id)
        };
      });
      return { snapshot };
    },
    onSuccess: () => {
      invalidateQuoteBuilders(qc);
      toast.success("Menu item deleted");
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.snapshot) {
        qc.setQueryData(menuKey, ctx.snapshot);
      }
      handleMutationError(err, ctx, "Failed to delete menu item");
    }
  });
}
