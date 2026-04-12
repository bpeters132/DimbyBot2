UPDATE "DownloadMetadata"
SET "guildId" = ''
WHERE "guildId" IS NULL;

WITH ranked_rows AS (
    SELECT
        "fileName",
        "guildId",
        "downloadDate",
        "originalUrl",
        "filePath",
        ROW_NUMBER() OVER (
            PARTITION BY "fileName", "guildId"
            ORDER BY "downloadDate" DESC NULLS LAST, "originalUrl" DESC NULLS LAST, "filePath" DESC NULLS LAST
        ) AS row_num
    FROM "DownloadMetadata"
)
DELETE FROM "DownloadMetadata" AS dm
USING ranked_rows
WHERE dm."fileName" = ranked_rows."fileName"
  AND dm."guildId" = ranked_rows."guildId"
  AND dm."downloadDate" IS NOT DISTINCT FROM ranked_rows."downloadDate"
  AND dm."originalUrl" IS NOT DISTINCT FROM ranked_rows."originalUrl"
  AND dm."filePath" IS NOT DISTINCT FROM ranked_rows."filePath"
  AND ranked_rows.row_num > 1;

ALTER TABLE "DownloadMetadata" ALTER COLUMN "guildId" SET NOT NULL;

ALTER TABLE "DownloadMetadata" DROP CONSTRAINT "DownloadMetadata_pkey";

ALTER TABLE "DownloadMetadata" ADD CONSTRAINT "DownloadMetadata_pkey" PRIMARY KEY ("fileName", "guildId");
