-- Token lookups on Better Auth verification rows often filter by `value`.
CREATE INDEX "verification_value_idx" ON "verification"("value");
