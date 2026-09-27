-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATING', 'PENDING', 'SUCCEEDED', 'CLOSED', 'FAILED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTING', 'PROCESSING', 'SUCCEEDED', 'CLOSED', 'ABNORMAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "business_type" TEXT NOT NULL,
    "business_order_id" TEXT NOT NULL,
    "attempt_no" INTEGER NOT NULL DEFAULT 1,
    "idempotency_key" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "amount_fen" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "description" TEXT NOT NULL,
    "out_trade_no" TEXT NOT NULL,
    "wechat_transaction_id" TEXT,
    "prepay_id" TEXT,
    "prepay_expires_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATING',
    "paid_at" TIMESTAMP(3),
    "last_queried_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payments_amount_fen_positive" CHECK ("amount_fen" > 0),
    CONSTRAINT "payments_attempt_no_positive" CHECK ("attempt_no" > 0)
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "business_refund_id" TEXT NOT NULL,
    "amount_fen" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "out_refund_no" TEXT NOT NULL,
    "wechat_refund_id" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTING',
    "accepted_at" TIMESTAMP(3),
    "succeeded_at" TIMESTAMP(3),
    "last_queried_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "refunds_amount_fen_positive" CHECK ("amount_fen" > 0)
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "event_key" TEXT NOT NULL,
    "payment_id" UUID NOT NULL,
    "refund_id" UUID,
    "business_type" TEXT NOT NULL,
    "business_order_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount_fen" INTEGER NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_runs" (
    "id" UUID NOT NULL,
    "bill_date" DATE NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'RUNNING',
    "bill_hash" TEXT,
    "payment_rows" INTEGER NOT NULL DEFAULT 0,
    "refund_rows" INTEGER NOT NULL DEFAULT 0,
    "difference_count" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "reconciliation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_differences" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "local_amount_fen" INTEGER,
    "wechat_amount_fen" INTEGER,
    "detail" TEXT,

    CONSTRAINT "reconciliation_differences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payments_out_trade_no_key" ON "payments"("out_trade_no");

-- CreateIndex
CREATE UNIQUE INDEX "payments_wechat_transaction_id_key" ON "payments"("wechat_transaction_id");

-- CreateIndex
CREATE INDEX "payments_business_type_business_order_id_idx" ON "payments"("business_type", "business_order_id");

-- CreateIndex
CREATE INDEX "payments_user_id_idx" ON "payments"("user_id");

-- CreateIndex
CREATE INDEX "payments_status_expires_at_idx" ON "payments"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_business_type_business_order_id_attempt_no_key" ON "payments"("business_type", "business_order_id", "attempt_no");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_business_refund_id_key" ON "refunds"("business_refund_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_out_refund_no_key" ON "refunds"("out_refund_no");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_wechat_refund_id_key" ON "refunds"("wechat_refund_id");

-- CreateIndex
CREATE INDEX "refunds_payment_id_status_idx" ON "refunds"("payment_id", "status");

-- CreateIndex
CREATE INDEX "refunds_status_last_queried_at_idx" ON "refunds"("status", "last_queried_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_event_key_key" ON "payment_events"("event_key");

-- CreateIndex
CREATE INDEX "payment_events_delivered_at_next_attempt_at_idx" ON "payment_events"("delivered_at", "next_attempt_at");

-- CreateIndex
CREATE INDEX "reconciliation_runs_bill_date_started_at_idx" ON "reconciliation_runs"("bill_date", "started_at");

-- CreateIndex
CREATE INDEX "reconciliation_differences_run_id_idx" ON "reconciliation_differences"("run_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_differences" ADD CONSTRAINT "reconciliation_differences_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "reconciliation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
