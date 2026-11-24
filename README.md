# VatTu Hub – Mini ERP quản lý vật tư & kho

Hệ thống quản lý nội bộ cho công ty thương mại vật tư cơ điện / xây dựng: danh mục vật tư, mua hàng, bán hàng,
nhập – xuất – tồn nhiều kho, chuyển kho, kiểm kê, công nợ và báo cáo.

> Trạng thái: **Ngày 2/7** – xong nền tảng và danh mục (vật tư, nhà cung cấp, khách hàng, kho, nhập/xuất Excel).

## Công nghệ

| Phần | Công nghệ |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS, TanStack Query, React Router |
| Backend | Node.js, TypeScript, Express 5, Zod, JWT |
| CSDL | PostgreSQL 16, Prisma |
| Kiểm thử | Vitest, Supertest – chạy trên CSDL PostgreSQL thật |
| Hạ tầng | Docker Compose, GitHub Actions |

## Điểm kỹ thuật chính

- **Sổ kho chỉ ghi thêm (stock ledger):** mọi biến động tồn là một dòng `StockLedger` không sửa/xoá, kèm số tồn sau
  biến động. Bảng `StockBalance` được cập nhật trong **cùng transaction**.
- **Không âm kho khi xuất song song:** khoá dòng tồn bằng `SELECT … FOR UPDATE`, luôn theo cùng thứ tự
  (vật tư, kho) để tránh deadlock. CSDL có thêm `CHECK (quantity >= 0)` làm lớp bảo vệ cuối.
- **Mỗi phiếu chỉ ghi sổ một lần**, kể cả khi người dùng bấm hai lần cùng lúc.
- **Số chứng từ không trùng** (`PN-2026-0001`) nhờ một câu `UPSERT … RETURNING` nguyên tử.
- **Quy đổi đơn vị tính** theo từng vật tư (1 cuộn = 100 mét, 1 cây = 4 mét…); tồn kho luôn lưu theo đơn vị cơ sở.
- **Ràng buộc nghiệp vụ trong CSDL:** không nhận/giao vượt số lượng đặt, phiếu chuyển kho phải khác kho nhận…
- **Phân quyền theo vai trò** ở cả API (`requireRole`) và menu giao diện.
- **Nhập vật tư từ Excel hai bước:** kiểm tra trước rồi mới ghi. Báo lỗi theo từng dòng, từng cột (mã nhóm/ĐVT không
  tồn tại, mã trùng trong file, số sai định dạng, quy đổi sai…), trả về file Excel tô đỏ dòng lỗi. Có lỗi thì không ghi
  dòng nào. Hiểu cả số kiểu Việt Nam như `15.800`.
- **Không xoá cứng danh mục đã phát sinh chứng từ:** dùng trạng thái ngừng sử dụng; không cho ngừng kho còn hàng,
  không cho đổi ĐVT cơ sở của vật tư đã có phát sinh kho.

## Chạy trên máy

Yêu cầu: Node.js 20+, Docker Desktop.

```bash
npm install
npm run db:up                        # PostgreSQL ở cổng 5433 (kèm CSDL test)
cp apps/api/.env.example apps/api/.env   # rồi đặt JWT_SECRET dài ≥ 32 ký tự
npm run db:migrate -w apps/api
npm run db:seed -w apps/api          # dữ liệu mẫu: 26 vật tư MEP, 3 kho, NCC, khách hàng, tồn đầu kỳ
npm run dev:api                      # http://localhost:4000
npm run dev:web                      # http://localhost:5173
npm test                             # chạy toàn bộ test API
```

## Tài khoản demo

Mật khẩu chung: `Demo@123`. Trang đăng nhập có nút đăng nhập nhanh theo từng vai trò.

| Vai trò | Email |
|---|---|
| Quản trị | admin@vattuhub.test |
| Mua hàng | muahang@vattuhub.test |
| Kinh doanh | kinhdoanh@vattuhub.test |
| Thủ kho | thukho@vattuhub.test |
| Kế toán | ketoan@vattuhub.test |

## Lộ trình

- [x] Ngày 1 – CSDL, ghi sổ kho có khoá dòng, đăng nhập & vai trò, khung giao diện responsive, test
- [x] Ngày 2 – CRUD danh mục, import/export Excel vật tư
- [ ] Ngày 3 – Đơn mua hàng, phiếu nhập nhận từng phần
- [ ] Ngày 4 – Báo giá → đơn bán → phiếu xuất, giao từng phần
- [ ] Ngày 5 – Chuyển kho, kiểm kê, thẻ kho, màn hình tồn kho cho điện thoại
- [ ] Ngày 6 – Công nợ, thanh toán, dashboard, báo cáo Excel
- [ ] Ngày 7 – Đo hiệu năng với dữ liệu lớn, deploy, hoàn thiện tài liệu
