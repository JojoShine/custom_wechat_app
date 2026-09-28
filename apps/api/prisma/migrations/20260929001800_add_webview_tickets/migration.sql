-- CreateTable
CREATE TABLE "webview_tickets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "app_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webview_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webview_tickets_token_hash_key" ON "webview_tickets"("token_hash");

-- CreateIndex
CREATE INDEX "webview_tickets_user_id_idx" ON "webview_tickets"("user_id");

-- CreateIndex
CREATE INDEX "webview_tickets_expires_at_idx" ON "webview_tickets"("expires_at");

-- AddForeignKey
ALTER TABLE "webview_tickets" ADD CONSTRAINT "webview_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
