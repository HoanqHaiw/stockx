import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middleware/auth.js';

/** Danh mục chỉ đọc dùng cho dropdown. CRUD đầy đủ sẽ thêm ở ngày 2. */
export const masterRouter = Router();
masterRouter.use(requireAuth);

masterRouter.get('/warehouses', async (_req, res) => {
  res.json(await prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }));
});

masterRouter.get('/units', async (_req, res) => {
  res.json(await prisma.unit.findMany({ orderBy: { code: 'asc' } }));
});

masterRouter.get('/material-groups', async (_req, res) => {
  res.json(await prisma.materialGroup.findMany({ orderBy: { code: 'asc' } }));
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
