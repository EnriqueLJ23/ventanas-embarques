-- CreateEnum
CREATE TYPE "NotificationEvent" AS ENUM ('ARRIVAL', 'DELAY_15', 'DELAY_30', 'DELAY_45', 'DELAY_60');

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "id" TEXT NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "email" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRecipient_event_email_key" ON "NotificationRecipient"("event", "email");
