import { useQuery } from '@tanstack/react-query';
import { t } from '../i18n';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { fmtMoney, fmtQty } from '../lib/format';
import type { Material } from '../lib/types';
import { MaterialPicker } from './MaterialPicker';
import { Button } from './ui';

export interface LineState {
  key: number;
  material: Material | null;
  unitId: string;
  quantity: string;
  unitPrice: string;
}

let nextKey = 1;
export const newLine = (): LineState => ({ key: nextKey++, material: null, unitId: '', quantity: '1', unitPrice: '0' });

/** Chuyển dòng hàng từ API (đơn/báo giá đã lưu) về trạng thái form. */
export const lineFromApi = (l: { material: Material; unitId: number; quantity: string; unitPrice: string }): LineState => ({
  key: nextKey++,
  material: l.material,
  unitId: String(l.unitId),
  quantity: String(Number(l.quantity)),
  unitPrice: String(Number(l.unitPrice)),
});

export const linesToApi = (lines: LineState[]) =>
  lines
    .filter((l) => l.material)
    .map((l) => ({ materialId: l.material!.id, unitId: Number(l.unitId), quantity: l.quantity, unitPrice: l.unitPrice }));

export const linesTotal = (lines: LineState[]) =>
  lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);

/** Hệ số của đơn vị đã chọn so với đơn vị cơ sở. */
const factorOf = (m: Material, unitId: string) =>
  String(m.baseUnitId) === unitId ? 1 : Number(m.conversions.find((c) => String(c.unitId) === unitId)?.factor ?? 1);

/**
 * Bảng nhập dòng vật tư dùng chung cho đơn mua, báo giá, đơn bán.
 * - priceField: lấy giá gợi ý từ giá mua hay giá bán của vật tư.
 * - stockWarehouseId: nếu có, hiển thị tồn hiện tại ở kho đó và cảnh báo khi không đủ.
 */
export function LinesEditor({
  lines,
  onChange,
  priceField,
  stockWarehouseId,
  title = 'Vật tư',
  showPrice = true,
}: {
  lines: LineState[];
  onChange: (lines: LineState[]) => void;
  priceField: 'purchasePrice' | 'salePrice';
  stockWarehouseId?: number;
  title?: string;
  /** false: phiếu không cần giá (VD chuyển kho), ẩn cột đơn giá/thành tiền. */
  showPrice?: boolean;
}) {
  const materialIds = [...new Set(lines.filter((l) => l.material).map((l) => l.material!.id))];
  const { data: stock } = useQuery({
    queryKey: ['stock', 'balances', stockWarehouseId, materialIds.join(',')],
    queryFn: () =>
      api<{ materialId: number; quantity: string }[]>(
        `/stock/balances?warehouseId=${stockWarehouseId}&materialIds=${materialIds.join(',')}`,
      ),
    enabled: !!stockWarehouseId && materialIds.length > 0,
  });
  const stockOf = new Map(stock?.map((s) => [s.materialId, Number(s.quantity)]));

  const update = (key: number, patch: Partial<LineState>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function pick(key: number, m: Material) {
    update(key, { material: m, unitId: String(m.baseUnitId), unitPrice: String(Number(m[priceField])) });
  }
  function changeUnit(l: LineState, unitId: string) {
    // Đổi đơn vị thì gợi ý lại đơn giá = giá theo đơn vị cơ sở × hệ số.
    const price = l.material ? Math.round(Number(l.material[priceField]) * factorOf(l.material, unitId)) : 0;
    update(l.key, { unitId, unitPrice: String(price) });
  }

  // Tổng số lượng cần theo đơn vị cơ sở cho từng vật tư (một vật tư có thể nằm ở nhiều dòng).
  const needByMaterial = new Map<number, number>();
  for (const l of lines) {
    if (!l.material) continue;
    const need = Number(l.quantity || 0) * factorOf(l.material, l.unitId);
    needByMaterial.set(l.material.id, (needByMaterial.get(l.material.id) ?? 0) + need);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3 font-medium">{t(title)}</div>
      <div className="divide-y divide-slate-100">
        {lines.map((l, i) => {
          const units = l.material ? [l.material.baseUnit, ...l.material.conversions.map((c) => c.unit)] : [];
          const factor = l.material ? factorOf(l.material, l.unitId) : 1;
          const available = l.material ? stockOf.get(l.material.id) : undefined;
          const short = available !== undefined && (needByMaterial.get(l.material!.id) ?? 0) > available;
          return (
            <div
              key={l.key}
              className={`grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4 xl:items-start ${
                showPrice
                  ? 'xl:grid-cols-[2rem_minmax(0,1fr)_8rem_7rem_9rem_9rem_2.5rem]'
                  : 'xl:grid-cols-[2rem_minmax(0,1fr)_8rem_7rem_2.5rem]'
              }`}
            >
              <div className="col-span-2 text-sm font-medium text-slate-400 sm:col-span-4 xl:col-span-1 xl:pt-2">{t('Dòng')}{' '}{i + 1}</div>
              <div className="col-span-2 sm:col-span-4 xl:col-span-1">
                <MaterialPicker value={l.material} onChange={(m) => pick(l.key, m)} />
                {l.material && (
                  <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                    {factor !== 1 && (
                      <span>
                        = {fmtQty(Number(l.quantity || 0) * factor)} {l.material.baseUnit.name.toLowerCase()}
                      </span>
                    )}
                    {available !== undefined && (
                      <span className={short ? 'font-medium text-red-600' : ''}>
                        {t('Tồn kho:')}{' '}{fmtQty(available)} {l.material.baseUnit.name.toLowerCase()}
                        {short && t(' – không đủ')}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <select
                aria-label={t('Đơn vị')}
                value={l.unitId}
                onChange={(e) => changeUnit(l, e.target.value)}
                disabled={!l.material}
                className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm disabled:bg-slate-50"
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <input
                aria-label={t('Số lượng')}
                type="number"
                min={0}
                step="any"
                value={l.quantity}
                onChange={(e) => update(l.key, { quantity: e.target.value })}
                className="rounded-md border border-slate-300 px-2 py-2 text-right text-sm"
              />
              {showPrice && (
              <input
                aria-label={t('Đơn giá')}
                type="number"
                min={0}
                value={l.unitPrice}
                onChange={(e) => update(l.key, { unitPrice: e.target.value })}
                className="rounded-md border border-slate-300 px-2 py-2 text-right text-sm"
              />
              )}
              {showPrice && (
                <div className="self-center text-right text-sm font-medium tabular-nums xl:self-start xl:pt-2">
                  {fmtMoney(Number(l.quantity || 0) * Number(l.unitPrice || 0))}
                </div>
              )}
              <button
                type="button"
                disabled={lines.length === 1}
                onClick={() => onChange(lines.filter((x) => x.key !== l.key))}
                className="justify-self-end rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                aria-label={t('Xoá dòng')}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
        <Button variant="ghost" onClick={() => onChange([...lines, newLine()])}>
          <Plus className="size-4" />{' '}{t('Thêm dòng')}
        </Button>
        {showPrice && (
        <div className="text-sm">
          {t('Tổng cộng:')}{' '}<span className="text-lg font-semibold tabular-nums">{fmtMoney(linesTotal(lines))}{' '}{t('đ')}</span>
        </div>
        )}
      </div>
    </div>
  );
}
