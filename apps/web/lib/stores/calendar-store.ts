import { create } from "zustand";

import type { CalendarEvent } from "@/app/dashboard/calendar/types";

interface MonthCache {
  events: CalendarEvent[];
  fetchedAt: number;
}

interface CalendarStore {
  cache: Record<string, MonthCache>;
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
  setMonthEvents: (monthKey: string, events: CalendarEvent[]) => void;
  seedEventsByMonth: (grouped: Record<string, CalendarEvent[]>) => void;
  getMonthEvents: (monthKey: string) => CalendarEvent[] | null;
  isFresh: (monthKey: string) => boolean;
}

const CACHE_TTL = 5 * 60 * 1000;

export const useCalendarStore = create<CalendarStore>((set, get) => ({
  cache: {},
  isLoading: false,

  setLoading: (loading) => set({ isLoading: loading }),

  setMonthEvents: (monthKey, events) =>
    set((state) => ({
      cache: {
        ...state.cache,
        [monthKey]: {
          events,
          fetchedAt: Date.now()
        }
      }
    })),

  seedEventsByMonth: (grouped) =>
    set((state) => {
      const now = Date.now();
      const cache = { ...state.cache };
      for (const [key, events] of Object.entries(grouped)) {
        cache[key] = { events, fetchedAt: now };
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
    if (!entry) return false;
    return Date.now() - entry.fetchedAt < CACHE_TTL;
  }
}));
