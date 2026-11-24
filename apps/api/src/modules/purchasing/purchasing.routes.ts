import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { idParam, listQuerySchema, paging } from '../../lib/query.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  createPurchaseOrder,
  poInclude,
  purchaseOrderSchema,
  receiptSchema,
  receivePurchaseOrder,
  updatePurchaseOrder,
} from './purchasing.service.js';

export const purchasingRouter = Router();
purchasingRouter.use(requireAuth);

const STATUSES = ['DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'] as const;
const poListQuery = listQuerySchema.omit({ active: true }).extend({
  status: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',') : []))
    .pipe(z.array(z.enum(STATUSES))),
  supplierId: z.coerce.number().int().positive().optional(),
});

purchasingRouter.get('/', validate(poListQuery, 'query'), async (req, res) => {
  const query = req.validatedQuery as z.infer<typeof poListQuery>;
  const where: Prisma.PurchaseOrderWhereInput = {
    ...(query.status.length && { status: { in: query.status } }),
    ...(query.supplierId && { supplierId: query.supplierId }),
    ...(query.q && {
      OR: [
        { code: { contains: query.q, mode: 'insensitive' } },
        { supplier: { name: { contains: query.q, mode: 'insensitive' } } },
      ],
    }),
  };
  const [items, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      include: { supplier: { select: { code: true, name: true } }, warehouse: { select: { code: true, name: true } } },
      orderBy: { id: 'desc' },
      ...paging({ ...query, active: 'all' }),
    }),
    prisma.purchaseOrder.count({ where }),
  ]);
  res.json({ items, total, page: query.page, pageSize: query.pageSize });
});

purchasingRouter.get('/:id', async (req, res) => {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: idParam.parse(req.params.id) }, include: poInclude });
  if (!po) throw notFound('Không tìm thấy đơn mua hàng');
  res.json(po);
});

purchasingRouter.post('/', requireRole('PURCHASING'), validate(purchaseOrderSchema), async (req, res) => {
  res.status(201).json(await createPurchaseOrder(req.body, req.user!.id));
});

purchasingRouter.put('/:id', requireRole('PURCHASING'), validate(purchaseOrderSchema), async (req, res) => {
  res.json(await updatePurchaseOrder(idParam.parse(req.params.id), req.body));
});

// Duyệt đơn: chỉ quản trị (trưởng bộ phận). Người lập đơn không tự duyệt.
purchasingRouter.post('/:id/approve', requireRole(), async (req, res) => {
  res.json(await approvePurchaseOrder(idParam.parse(req.params.id), req.user!.id));
});

purchasingRouter.post('/:id/cancel', requireRole('PURCHASING'), async (req, res) => {
  res.json(await cancelPurchaseOrder(idParam.parse(req.params.id)));
});

// Nhập kho theo đơn: thủ kho xác nhận số thực nhận.
purchasingRouter.post('/:id/receipts', requireRole('WAREHOUSE'), validate(receiptSchema), async (req, res) => {
  res.status(201).json(await receivePurchaseOrder(idParam.parse(req.params.id), req.body, req.user!.id));
});
