-- Unified deals: Direct / Brokerage / Degum collapse into one Buyer ↔ Seller
-- "deals" table. Existing rows are carried over before the old tables drop.
-- Products swap marketRate for a per-ton brokerage; parties get a phone list.

-- ── 1. New deals table ──────────────────────────────────────────────────────
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dealNo" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "buyerPartyId" TEXT,
    "sellerPartyId" TEXT,
    "productId" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "rate" DECIMAL(18,4) NOT NULL,
    "buyerBrokerage" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "sellerBrokerage" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "brokerageTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "port" TEXT,
    "paymentCondition" TEXT,
    "liftingDate" TIMESTAMP(3),
    "shipmentMonth" TEXT,
    "deposit" DECIMAL(18,4),
    "dueDays" INTEGER,
    "dueDate" TIMESTAMP(3),
    "sourceDealId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "deals_companyId_deletedAt_idx" ON "deals"("companyId", "deletedAt");
CREATE INDEX "deals_companyId_date_idx" ON "deals"("companyId", "date");
CREATE INDEX "deals_companyId_productId_idx" ON "deals"("companyId", "productId");
CREATE INDEX "deals_companyId_buyerPartyId_idx" ON "deals"("companyId", "buyerPartyId");
CREATE INDEX "deals_companyId_sellerPartyId_idx" ON "deals"("companyId", "sellerPartyId");
CREATE INDEX "deals_companyId_sourceDealId_idx" ON "deals"("companyId", "sourceDealId");
CREATE UNIQUE INDEX "deals_companyId_dealNo_key" ON "deals"("companyId", "dealNo");

