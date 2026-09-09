-- CreateTable
CREATE TABLE "YoutubeWatch" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "youtubeChannelId" TEXT NOT NULL,
    "youtubeChannelName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "YoutubeWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YoutubeAlert" (
    "id" SERIAL NOT NULL,
    "watchId" INTEGER NOT NULL,
    "discordChannelId" TEXT NOT NULL,
    "mentionRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "messageTemplate" TEXT,
    "eventTypes" TEXT[],
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "YoutubeAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YoutubeSeenVideo" (
    "watchId" INTEGER NOT NULL,
    "videoId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "YoutubeSeenVideo_pkey" PRIMARY KEY ("watchId","videoId")
);

-- CreateTable
CREATE TABLE "YoutubeChannelLease" (
    "youtubeChannelId" TEXT NOT NULL,
    "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YoutubeChannelLease_pkey" PRIMARY KEY ("youtubeChannelId")
);

-- CreateIndex
CREATE UNIQUE INDEX "YoutubeWatch_guildId_youtubeChannelId_key" ON "YoutubeWatch"("guildId", "youtubeChannelId");

-- CreateIndex
CREATE INDEX "YoutubeWatch_guildId_idx" ON "YoutubeWatch"("guildId");

-- CreateIndex
CREATE INDEX "YoutubeWatch_youtubeChannelId_idx" ON "YoutubeWatch"("youtubeChannelId");

-- CreateIndex
CREATE INDEX "YoutubeAlert_watchId_idx" ON "YoutubeAlert"("watchId");

-- CreateIndex
CREATE INDEX "YoutubeSeenVideo_watchId_idx" ON "YoutubeSeenVideo"("watchId");

-- AddForeignKey
ALTER TABLE "YoutubeAlert" ADD CONSTRAINT "YoutubeAlert_watchId_fkey" FOREIGN KEY ("watchId") REFERENCES "YoutubeWatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YoutubeSeenVideo" ADD CONSTRAINT "YoutubeSeenVideo_watchId_fkey" FOREIGN KEY ("watchId") REFERENCES "YoutubeWatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
