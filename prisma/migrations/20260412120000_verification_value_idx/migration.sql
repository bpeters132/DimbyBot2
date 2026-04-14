-- Token lookups on Better Auth verification rows often filter by `value`.
-- Index already exists from `20260410040500_add_better_auth`; IF NOT EXISTS avoids duplicate on fresh DBs.
CREATE INDEX IF NOT EXISTS "verification_value_idx" ON "verification"("value");
