-- External vendor calendar-only users (run in Supabase if migration not deployed)

ALTER TYPE "TeamRole" ADD VALUE IF NOT EXISTS 'calendar_only';
