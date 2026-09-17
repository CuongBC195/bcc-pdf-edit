# BentoPDF - Custom Multi-Split PDF Toolkit ⚡

Ứng dụng web mã nguồn mở **Tách 1 file PDF tổng thành nhiều file nhỏ đồng thời**, hỗ trợ tùy biến tên file, phân cấp thư mục lưu trữ (`folder/subfolder/file.pdf`), hỗ trợ dải trang liên tục & ngắt quãng, chạy **100% Client-Side** trên trình duyệt (Privacy-First) và **hoàn toàn miễn phí khi đưa lên Vercel**.

![BentoPDF Multi-Split Workspace](public/images/screenshot.png)

---

## ✨ Tính năng nổi bật

1. **Tách nhiều file con cùng lúc (Batch Multi-Range Split):**
   - Không cần upload và cắt từng lần. Định nghĩa đồng thời hàng chục file con từ 1 tài liệu tổng.
   - Hỗ trợ cú pháp dải trang linh hoạt: `1-5`, `8`, `10-15` hoặc trang rời rạc `1, 3, 5-8`.

2. **Tùy biến Tên File & Cấu trúc Thư mục con (Subfolder Hierarchy):**
   - Cho phép nhập đường dẫn chứa dấu gạch chéo `/` (ví dụ: `01_PhapLy/HopDong.pdf`, `02_TaiChinh/HoaDon.pdf`).
   - Tự động bóc tách hiển thị Breadcrumbs trực quan.

3. **Hai phương thức Xuất file đỉnh cao:**
   - **📦 Xuất file .ZIP:** Tạo file zip giữ nguyên cấu trúc thư mục con đã thiết lập.
   - **💾 Lưu trực tiếp vào Ổ đĩa (Native File System Access API):** Trên Chrome, Edge, Cốc Cốc, người dùng bấm chọn folder trên máy tính, trình duyệt sẽ tự động tạo thư mục và ghi các file PDF trực tiếp vào ổ cứng không cần qua bước giải nén.

4. **Trực quan hóa dạng Thumbnail Grid (WYSIWYG):**
   - Render hình ảnh thu nhỏ của từng trang PDF bằng HTML5 Canvas.
   - Mỗi file con có mã màu nhận diện riêng biệt (Xanh ngọc, Cam, Tím, Hồng...) để chống trùng và sót trang.
   - Hỗ trợ **Click & Shift + Click** chọn nhanh nhiều trang liên tiếp.
   - Cắm cờ cắt nhanh tại vị trí khe giữa 2 trang với biểu tượng kéo ✂️.

5. **Gợi ý tự động & Đổi tên hàng loạt:**
   - **Tách theo Mục lục (Bookmarks/ToC):** Tự động đọc mục lục PDF để tạo sẵn tên file và dải trang.
   - **Chia đều N trang:** Cắt định kỳ N trang thành 1 file.
   - **Đổi tên hàng loạt theo mẫu:** Sử dụng các token biến `{index:02d}`, `{original}`, `{range}`, `{pages}`.

6. **100% Client-Side & Bảo mật tuyệt đối:**
   - Xử lý trực tiếp trong RAM/Web Worker trình duyệt bằng `pdf-lib` và `pdfjs-dist`.
   - File của bạn không bao giờ bị gửi lên bất kỳ máy chủ nào.

---

## 🚀 Hướng dẫn Chạy Local

### Cài đặt và chạy:
```bash
# Cài đặt thư viện
npm install

# Chạy máy chủ phát triển
npm run dev
```
Mở trình duyệt tại: `http://localhost:5173/`

### Build bản Production:
```bash
npm run build
```

---

## 🌐 Hướng dẫn Đưa lên Vercel (Miễn phí 100%)

Dự án đã cấu hình sẵn file `vercel.json`. Do ứng dụng chạy 100% Client-side, gói **Hobby (Free)** của Vercel hoàn toàn đáp ứng vĩnh viễn với băng thông lên tới 100GB/tháng.

### Cách 1: Kết nối GitHub với Vercel (Khuyên dùng)
1. Đẩy mã nguồn thư mục này lên repository GitHub của bạn:
   ```bash
   git init
   git add .
   git commit -m "feat: initial bentopdf multi-split app"
   git branch -M main
   git remote add origin https://github.com/Tên-Username/ten-repo.git
   git push -u origin main
   ```
2. Truy cập [vercel.com](https://vercel.com) $\rightarrow$ Đăng nhập $\rightarrow$ Chọn **Add New Project**.
3. Chọn repo GitHub vừa đẩy lên $\rightarrow$ Bấm **Deploy**.
4. Vercel tự động build và cấp link dạng `https://ten-du-an.vercel.app` có sẵn HTTPS!

### Cách 2: Deploy trực tiếp từ Terminal
Chỉ cần chạy lệnh sau ngay tại thư mục dự án:
```bash
npx vercel
```
Làm theo hướng dẫn 3 bước ngắn gọn trên màn hình là web của bạn sẽ online ngay lập tức!

---

## 🛠️ Công nghệ sử dụng
- **Vite & React 19 (TypeScript)**
- **pdf-lib:** Cắt và sao chép trang PDF siêu tốc
- **pdfjs-dist:** Render thumbnail canvas và đọc cây mục lục PDF
- **jszip:** Đóng gói file nén giữ nguyên thư mục con
- **Lucide React:** Bộ icon hiện đại
- **Bento UI Design System:** Vanilla CSS với Dark/Light Mode, Glassmorphism, Micro-animations.
