CREATE TABLE "GuildSettings" (
    "guildId" TEXT NOT NULL,
    "controlChannelId" TEXT,
    "controlMessageId" TEXT,
    "downloadsMaxMb" DOUBLE PRECISION,
    "discordLog" JSONB,

    CONSTRAINT "GuildSettings_pkey" PRIMARY KEY ("guildId")
);

CREATE TABLE "DownloadMetadata" (
    "fileName" TEXT NOT NULL,
    "guildId" TEXT,
    "downloadDate" TIMESTAMPTZ,
    "originalUrl" TEXT,
    "filePath" TEXT,

    CONSTRAINT "DownloadMetadata_pkey" PRIMARY KEY ("fileName")
);

CREATE INDEX "DownloadMetadata_guildId_idx" ON "DownloadMetadata"("guildId");