/*
  Warnings:

  - A unique constraint covering the columns `[scheduleId,seatId]` on the table `BookingItem` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `scheduleId` to the `BookingItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BookingItem" ADD COLUMN     "scheduleId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "BookingItem_scheduleId_seatId_key" ON "BookingItem"("scheduleId", "seatId");

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
