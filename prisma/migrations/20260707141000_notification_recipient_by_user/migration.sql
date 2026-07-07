-- DropIndex
DROP INDEX "NotificationRecipient_event_email_key";

-- AlterTable
ALTER TABLE "NotificationRecipient" DROP COLUMN "email",
ADD COLUMN "userId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRecipient_event_userId_key" ON "NotificationRecipient"("event", "userId");
