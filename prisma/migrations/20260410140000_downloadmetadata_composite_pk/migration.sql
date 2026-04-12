UPDATE "DownloadMetadata"
SET "guildId" = 'UNKNOWN'
WHERE "guildId" IS NULL;

WITH ranked_rows AS (
    SELECT
        ctid,
        ROW_NUMBER() OVER (
            PARTITION BY "fileName", "guildId"
            ORDER BY "downloadDate" DESC NULLS LAST, "originalUrl" DESC NULLS LAST, "filePath" DESC NULLS LAST
        ) AS row_num
    FROM "DownloadMetadata"
)
DELETE FROM "DownloadMetadata" AS dm
USING ranked_rows
WHERE dm.ctid = ranked_rows.ctid
  AND ranked_rows.row_num > 1;

ALTER TABLE "DownloadMetadata" ALTER COLUMN "guildId" SET NOT NULL;

ALTER TABLE "DownloadMetadata" DROP CONSTRAINT "DownloadMetadata_pkey";

ALTER TABLE "DownloadMetadata" ADD CONSTRAINT "DownloadMetadata_pkey" PRIMARY KEY ("fileName", "guildId");
