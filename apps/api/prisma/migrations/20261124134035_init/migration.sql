-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PURCHASING', 'SALES', 'WAREHOUSE', 'ACCOUNTANT');

-- CreateEnum
CREATE TYPE "WarehouseType" AS ENUM ('MAIN', 'SITE');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'APPROVED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockDocumentType" AS ENUM ('RECEIPT', 'ISSUE', 'TRANSFER', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "StockDocumentStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('SUPPLIER', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialGroup" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "MaterialGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specification" TEXT,
    "groupId" INTEGER NOT NULL,
    "baseUnitId" INTEGER NOT NULL,
    "purchasePrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "salePrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "minStock" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitConversion" (
    "id" SERIAL NOT NULL,
    "materialId" INTEGER NOT NULL,
    "unitId" INTEGER NOT NULL,
    "factor" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "UnitConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "type" "WarehouseType" NOT NULL DEFAULT 'MAIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxCode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxCode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDate" TIMESTAMP(3),
    "note" TEXT,
    "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdById" INTEGER NOT NULL,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" SERIAL NOT NULL,
    "purchaseOrderId" INTEGER NOT NULL,
    "materialId" INTEGER NOT NULL,
    "unitId" INTEGER NOT NULL,
    "factor" DECIMAL(18,6) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "baseQuantity" DECIMAL(18,3) NOT NULL,
    "receivedBaseQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "quoteDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "note" TEXT,
    "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationLine" (
    "id" SERIAL NOT NULL,
    "quotationId" INTEGER NOT NULL,
    "materialId" INTEGER NOT NULL,
    "unitId" INTEGER NOT NULL,
    "factor" DECIMAL(18,6) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "baseQuantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "QuotationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "quotationId" INTEGER,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryDate" TIMESTAMP(3),
    "note" TEXT,
    "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdById" INTEGER NOT NULL,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderLine" (
    "id" SERIAL NOT NULL,
    "salesOrderId" INTEGER NOT NULL,
    "materialId" INTEGER NOT NULL,
    "unitId" INTEGER NOT NULL,
    "factor" DECIMAL(18,6) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "baseQuantity" DECIMAL(18,3) NOT NULL,
    "deliveredBaseQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "SalesOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockDocument" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "type" "StockDocumentType" NOT NULL,
    "status" "StockDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "warehouseId" INTEGER NOT NULL,
    "toWarehouseId" INTEGER,
    "purchaseOrderId" INTEGER,
    "salesOrderId" INTEGER,
    "supplierId" INTEGER,
    "customerId" INTEGER,
    "docDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdById" INTEGER NOT NULL,
    "postedById" INTEGER,
    "postedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockDocumentLine" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "materialId" INTEGER NOT NULL,
    "unitId" INTEGER NOT NULL,
    "factor" DECIMAL(18,6) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "baseQuantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "purchaseOrderLineId" INTEGER,
    "salesOrderLineId" INTEGER,

    CONSTRAINT "StockDocumentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLedger" (
    "id" BIGSERIAL NOT NULL,
    "materialId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "documentId" INTEGER NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "balanceAfter" DECIMAL(18,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBalance" (
    "materialId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("materialId","warehouseId")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "partnerType" "PartnerType" NOT NULL,
    "supplierId" INTEGER,
    "customerId" INTEGER,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtEntry" (
    "id" BIGSERIAL NOT NULL,
    "partnerType" "PartnerType" NOT NULL,
    "supplierId" INTEGER,
    "customerId" INTEGER,
    "documentId" INTEGER,
    "paymentId" INTEGER,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "key" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialGroup_code_key" ON "MaterialGroup"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_code_key" ON "Unit"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Material_code_key" ON "Material"("code");

-- CreateIndex
CREATE INDEX "Material_groupId_idx" ON "Material"("groupId");

-- CreateIndex
CREATE INDEX "Material_name_idx" ON "Material"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UnitConversion_materialId_unitId_key" ON "UnitConversion"("materialId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_code_key" ON "PurchaseOrder"("code");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_orderDate_idx" ON "PurchaseOrder"("supplierId", "orderDate");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_purchaseOrderId_idx" ON "PurchaseOrderLine"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_code_key" ON "Quotation"("code");

-- CreateIndex
CREATE INDEX "Quotation_customerId_quoteDate_idx" ON "Quotation"("customerId", "quoteDate");

-- CreateIndex
CREATE INDEX "QuotationLine_quotationId_idx" ON "QuotationLine"("quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_code_key" ON "SalesOrder"("code");

-- CreateIndex
CREATE INDEX "SalesOrder_customerId_orderDate_idx" ON "SalesOrder"("customerId", "orderDate");

-- CreateIndex
CREATE INDEX "SalesOrder_status_idx" ON "SalesOrder"("status");

-- CreateIndex
CREATE INDEX "SalesOrderLine_salesOrderId_idx" ON "SalesOrderLine"("salesOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "StockDocument_code_key" ON "StockDocument"("code");

-- CreateIndex
CREATE INDEX "StockDocument_type_docDate_idx" ON "StockDocument"("type", "docDate");

-- CreateIndex
CREATE INDEX "StockDocument_warehouseId_docDate_idx" ON "StockDocument"("warehouseId", "docDate");

-- CreateIndex
CREATE INDEX "StockDocument_status_idx" ON "StockDocument"("status");

-- CreateIndex
CREATE INDEX "StockDocumentLine_documentId_idx" ON "StockDocumentLine"("documentId");

-- CreateIndex
CREATE INDEX "StockLedger_materialId_warehouseId_createdAt_idx" ON "StockLedger"("materialId", "warehouseId", "createdAt");

-- CreateIndex
CREATE INDEX "StockLedger_warehouseId_createdAt_idx" ON "StockLedger"("warehouseId", "createdAt");

-- CreateIndex
CREATE INDEX "StockLedger_documentId_idx" ON "StockLedger"("documentId");

-- CreateIndex
CREATE INDEX "StockBalance_warehouseId_idx" ON "StockBalance"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_code_key" ON "Payment"("code");

-- CreateIndex
CREATE INDEX "Payment_partnerType_paymentDate_idx" ON "Payment"("partnerType", "paymentDate");

-- CreateIndex
CREATE INDEX "DebtEntry_supplierId_createdAt_idx" ON "DebtEntry"("supplierId", "createdAt");

-- CreateIndex
CREATE INDEX "DebtEntry_customerId_createdAt_idx" ON "DebtEntry"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "MaterialGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_baseUnitId_fkey" FOREIGN KEY ("baseUnitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitConversion" ADD CONSTRAINT "UnitConversion_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitConversion" ADD CONSTRAINT "UnitConversion_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDocument" ADD CONSTRAINT "StockDocument_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDocument" ADD CONSTRAINT "StockDocument_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDocument" ADD CONSTRAINT "StockDocument_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDocument" ADD CONSTRAINT "StockDocument_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDocument" ADD CONSTRAINT "StockDocument_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDocument" ADD CONSTRAINT "StockDocument_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDocument" ADD CONSTRAINT "StockDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDocument" ADD CONSTRAINT "StockDocument_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDocumentLine" ADD CONSTRAINT "StockDocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StockDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDocumentLine" ADD CONSTRAINT "StockDocumentLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDocumentLine" ADD CONSTRAINT "StockDocumentLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDocumentLine" ADD CONSTRAINT "StockDocumentLine_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "SalesOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StockDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtEntry" ADD CONSTRAINT "DebtEntry_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtEntry" ADD CONSTRAINT "DebtEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtEntry" ADD CONSTRAINT "DebtEntry_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StockDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtEntry" ADD CONSTRAINT "DebtEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ───── Ràng buộc nghiệp vụ bổ sung (Prisma không sinh được) ─────

-- Không bao giờ để tồn kho âm, kể cả khi code ứng dụng có lỗi.
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_quantity_non_negative" CHECK ("quantity" >= 0);

-- Hệ số quy đổi phải dương.
ALTER TABLE "UnitConversion" ADD CONSTRAINT "UnitConversion_factor_positive" CHECK ("factor" > 0);

-- Đơn mua/bán: số lượng dương, không nhận/giao vượt số đặt.
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_qty_positive" CHECK ("quantity" > 0);
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_received_range" CHECK ("receivedBaseQty" >= 0 AND "receivedBaseQty" <= "baseQuantity");
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_qty_positive" CHECK ("quantity" > 0);
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_delivered_range" CHECK ("deliveredBaseQty" >= 0 AND "deliveredBaseQty" <= "baseQuantity");

-- Phiếu chuyển kho phải có kho nhận khác kho xuất.
ALTER TABLE "StockDocument" ADD CONSTRAINT "StockDocument_transfer_target" CHECK (
  ("type" <> 'TRANSFER' AND "toWarehouseId" IS NULL)
  OR ("type" = 'TRANSFER' AND "toWarehouseId" IS NOT NULL AND "toWarehouseId" <> "warehouseId")
);

-- Công nợ / thanh toán gắn đúng một loại đối tác.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_partner" CHECK (
  ("partnerType" = 'SUPPLIER' AND "supplierId" IS NOT NULL AND "customerId" IS NULL)
  OR ("partnerType" = 'CUSTOMER' AND "customerId" IS NOT NULL AND "supplierId" IS NULL)
);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "DebtEntry" ADD CONSTRAINT "DebtEntry_partner" CHECK (
  ("partnerType" = 'SUPPLIER' AND "supplierId" IS NOT NULL AND "customerId" IS NULL)
  OR ("partnerType" = 'CUSTOMER' AND "customerId" IS NOT NULL AND "supplierId" IS NULL)
);
