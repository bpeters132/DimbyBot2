UPDATE "DownloadMetadata"
SET "guildId" = ''
WHERE "guildId" IS NULL;

ALTER TABLE "DownloadMetadata" ALTER COLUMN "guildId" SET NOT NULL;

ALTER TABLE "DownloadMetadata" DROP CONSTRAINT "DownloadMetadata_pkey";

ALTER TABLE "DownloadMetadata" ADD CONSTRAINT "DownloadMetadata_pkey" PRIMARY KEY ("fileName", "guildId");
