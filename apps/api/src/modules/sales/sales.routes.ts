import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { idParam, listQuerySchema, paging } from '../../lib/query.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { quotationWorkbook } from './quotation.excel.js';
import {
  approveSalesOrder,
  cancelSalesOrder,
  convertQuotation,
  convertSchema,
  createQuotation,
  createSalesOrder,
  deliverSalesOrder,
  deliverySchema,
  quotationInclude,
  quotationSchema,
  salesOrderInclude,
  salesOrderSchema,
  setQuotationStatus,
  updateQuotation,
  updateSalesOrder,
} from './sales.service.js';

const statusList = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',') : []))
    .pipe(z.array(z.enum(values)));

const partnerSearch = (q: string) => ({
  OR: [
    { code: { contains: q, mode: 'insensitive' as const } },
    { customer: { name: { contains: q, mode: 'insensitive' as const } } },
  ],
});

// ───────────────────────── Báo giá ─────────────────────────

export const quotationsRouter = Router();
quotationsRouter.use(requireAuth);

const quotationListQuery = listQuerySchema.omit({ active: true }).extend({
  status: statusList(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'] as const),
});

quotationsRouter.get('/', validate(quotationListQuery, 'query'), async (req, res) => {
  const query = req.validatedQuery as z.infer<typeof quotationListQuery>;
  const where: Prisma.QuotationWhereInput = {
    ...(query.status.length && { status: { in: query.status } }),
    ...(query.q && partnerSearch(query.q)),
  };
  const [items, total] = await Promise.all([
    prisma.quotation.findMany({
      where,
      include: { customer: { select: { code: true, name: true } } },
      orderBy: { id: 'desc' },
      ...paging({ ...query, active: 'all' }),
    }),
    prisma.quotation.count({ where }),
  ]);
  res.json({ items, total, page: query.page, pageSize: query.pageSize });
});

quotationsRouter.get('/:id/excel', async (req, res) => {
  const { name, buffer } = await quotationWorkbook(idParam.parse(req.params.id));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(Buffer.from(buffer as ArrayBuffer));
});

quotationsRouter.get('/:id', async (req, res) => {
  const q = await prisma.quotation.findUnique({ where: { id: idParam.parse(req.params.id) }, include: quotationInclude });
  if (!q) throw notFound('Không tìm thấy báo giá');
  res.json(q);
});

quotationsRouter.post('/', requireRole('SALES'), validate(quotationSchema), async (req, res) => {
  res.status(201).json(await createQuotation(req.body, req.user!.id));
});
quotationsRouter.put('/:id', requireRole('SALES'), validate(quotationSchema), async (req, res) => {
  res.json(await updateQuotation(idParam.parse(req.params.id), req.body));
});
quotationsRouter.post('/:id/send', requireRole('SALES'), async (req, res) => {
  res.json(await setQuotationStatus(idParam.parse(req.params.id), 'SENT'));
});
quotationsRouter.post('/:id/reject', requireRole('SALES'), async (req, res) => {
  res.json(await setQuotationStatus(idParam.parse(req.params.id), 'REJECTED'));
});
quotationsRouter.post('/:id/convert', requireRole('SALES'), validate(convertSchema), async (req, res) => {
  res.status(201).json(await convertQuotation(idParam.parse(req.params.id), req.body, req.user!.id));
});

// ───────────────────────── Đơn bán ─────────────────────────

export const salesOrdersRouter = Router();
salesOrdersRouter.use(requireAuth);

const soListQuery = listQuerySchema.omit({ active: true }).extend({
  status: statusList(['DRAFT', 'APPROVED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED'] as const),
});

salesOrdersRouter.get('/', validate(soListQuery, 'query'), async (req, res) => {
  const query = req.validatedQuery as z.infer<typeof soListQuery>;
  const where: Prisma.SalesOrderWhereInput = {
    ...(query.status.length && { status: { in: query.status } }),
    ...(query.q && partnerSearch(query.q)),
  };
  const [items, total] = await Promise.all([
    prisma.salesOrder.findMany({
      where,
      include: { customer: { select: { code: true, name: true } }, warehouse: { select: { code: true, name: true } } },
      orderBy: { id: 'desc' },
      ...paging({ ...query, active: 'all' }),
    }),
    prisma.salesOrder.count({ where }),
  ]);
  res.json({ items, total, page: query.page, pageSize: query.pageSize });
});

salesOrdersRouter.get('/:id', async (req, res) => {
  const so = await prisma.salesOrder.findUnique({ where: { id: idParam.parse(req.params.id) }, include: salesOrderInclude });
  if (!so) throw notFound('Không tìm thấy đơn bán hàng');
  res.json(so);
});

salesOrdersRouter.post('/', requireRole('SALES'), validate(salesOrderSchema), async (req, res) => {
  res.status(201).json(await createSalesOrder(req.body, req.user!.id));
});
salesOrdersRouter.put('/:id', requireRole('SALES'), validate(salesOrderSchema), async (req, res) => {
  res.json(await updateSalesOrder(idParam.parse(req.params.id), req.body));
});
salesOrdersRouter.post('/:id/approve', requireRole(), async (req, res) => {
  res.json(await approveSalesOrder(idParam.parse(req.params.id), req.user!.id));
});
salesOrdersRouter.post('/:id/cancel', requireRole('SALES'), async (req, res) => {
  res.json(await cancelSalesOrder(idParam.parse(req.params.id)));
});
salesOrdersRouter.post('/:id/deliveries', requireRole('WAREHOUSE'), validate(deliverySchema), async (req, res) => {
  res.status(201).json(await deliverSalesOrder(idParam.parse(req.params.id), req.body, req.user!.id));
});
