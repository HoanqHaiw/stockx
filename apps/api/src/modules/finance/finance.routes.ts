import { Router, type Response } from 'express';
import type ExcelJS from 'exceljs';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { idParam, listQuerySchema, paging } from '../../lib/query.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { createPayment, debtLedger, debtSummary, partnerTypeSchema, paymentSchema } from './debts.service.js';
import { dashboard, debtExcel, inventoryMovement, inventoryMovementExcel, movementQuery, type MovementQuery } from './reports.service.js';

const sendXlsx = (res: Response, file: { name: string; buffer: ExcelJS.Buffer }) => {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
  res.send(Buffer.from(file.buffer as ArrayBuffer));
};

// ───────────────────────── Công nợ ─────────────────────────
// Xem: kế toán, mua hàng (phải trả), kinh doanh (phải thu). Ghi nhận thanh toán: chỉ kế toán.

export const debtsRouter = Router();
debtsRouter.use(requireAuth, requireRole('ACCOUNTANT', 'PURCHASING', 'SALES'));

const typeParam = (v: unknown) => partnerTypeSchema.parse(String(v).toUpperCase());

debtsRouter.get('/:type', async (req, res) => {
  res.json(await debtSummary(typeParam(req.params.type), String(req.query.q ?? '')));
});
debtsRouter.get('/:type/excel', async (req, res) => {
  sendXlsx(res, await debtExcel(typeParam(req.params.type)));
});
debtsRouter.get('/:type/:id', async (req, res) => {
  res.json(await debtLedger(typeParam(req.params.type), idParam.parse(req.params.id)));
});

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);

paymentsRouter.get('/', validate(listQuerySchema.omit({ active: true }), 'query'), async (req, res) => {
  const query = req.validatedQuery as z.infer<typeof listQuerySchema>;
  const where = query.q ? { code: { contains: query.q, mode: 'insensitive' as const } } : {};
  const [items, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        supplier: { select: { name: true } },
        createdBy: { select: { fullName: true } },
      },
      orderBy: { id: 'desc' },
      ...paging({ ...query, active: 'all' }),
    }),
    prisma.payment.count({ where }),
  ]);
  res.json({ items, total, page: query.page, pageSize: query.pageSize });
});

paymentsRouter.post('/', requireRole('ACCOUNTANT'), validate(paymentSchema), async (req, res) => {
  res.status(201).json(await createPayment(req.body, req.user!.id));
});

// ───────────────────────── Dashboard & báo cáo ─────────────────────────

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

reportsRouter.get('/dashboard', async (_req, res) => {
  res.json(await dashboard());
});

reportsRouter.get('/inventory-movement', validate(movementQuery, 'query'), async (req, res) => {
  res.json(await inventoryMovement(req.validatedQuery as MovementQuery));
});

reportsRouter.get('/inventory-movement/excel', validate(movementQuery, 'query'), async (req, res) => {
  sendXlsx(res, await inventoryMovementExcel(req.validatedQuery as MovementQuery));
});
