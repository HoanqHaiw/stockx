const qtyFmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 });
const moneyFmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

export const fmtQty = (v: string | number | null | undefined) => qtyFmt.format(Number(v ?? 0));
export const fmtMoney = (v: string | number | null | undefined) => moneyFmt.format(Number(v ?? 0));
