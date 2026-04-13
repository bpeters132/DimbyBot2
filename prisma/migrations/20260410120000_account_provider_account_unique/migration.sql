WITH ranked_accounts AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY "providerId", "accountId"
            ORDER BY "createdAt" ASC, id ASC
        ) AS row_num
    FROM "account"
)
DELETE FROM "account" AS account_row
USING ranked_accounts
WHERE account_row.id = ranked_accounts.id
  AND ranked_accounts.row_num > 1;

CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");
