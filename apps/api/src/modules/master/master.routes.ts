import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { conflict, notFound } from '../../lib/errors.js';
import { codeSchema, idParam, optionalText, setActiveSchema } from '../../lib/query.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

/** Danh mục nhỏ: kho, đơn vị tính, nhóm vật tư, cùng số liệu tổng quan. */
export const masterRouter = Router();
masterRouter.use(requireAuth);

const simpleSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(1, 'Vui lòng nhập tên').max(100),
});

const warehouseSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(1, 'Vui lòng nhập tên kho').max(150),
  address: optionalText(300),
  type: z.enum(['MAIN', 'SITE']),
});

// ── Kho: chỉ ADMIN được thêm/sửa ──
masterRouter.get('/warehouses', async (req, res) => {
  const all = req.query.active === 'all';
  res.json(
    await prisma.warehouse.findMany({ where: all ? {} : { isActive: true }, orderBy: { code: 'asc' } }),
  );
});
masterRouter.post('/warehouses', requireRole(), validate(warehouseSchema), async (req, res) => {
  res.status(201).json(await prisma.warehouse.create({ data: req.body }));
});
masterRouter.put('/warehouses/:id', requireRole(), validate(warehouseSchema), async (req, res) => {
  res.json(await prisma.warehouse.update({ where: { id: idParam.parse(req.params.id) }, data: req.body }));
});
masterRouter.patch('/warehouses/:id/active', requireRole(), validate(setActiveSchema), async (req, res) => {
  const id = idParam.parse(req.params.id);
  if (!req.body.isActive) {
    // Không cho ngừng kho còn hàng: hàng sẽ "biến mất" khỏi báo cáo.
    const left = await prisma.stockBalance.count({ where: { warehouseId: id, quantity: { gt: 0 } } });
    if (left > 0) throw conflict(`Kho còn ${left} mã vật tư tồn, cần chuyển hết trước khi ngừng sử dụng`);
  }
  res.json(await prisma.warehouse.update({ where: { id }, data: { isActive: req.body.isActive } }));
});

// ── Đơn vị tính & nhóm vật tư: bộ phận mua hàng quản lý ──
masterRouter.get('/units', async (_req, res) => {
  res.json(await prisma.unit.findMany({ orderBy: { code: 'asc' } }));
});
masterRouter.post('/units', requireRole('PURCHASING'), validate(simpleSchema), async (req, res) => {
  res.status(201).json(await prisma.unit.create({ data: req.body }));
});

masterRouter.get('/material-groups', async (_req, res) => {
  res.json(await prisma.materialGroup.findMany({ orderBy: { code: 'asc' } }));
});
masterRouter.post('/material-groups', requireRole('PURCHASING'), validate(simpleSchema), async (req, res) => {
  res.status(201).json(await prisma.materialGroup.create({ data: req.body }));
});
masterRouter.put('/material-groups/:id', requireRole('PURCHASING'), validate(simpleSchema), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const exists = await prisma.materialGroup.findUnique({ where: { id } });
  if (!exists) throw notFound('Không tìm thấy nhóm vật tư');
  res.json(await prisma.materialGroup.update({ where: { id }, data: req.body }));
});

masterRouter.get('/summary', async (_req, res) => {
  const [materials, warehouses, suppliers, customers] = await Promise.all([
    prisma.material.count({ where: { isActive: true } }),
    prisma.warehouse.count({ where: { isActive: true } }),
    prisma.supplier.count({ where: { isActive: true } }),
    prisma.customer.count({ where: { isActive: true } }),
  ]);
  res.json({ materials, warehouses, suppliers, customers });
});
