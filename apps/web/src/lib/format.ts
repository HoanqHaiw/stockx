const qtyFmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 });
const moneyFmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

export const fmtQty = (v: string | number | null | undefined) => qtyFmt.format(Number(v ?? 0));
export const fmtMoney = (v: string | number | null | undefined) => moneyFmt.format(Number(v ?? 0));

export const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

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
