CREATE TYPE "DemoOrderStatus" AS ENUM ('CREATED', 'PAID');

CREATE TABLE "demo_payment_orders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "product_name" TEXT NOT NULL,
    "price_fen" INTEGER NOT NULL,
    "status" "DemoOrderStatus" NOT NULL DEFAULT 'CREATED',
    "payment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "demo_payment_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "demo_payment_orders_price_fen_positive" CHECK ("price_fen" > 0)
);

CREATE UNIQUE INDEX "demo_payment_orders_payment_id_key" ON "demo_payment_orders"("payment_id");
CREATE INDEX "demo_payment_orders_user_id_idx" ON "demo_payment_orders"("user_id");
ALTER TABLE "demo_payment_orders" ADD CONSTRAINT "demo_payment_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
