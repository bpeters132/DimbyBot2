-- CreateTable
CREATE TABLE "PlayerSession" (
    "guildId" TEXT NOT NULL,
    "voiceChannelId" TEXT NOT NULL,
    "textChannelId" TEXT,
    "snapshot" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerSession_pkey" PRIMARY KEY ("guildId")
);
