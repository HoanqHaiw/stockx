import { locale } from '../i18n';

const fmt = (opts: Intl.NumberFormatOptions) => (v: string | number | null | undefined) =>
  new Intl.NumberFormat(locale(), opts).format(Number(v ?? 0));

export const fmtQty = fmt({ maximumFractionDigits: 3 });
export const fmtMoney = fmt({ maximumFractionDigits: 0 });

export const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

/** yyyy-mm-dd cho <input type="date">. */
export const toDateInput = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');

/** Đơn vị của một dòng hàng: đơn vị cơ sở hoặc một đơn vị quy đổi của vật tư. */
export function unitOf(
  material: { baseUnit: { id: number; name: string }; conversions: { unit: { id: number; name: string } }[] },
  unitId: number,
) {
  return material.baseUnit.id === unitId
    ? material.baseUnit
    : (material.conversions.find((c) => c.unit.id === unitId)?.unit ?? material.baseUnit);
}
