# VatTu Hub – Mini ERP quản lý vật tư & kho

Hệ thống quản lý nội bộ cho công ty thương mại vật tư cơ điện / xây dựng: danh mục vật tư, mua hàng, bán hàng,
nhập – xuất – tồn nhiều kho, chuyển kho, kiểm kê, công nợ và báo cáo.

> Trạng thái: **Ngày 6/7** – xong toàn bộ nghiệp vụ: danh mục, mua hàng → nhập kho, báo giá → bán hàng → xuất kho,
> chuyển kho, kiểm kê, tồn kho, thẻ kho, công nợ, thanh toán, dashboard và báo cáo Excel.

## Công nghệ

| Phần | Công nghệ |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS, TanStack Query, React Router, Chart.js |
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
- **Quy trình mua hàng có kiểm soát:** Mua hàng lập đơn → Quản trị duyệt (người lập không tự duyệt) → Thủ kho nhập
  kho theo số thực nhận, nhận nhiều lần. Mỗi lần nhập là một transaction: tạo phiếu nhập, ghi sổ kho, cộng số đã nhận
  trên từng dòng, chuyển trạng thái đơn, ghi công nợ phải trả. Đơn bị khoá dòng trong lúc nhập nên nhiều thủ kho
  nhập cùng lúc cũng không nhận vượt số đặt.
- **Quy trình bán hàng:** Kinh doanh lập báo giá (tải file Excel gửi khách) → khách đồng ý thì chốt thành đơn bán với
  đúng giá đã báo (báo giá hết hạn hoặc đã chốt thì không chốt lại được) → Quản trị duyệt → Thủ kho xuất kho giao hàng,
  giao nhiều lần. Thiếu hàng ở bất kỳ dòng nào thì cả phiếu bị từ chối và chỉ rõ vật tư thiếu bao nhiêu; giao hàng ghi
  công nợ phải thu. Form đơn bán và hộp thoại xuất kho hiển thị tồn hiện tại để cảnh báo trước.
- **Kiểm kê đúng cả khi kho vẫn hoạt động:** thủ kho chỉ nhập số đếm; chênh lệch được tính ở server theo tồn sổ sách
  tại đúng thời điểm ghi (đã khoá dòng tồn), nên phiếu nhập/xuất chen vào giữa lúc đếm không làm sai kết quả. Phiếu lưu
  cả tồn sổ, số đếm và giá trị hao hụt. Cho phép kiểm kê từng phần (chỉ mã đã đếm mới bị điều chỉnh).
- **Thẻ kho và bảng tồn tính bằng SQL:** thẻ kho có tồn đầu kỳ, từng phát sinh kèm tồn sau phát sinh (lấy từ sổ kho),
  tồn cuối kỳ; bảng tồn lọc/gộp/phân trang trong một truy vấn, có tổng giá trị tồn theo giá mua.
- **Công nợ có phân tuổi nợ (FIFO):** tiền thu/trả được trừ vào khoản nợ phát sinh sớm nhất; phần còn lại xếp vào
  chưa đến hạn / quá hạn 1–30 / 31–60 / > 60 ngày (hạn 30 ngày). Không cho thu/trả vượt số đang nợ, khoá dòng đối tác
  để hai kế toán nhập cùng lúc không làm sai số dư. Sổ chi tiết công nợ có số dư luỹ kế từng dòng.
- **Dashboard và báo cáo theo giờ Việt Nam:** dữ liệu lưu UTC, các mốc "tháng này", "theo ngày", "từ ngày – đến ngày"
  được quy đổi sang Asia/Ho_Chi_Minh trong SQL. Báo cáo nhập – xuất – tồn tính trong một truy vấn trên sổ kho; khi xem
  tất cả kho thì bỏ qua chuyển kho nội bộ. Xuất Excel báo cáo nhập – xuất – tồn và công nợ.
- **Dữ liệu mẫu 90 ngày** sinh bằng chính các service nghiệp vụ (không chèn thẳng vào bảng), nên mọi ràng buộc đều được
  kiểm tra, dashboard và biểu đồ có số liệu thật để xem.
- **Đơn vị trên chứng từ được "đóng băng":** mỗi dòng lưu hệ số quy đổi tại thời điểm lập, nên sửa quy đổi trong danh
  mục không làm sai đơn cũ.
- **Không xoá cứng danh mục đã phát sinh chứng từ:** dùng trạng thái ngừng sử dụng; không cho ngừng kho còn hàng,
  không cho đổi ĐVT cơ sở của vật tư đã có phát sinh kho.

## Chạy trên máy

Yêu cầu: Node.js 20+, Docker Desktop.

```bash
npm install
npm run db:up                        # PostgreSQL ở cổng 5433 (kèm CSDL test)
cp apps/api/.env.example apps/api/.env   # rồi đặt JWT_SECRET dài ≥ 32 ký tự
npm run db:migrate -w apps/api
npm run db:seed -w apps/api          # dữ liệu mẫu: 26 vật tư MEP, 3 kho, NCC, khách hàng, 90 ngày giao dịch
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
- [x] Ngày 3 – Đơn mua hàng, phiếu nhập nhận từng phần
- [x] Ngày 4 – Báo giá → đơn bán → phiếu xuất, giao từng phần
- [x] Ngày 5 – Chuyển kho, kiểm kê, thẻ kho, màn hình tồn kho cho điện thoại
- [x] Ngày 6 – Công nợ, thanh toán, dashboard, báo cáo Excel
- [ ] Ngày 7 – Đo hiệu năng với dữ liệu lớn, deploy, hoàn thiện tài liệu
