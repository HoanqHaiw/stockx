import { Prisma, type StockDocumentType } from '@prisma/client';
import { prisma, type Tx } from '../../lib/prisma.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';

const D = Prisma.Decimal;
type Decimal = Prisma.Decimal;

interface Movement {
  materialId: number;
  warehouseId: number;
  quantity: Decimal; // đơn vị cơ sở, + nhập / − xuất
}

/** Từ một dòng chứng từ suy ra các biến động tồn kho. */
function movementsOf(
  type: StockDocumentType,
  warehouseId: number,
  toWarehouseId: number | null,
  line: { materialId: number; baseQuantity: Decimal },
): Movement[] {
  const { materialId, baseQuantity: q } = line;
  switch (type) {
    case 'RECEIPT':
      return [{ materialId, warehouseId, quantity: q }];
    case 'ISSUE':
      return [{ materialId, warehouseId, quantity: q.neg() }];
    case 'TRANSFER':
      if (!toWarehouseId) throw badRequest('Phiếu chuyển kho thiếu kho nhận');
      return [
        { materialId, warehouseId, quantity: q.neg() },
        { materialId, warehouseId: toWarehouseId, quantity: q },
      ];
    case 'ADJUSTMENT':
      return [{ materialId, warehouseId, quantity: q }];
  }
}

export interface InsufficientStockItem {
  materialId: number;
  materialCode: string;
  warehouseId: number;
  available: string;
  required: string;
}

/**
 * Ghi sổ một phiếu kho trong transaction đang mở.
 *
 * Đảm bảo:
 * 1. Mỗi phiếu chỉ được ghi sổ một lần (khoá dòng phiếu + kiểm tra trạng thái).
 * 2. Không âm kho khi nhiều phiếu xuất chạy song song: khoá từng dòng StockBalance
 *    bằng SELECT ... FOR UPDATE, luôn theo cùng một thứ tự để tránh deadlock.
 * 3. Mỗi biến động có một dòng StockLedger với số tồn sau biến động.
 */
export async function postStockDocumentTx(tx: Tx, documentId: number, userId: number) {
  const locked = await tx.$queryRaw<{ status: string }[]>`
    SELECT "status" FROM "StockDocument" WHERE "id" = ${documentId} FOR UPDATE`;
  if (locked.length === 0) throw notFound('Không tìm thấy phiếu kho');
  if (locked[0].status !== 'DRAFT') throw conflict('Phiếu đã được ghi sổ hoặc đã huỷ');

  const doc = await tx.stockDocument.findUniqueOrThrow({
    where: { id: documentId },
    include: { lines: { orderBy: { id: 'asc' } } },
  });
  if (doc.lines.length === 0) throw badRequest('Phiếu chưa có dòng vật tư nào');

  // Dòng có số lượng 0 (VD kiểm kê khớp sổ) vẫn nằm trên phiếu để lưu vết nhưng không sinh biến động.
  const movements = doc.lines
    .flatMap((l) => movementsOf(doc.type, doc.warehouseId, doc.toWarehouseId, l))
    .filter((m) => !m.quantity.isZero());

  // Gộp theo (vật tư, kho) rồi sắp xếp để mọi transaction khoá theo cùng thứ tự.
  const keyOf = (m: Movement) => `${m.materialId}:${m.warehouseId}`;
  const deltas = new Map<string, Movement>();
  for (const m of movements) {
    const cur = deltas.get(keyOf(m));
    if (cur) cur.quantity = cur.quantity.plus(m.quantity);
    else deltas.set(keyOf(m), { ...m });
  }
  const ordered = [...deltas.values()].sort(
    (a, b) => a.materialId - b.materialId || a.warehouseId - b.warehouseId,
  );

  const balances = new Map<string, Decimal>();
  const shortages: Omit<InsufficientStockItem, 'materialCode'>[] = [];
  for (const m of ordered) {
    await tx.$executeRaw`
      INSERT INTO "StockBalance" ("materialId", "warehouseId", "quantity", "updatedAt")
      VALUES (${m.materialId}, ${m.warehouseId}, 0, NOW())
      ON CONFLICT ("materialId", "warehouseId") DO NOTHING`;
    const rows = await tx.$queryRaw<{ quantity: Decimal }[]>`
      SELECT "quantity" FROM "StockBalance"
      WHERE "materialId" = ${m.materialId} AND "warehouseId" = ${m.warehouseId}
      FOR UPDATE`;
    const current = new D(rows[0].quantity);
    const next = current.plus(m.quantity);
    if (next.isNegative()) {
      shortages.push({
        materialId: m.materialId,
        warehouseId: m.warehouseId,
        available: current.toString(),
        required: m.quantity.neg().toString(),
      });
    }
    balances.set(keyOf(m), current);
  }

  if (shortages.length > 0) {
    const materials = await tx.material.findMany({
      where: { id: { in: shortages.map((s) => s.materialId) } },
      select: { id: true, code: true },
    });
    const codeOf = new Map(materials.map((x) => [x.id, x.code]));
    const items: InsufficientStockItem[] = shortages.map((s) => ({
      ...s,
      materialCode: codeOf.get(s.materialId) ?? String(s.materialId),
    }));
    throw conflict('Không đủ tồn kho để ghi sổ phiếu', { items });
  }

  // Ghi sổ kho theo thứ tự dòng, kèm số tồn sau từng biến động.
  const ledgerRows: Prisma.StockLedgerCreateManyInput[] = [];
  for (const m of movements) {
    const k = keyOf(m);
    const after = balances.get(k)!.plus(m.quantity);
    balances.set(k, after);
    ledgerRows.push({
      materialId: m.materialId,
      warehouseId: m.warehouseId,
      documentId: doc.id,
      quantity: m.quantity,
      balanceAfter: after,
    });
  }
  await tx.stockLedger.createMany({ data: ledgerRows });

  for (const m of ordered) {
    await tx.stockBalance.update({
      where: { materialId_warehouseId: { materialId: m.materialId, warehouseId: m.warehouseId } },
      data: { quantity: balances.get(keyOf(m))! },
    });
  }

  return tx.stockDocument.update({
    where: { id: doc.id },
    data: { status: 'POSTED', postedById: userId, postedAt: new Date() },
  });
}

/** Ghi sổ phiếu kho trong một transaction riêng. */
export function postStockDocument(documentId: number, userId: number) {
  return prisma.$transaction((tx) => postStockDocumentTx(tx, documentId, userId), { timeout: 15_000 });
}
