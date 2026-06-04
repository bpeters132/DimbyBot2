-- CreateTable
CREATE TABLE "Countdown" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "targetTime" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Countdown_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Countdown_guildId_idx" ON "Countdown"("guildId");