ALTER TABLE "deals" ADD CONSTRAINT "deals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_buyerPartyId_fkey" FOREIGN KEY ("buyerPartyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_sellerPartyId_fkey" FOREIGN KEY ("sellerPartyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Trading desk: a self-firm sale points at the purchase deal its stock comes from.
ALTER TABLE "deals" ADD CONSTRAINT "deals_sourceDealId_fkey" FOREIGN KEY ("sourceDealId") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 2. Carry over existing deals ────────────────────────────────────────────
-- Direct, BROKERAGE kind: already buyer ↔ seller with a rate per side.
-- Direct, PRINCIPAL kind: side is from the Self firm's view. BUY means Self buys
--   from Main, so Main is the seller; SELL means Main is the buyer. The single
--   brokerage rate was charged to Main, so it lands on Main's side.
INSERT INTO "deals" (
    "id", "companyId", "dealNo", "date", "buyerPartyId", "sellerPartyId", "productId",
    "quantity", "rate", "buyerBrokerage", "sellerBrokerage", "brokerageTotal", "dueDate",
    "createdById", "updatedById", "createdAt", "updatedAt", "deletedAt"
)
SELECT
    d."id", d."companyId", d."dealNo", d."date",
    CASE WHEN d."kind" = 'BROKERAGE' THEN d."buyerPartyId"
         WHEN d."side" = 'SELL' THEN d."mainPartyId"
         ELSE d."selfPartyId" END,
    CASE WHEN d."kind" = 'BROKERAGE' THEN d."sellerPartyId"
         WHEN d."side" = 'SELL' THEN d."selfPartyId"
         ELSE d."mainPartyId" END,
    d."productId", d."quantity", d."rate",
    CASE WHEN d."kind" = 'BROKERAGE' THEN d."buyerBrokerageRate"
         WHEN d."side" = 'SELL' THEN d."brokerageRate"
         ELSE 0 END,
    CASE WHEN d."kind" = 'BROKERAGE' THEN d."sellerBrokerageRate"
         WHEN d."side" = 'SELL' THEN 0
         ELSE d."brokerageRate" END,
    d."brokerageTotal", d."dueDate",
    d."createdById", d."updatedById", d."createdAt", d."updatedAt", d."deletedAt"
FROM "direct_deals" d;

-- Degum: Self bought from Main (the seller) at buyRate. Brokerage sat on Main.
-- Deal numbers only collide if both series were given the same prefix.
INSERT INTO "deals" (
    "id", "companyId", "dealNo", "date", "buyerPartyId", "sellerPartyId", "productId",
    "quantity", "rate", "buyerBrokerage", "sellerBrokerage", "brokerageTotal",
    "port", "shipmentMonth", "dueDate",
    "createdById", "updatedById", "createdAt", "updatedAt", "deletedAt"
)
SELECT
    g."id", g."companyId",
    CASE WHEN EXISTS (SELECT 1 FROM "deals" x WHERE x."companyId" = g."companyId" AND x."dealNo" = g."dealNo")
         THEN g."dealNo" || '-DG' ELSE g."dealNo" END,
    COALESCE(g."dealDate", g."createdAt"),
    g."selfPartyId", g."mainPartyId", g."productId",
    g."quantity", g."buyRate", 0, g."brokerageRate", g."brokerageTotal",
    g."originPort", g."shipmentMonth", g."paymentDueDate",
    g."createdById", g."updatedById", g."createdAt", g."updatedAt", g."deletedAt"
FROM "degum_deals" g;

-- Due date is now a 7- or 10-day term from the trade date. Old deals whose due
-- date falls exactly 7 or 10 days after the trade date adopt that term; any
-- other old due date is kept as an explicit date with no term.
UPDATE "deals"
SET "dueDays" = ("dueDate"::date - "date"::date)
WHERE "dueDate" IS NOT NULL AND ("dueDate"::date - "date"::date) IN (7, 10);

-- Shipment is now a month dropdown. Old workbook rows stored it as a date
-- string ("2025-07-01T00:00:00"); turn those into the month name ("July").
UPDATE "deals"
SET "shipmentMonth" = btrim(to_char(substring("shipmentMonth" from 1 for 10)::date, 'Month'))
WHERE "shipmentMonth" ~ '^\d{4}-\d{2}-\d{2}';

-- ── 3. Degum shipment tracking ──────────────────────────────────────────────
-- Deals on a degum material get their vessel / clearance / payment details in
-- a separate table, so editing those never touches the deal itself.
ALTER TABLE "products" ADD COLUMN "isDegum" BOOLEAN NOT NULL DEFAULT false;
-- CDSBO is degum by default, as is anything the old Degum module traded.
UPDATE "products" SET "isDegum" = true
WHERE upper(btrim("code")) = 'CDSBO'
   OR "id" IN (SELECT "productId" FROM "degum_deals" WHERE "productId" IS NOT NULL);

CREATE TABLE "degum_details" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "vesselName" TEXT,
    "vesselEta" TIMESTAMP(3),
    "clearanceDate" TIMESTAMP(3),
    "tank" TEXT,
    "terminal" TEXT,
    "chain" TEXT,
    "duty" DECIMAL(18,4),
    "paymentDueDays" INTEGER,
    "paymentDueDate" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "degum_details_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "degum_details_dealId_key" ON "degum_details"("dealId");
CREATE INDEX "degum_details_companyId_idx" ON "degum_details"("companyId");

ALTER TABLE "degum_details" ADD CONSTRAINT "degum_details_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "degum_details" ADD CONSTRAINT "degum_details_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep the vessel names recorded on old Degum deals (same id in "deals").
INSERT INTO "degum_details" ("id", "companyId", "dealId", "vesselName", "createdById", "updatedById", "createdAt", "updatedAt")
SELECT 'dgd_' || g."id", g."companyId", g."id", btrim(g."vessel"), g."createdById", g."updatedById", g."createdAt", g."updatedAt"
FROM "degum_deals" g
WHERE g."vessel" IS NOT NULL AND btrim(g."vessel") <> '';

-- ── 4. Drop the old deal tables + enums ─────────────────────────────────────
DROP TABLE "direct_deals";
DROP TABLE "degum_deals";
DROP TYPE "DealSide";
DROP TYPE "DirectDealStatus";
DROP TYPE "DirectDealKind";
DROP TYPE "PaymentStatus";
DROP TYPE "DegumStatus";

-- ── 5. Parties: single phone → phone list ───────────────────────────────────
ALTER TABLE "parties" ADD COLUMN "phones" TEXT[] DEFAULT ARRAY[]::TEXT[];
UPDATE "parties" SET "phones" = ARRAY["phone"] WHERE "phone" IS NOT NULL AND btrim("phone") <> '';
ALTER TABLE "parties" DROP COLUMN "phone";

-- ── 6. Products: market rate → total brokerage ₹/MT ─────────────────────────
ALTER TABLE "products" DROP COLUMN "marketRate",
DROP COLUMN "marketRateUpdatedAt",
ADD COLUMN "brokerage" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- ── 7. Numbering + permissions ──────────────────────────────────────────────
-- New deals continue the Direct series (keeps its prefix + counter); Degum's ends.
UPDATE "number_sequences" SET "key" = 'DEAL' WHERE "key" = 'DIRECT';
DELETE FROM "number_sequences" WHERE "key" = 'DEGUM';

-- Old per-module permissions are replaced by deal:* (seeded on boot); degum:*
-- stays and now guards the Degum shipment-tracking section.
DELETE FROM "permissions" WHERE "resource" IN ('directdeal', 'position');
