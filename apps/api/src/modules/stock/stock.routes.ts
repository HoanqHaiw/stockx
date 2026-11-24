import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { idParam, listQuerySchema, paging } from '../../lib/query.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  createStockCount,
  createTransfer,
  overviewQuery,
  stockCard,
  stockCardQuery,
  stockCountSchema,
  stockOverview,
  transferSchema,
  type OverviewQuery,
} from './inventory.service.js';

/** Tra cứu phiếu kho. Phiếu được tạo qua các nghiệp vụ (nhập theo PO, xuất theo đơn bán, chuyển kho…). */
export const stockRouter = Router();
stockRouter.use(requireAuth);

const docListQuery = listQuerySchema.omit({ active: true }).extend({
  type: z.enum(['RECEIPT', 'ISSUE', 'TRANSFER', 'ADJUSTMENT']).optional(),
  warehouseId: z.coerce.number().int().positive().optional(),
});

stockRouter.get('/documents', validate(docListQuery, 'query'), async (req, res) => {
  const query = req.validatedQuery as z.infer<typeof docListQuery>;
  const where: Prisma.StockDocumentWhereInput = {
    ...(query.type && { type: query.type }),
    ...(query.warehouseId && { OR: [{ warehouseId: query.warehouseId }, { toWarehouseId: query.warehouseId }] }),
    ...(query.q && {
      AND: [
        {
          OR: [
            { code: { contains: query.q, mode: 'insensitive' } },
            { purchaseOrder: { code: { contains: query.q, mode: 'insensitive' } } },
            { salesOrder: { code: { contains: query.q, mode: 'insensitive' } } },
            { supplier: { name: { contains: query.q, mode: 'insensitive' } } },
            { customer: { name: { contains: query.q, mode: 'insensitive' } } },
          ],
        },
      ],
    }),
  };
  const [items, total] = await Promise.all([
    prisma.stockDocument.findMany({
      where,
      include: {
        warehouse: { select: { code: true, name: true } },
        toWarehouse: { select: { code: true, name: true } },
        supplier: { select: { name: true } },
        customer: { select: { name: true } },
        purchaseOrder: { select: { id: true, code: true } },
        salesOrder: { select: { id: true, code: true } },
        createdBy: { select: { fullName: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { id: 'desc' },
      ...paging({ ...query, active: 'all' }),
    }),
    prisma.stockDocument.count({ where }),
  ]);
  res.json({ items, total, page: query.page, pageSize: query.pageSize });
});

/** Tồn hiện tại của một số vật tư tại một kho, dùng khi lập đơn bán / xuất kho. */
const balancesQuery = z.object({
  warehouseId: z.coerce.number().int().positive(),
  materialIds: z
    .string()
    .transform((s) => s.split(',').filter(Boolean).map(Number))
    .pipe(z.array(z.number().int().positive()).min(1).max(200)),
});

stockRouter.get('/balances', validate(balancesQuery, 'query'), async (req, res) => {
  const { warehouseId, materialIds } = req.validatedQuery as z.infer<typeof balancesQuery>;
  const rows = await prisma.stockBalance.findMany({
    where: { warehouseId, materialId: { in: materialIds } },
    select: { materialId: true, quantity: true },
  });
  const byId = new Map(rows.map((r) => [r.materialId, r.quantity.toString()]));
  res.json(materialIds.map((id) => ({ materialId: id, quantity: byId.get(id) ?? '0' })));
});

stockRouter.get('/overview', validate(overviewQuery, 'query'), async (req, res) => {
  res.json(await stockOverview(req.validatedQuery as OverviewQuery));
});

stockRouter.get('/card', validate(stockCardQuery, 'query'), async (req, res) => {
  res.json(await stockCard(req.validatedQuery as z.infer<typeof stockCardQuery>));
});

stockRouter.post('/transfers', requireRole('WAREHOUSE'), validate(transferSchema), async (req, res) => {
  res.status(201).json(await createTransfer(req.body, req.user!.id));
});

stockRouter.post('/counts', requireRole('WAREHOUSE'), validate(stockCountSchema), async (req, res) => {
  res.status(201).json(await createStockCount(req.body, req.user!.id));
});

stockRouter.get('/documents/:id', async (req, res) => {
  const doc = await prisma.stockDocument.findUnique({
    where: { id: idParam.parse(req.params.id) },
    include: {
      warehouse: true,
      toWarehouse: true,
      supplier: true,
      customer: true,
      purchaseOrder: { select: { id: true, code: true } },
      salesOrder: { select: { id: true, code: true } },
      createdBy: { select: { fullName: true } },
      postedBy: { select: { fullName: true } },
      lines: { orderBy: { id: 'asc' }, include: { material: { include: { baseUnit: true } } } },
    },
  });
  if (!doc) throw notFound('Không tìm thấy phiếu kho');
  const units = await prisma.unit.findMany({ where: { id: { in: doc.lines.map((l) => l.unitId) } } });
  const unitById = new Map(units.map((u) => [u.id, u]));
  res.json({ ...doc, lines: doc.lines.map((l) => ({ ...l, unit: unitById.get(l.unitId) })) });
});
