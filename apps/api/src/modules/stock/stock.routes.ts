import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { idParam, listQuerySchema, paging } from '../../lib/query.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

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

stockRouter.get('/documents/:id', async (req, res) => {
  const doc = await prisma.stockDocument.findUnique({
    where: { id: idParam.parse(req.params.id) },
    include: {
      warehouse: true,
      toWarehouse: true,
      supplier: true,
      customer: true,
      purchaseOrder: { select: { id: true, code: true } },
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
