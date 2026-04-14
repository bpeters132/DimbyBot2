-- Already created in `20260410040500_add_better_auth`; IF NOT EXISTS keeps deploy idempotent.
CREATE INDEX IF NOT EXISTS "session_expiresAt_idx" ON "session"("expiresAt");
