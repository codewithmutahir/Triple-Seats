-- Better Auth 1.7+ revokes credential passwords on magic-link sign-in when emailVerified=false.
-- Tripeseats does not require a separate email verification step (requireEmailVerification: false).
UPDATE "user"
SET "emailVerified" = true
WHERE "emailVerified" = false;
