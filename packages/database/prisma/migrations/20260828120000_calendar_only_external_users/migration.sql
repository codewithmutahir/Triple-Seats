-- External vendor calendar-only users (invited by super admin via email)

ALTER TYPE "TeamRole" ADD VALUE IF NOT EXISTS 'calendar_only';
