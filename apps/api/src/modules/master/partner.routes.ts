import { Router } from 'express';
import type { Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import {
  activeWhere,
  codeSchema,
  idParam,
  listQuerySchema,
  optionalText,
  paging,
  setActiveSchema,
  type ListQuery,
} from '../../lib/query.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

export const partnerSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(1, 'Vui lòng nhập tên').max(200),
  taxCode: optionalText(20).refine((v) => !v || /^\d{10}(-\d{3})?$/.test(v), 'Mã số thuế gồm 10 số hoặc 10 số-3 số'),
  phone: optionalText(30),
  email: optionalText(120).refine((v) => !v || z.string().email().safeParse(v).success, 'Email không hợp lệ'),
  address: optionalText(300),
});

type PartnerModel = 'supplier' | 'customer';

/**
 * Nhà cung cấp và khách hàng có cùng cấu trúc nên dùng chung một bộ route.
 * Không xoá cứng vì đối tác đã gắn với chứng từ: dùng "ngừng sử dụng" (isActive = false).
 */
export function partnerRouter(model: PartnerModel, writeRoles: Role[]) {
  // Prisma sinh hai delegate riêng nhưng cùng chữ ký cho các thao tác dùng ở đây.
  const repo = prisma[model] as unknown as typeof prisma.supplier;
  const label = model === 'supplier' ? 'nhà cung cấp' : 'khách hàng';
  const router = Router();
  router.use(requireAuth);

  router.get('/', validate(listQuerySchema, 'query'), async (req, res) => {
    const query = req.validatedQuery as ListQuery;
    const where = {
      ...activeWhere(query.active),
      ...(query.q && {
        OR: [
          { code: { contains: query.q, mode: 'insensitive' as const } },
          { name: { contains: query.q, mode: 'insensitive' as const } },
          { taxCode: { contains: query.q } },
          { phone: { contains: query.q } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      repo.findMany({ where, orderBy: { code: 'asc' }, ...paging(query) }),
      repo.count({ where }),
    ]);
    res.json({ items, total, page: query.page, pageSize: query.pageSize });
  });

  router.get('/:id', async (req, res) => {
    const item = await repo.findUnique({ where: { id: idParam.parse(req.params.id) } });
    if (!item) throw notFound(`Không tìm thấy ${label}`);
    res.json(item);
  });

  router.post('/', requireRole(...writeRoles), validate(partnerSchema), async (req, res) => {
    res.status(201).json(await repo.create({ data: req.body }));
  });

  router.put('/:id', requireRole(...writeRoles), validate(partnerSchema), async (req, res) => {
    res.json(await repo.update({ where: { id: idParam.parse(req.params.id) }, data: req.body }));
  });

  router.patch('/:id/active', requireRole(...writeRoles), validate(setActiveSchema), async (req, res) => {
    res.json(
      await repo.update({ where: { id: idParam.parse(req.params.id) }, data: { isActive: req.body.isActive } }),
    );
  });

  return router;
}
