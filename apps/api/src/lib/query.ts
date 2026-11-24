import { z } from 'zod';

/** Tham số danh sách dùng chung: tìm kiếm, phân trang, lọc trạng thái. */
export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  active: z.enum(['true', 'false', 'all']).default('true'),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const activeWhere = (active: ListQuery['active']) =>
  active === 'all' ? {} : { isActive: active === 'true' };

export const paging = ({ page, pageSize }: ListQuery) => ({ skip: (page - 1) * pageSize, take: pageSize });

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const idParam = z.coerce.number().int().positive();

export const setActiveSchema = z.object({ isActive: z.boolean() });

/** Mã danh mục: chữ in hoa, số, dấu chấm, gạch ngang, gạch dưới. */
export const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9._-]{1,39}$/, 'Mã chỉ gồm chữ, số, dấu . _ - và dài 2–40 ký tự');

/** Chuỗi tuỳ chọn: chuỗi rỗng được coi là không nhập. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
