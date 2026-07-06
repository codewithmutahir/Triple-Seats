import { create } from "zustand";

import type { CalendarEvent } from "@/app/dashboard/calendar/types";

interface MonthCache {
  events: CalendarEvent[];
  fetchedAt: number;
  verified: boolean; // true only when data came from a real (client) API response
}

interface CalendarStore {
  cache: Record<string, MonthCache>;
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
  setMonthEvents: (monthKey: string, events: CalendarEvent[], verified?: boolean) => void;
  seedEventsByMonth: (grouped: Record<string, CalendarEvent[]>, verified?: boolean) => void;
  getMonthEvents: (monthKey: string) => CalendarEvent[] | null;
  isFresh: (monthKey: string) => boolean;
}

const CACHE_TTL = 5 * 60 * 1000;

export const useCalendarStore = create<CalendarStore>((set, get) => ({
  cache: {},
  isLoading: false,

  setLoading: (loading) => set({ isLoading: loading }),

  setMonthEvents: (monthKey, events, verified = true) =>
    set((state) => ({
      cache: {
        ...state.cache,
        [monthKey]: {
          events,
          fetchedAt: Date.now(),
          verified
        }
      }
    })),

  seedEventsByMonth: (grouped, verified = true) =>
    set((state) => {
      const now = Date.now();
      const cache = { ...state.cache };
      for (const [key, events] of Object.entries(grouped)) {
        cache[key] = { events, fetchedAt: now, verified };
      }
      return { cache };
    }),

  getMonthEvents: (monthKey) => {
    const entry = get().cache[monthKey];
    if (!entry) return null;
    return entry.events;
  },

  isFresh: (monthKey) => {
    const entry = get().cache[monthKey];
    if (!entry || !entry.verified) return false;
    return Date.now() - entry.fetchedAt < CACHE_TTL;
  }
}));