-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'READY');

-- CreateTable
CREATE TABLE "upload_intents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "expected_size" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'PENDING',
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_intents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "upload_intents_object_key_key" ON "upload_intents"("object_key");

-- CreateIndex
CREATE INDEX "upload_intents_user_id_idx" ON "upload_intents"("user_id");

-- AddForeignKey
ALTER TABLE "upload_intents" ADD CONSTRAINT "upload_intents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
