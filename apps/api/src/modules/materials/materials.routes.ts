import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { activeWhere, idParam, listQuerySchema, paging, setActiveSchema } from '../../lib/query.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { exportMaterials, importMaterials, importTemplate } from './materials.excel.js';
import {
  createMaterial,
  lowStockIds,
  materialInclude,
  materialSchema,
  totalStockOf,
  updateMaterial,
} from './materials.service.js';

export const materialsRouter = Router();
materialsRouter.use(requireAuth);

const WRITE_ROLES = ['PURCHASING'] as const;
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

const materialListQuery = listQuerySchema.extend({
  groupId: z.coerce.number().int().positive().optional(),
  lowStock: z.enum(['true', 'false']).optional(),
});

materialsRouter.get('/', validate(materialListQuery, 'query'), async (req, res) => {
  const query = req.validatedQuery as z.infer<typeof materialListQuery>;
  const where: Prisma.MaterialWhereInput = {
    ...activeWhere(query.active),
    ...(query.groupId && { groupId: query.groupId }),
    ...(query.lowStock === 'true' && { id: { in: await lowStockIds() } }),
    ...(query.q && {
      OR: [
        { code: { contains: query.q, mode: 'insensitive' } },
        { name: { contains: query.q, mode: 'insensitive' } },
        { specification: { contains: query.q, mode: 'insensitive' } },
      ],
    }),
  };
  const [items, total] = await Promise.all([
    prisma.material.findMany({ where, include: materialInclude, orderBy: { code: 'asc' }, ...paging(query) }),
    prisma.material.count({ where }),
  ]);
  const stock = await totalStockOf(items.map((m) => m.id));
  res.json({
    items: items.map((m) => ({ ...m, totalStock: stock.get(m.id) ?? '0' })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  });
});

// Đặt trước "/:id" để không bị hiểu nhầm là id.
materialsRouter.get('/export', async (_req, res) => {
  const buf = await exportMaterials();
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', XLSX);
  res.setHeader('Content-Disposition', `attachment; filename="vat-tu-${date}.xlsx"`);
  res.send(Buffer.from(buf as ArrayBuffer));
});

materialsRouter.get('/import-template', async (_req, res) => {
  const buf = await importTemplate();
  res.setHeader('Content-Type', XLSX);
  res.setHeader('Content-Disposition', 'attachment; filename="mau-nhap-vat-tu.xlsx"');
  res.send(Buffer.from(buf as ArrayBuffer));
});

/**
 * Nhập vật tư từ Excel.
 * ?dryRun=true chỉ kiểm tra và trả về số dòng sẽ tạo/cập nhật cùng danh sách lỗi.
 * Có bất kỳ dòng lỗi nào thì không ghi dòng nào (trả 422 kèm file lỗi).
 */
materialsRouter.post('/import', requireRole(...WRITE_ROLES), upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('Vui lòng chọn file Excel');
  if (!/\.xlsx$/i.test(req.file.originalname)) throw badRequest('Chỉ hỗ trợ file .xlsx');
  const dryRun = req.query.dryRun === 'true';
  const result = await importMaterials(req.file.buffer, { dryRun });
  res.status(result.errors.length ? 422 : 200).json(result);
});

materialsRouter.get('/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const material = await prisma.material.findUnique({
    where: { id },
    include: {
      ...materialInclude,
      balances: { include: { warehouse: true }, orderBy: { warehouse: { code: 'asc' } } },
    },
  });
  if (!material) throw notFound('Không tìm thấy vật tư');
  res.json(material);
});

materialsRouter.post('/', requireRole(...WRITE_ROLES), validate(materialSchema), async (req, res) => {
  res.status(201).json(await createMaterial(req.body));
});

materialsRouter.put('/:id', requireRole(...WRITE_ROLES), validate(materialSchema), async (req, res) => {
  res.json(await updateMaterial(idParam.parse(req.params.id), req.body));
});

materialsRouter.patch('/:id/active', requireRole(...WRITE_ROLES), validate(setActiveSchema), async (req, res) => {
  res.json(
    await prisma.material.update({
      where: { id: idParam.parse(req.params.id) },
      data: { isActive: req.body.isActive },
      include: materialInclude,
    }),
  );
});
