import type { ToolDef } from './types';

/** Danh sách công cụ nội bộ (React) của BCC Tools Hub */
export const INTERNAL_TOOLS: ToolDef[] = [
  {
    id: 'bcc-multi-split',
    kind: 'internal',
    name: 'Tách PDF hàng loạt (Multi-Split Pro)',
    description:
      'Tách 1 file PDF tổng thành nhiều file nhỏ đồng thời theo dải trang, bookmark hoặc chọn trực quan; tùy biến mẫu tên file và cây thư mục xuất ZIP.',
    icon: 'ph-scissors',
    badge: 'BCC Pro',
    keywords: [
      'multi split',
      'batch split',
      'pdf-multi-split',
      'tach pdf hang loat',
      'tach nhieu file',
      'tach theo bookmark',
      'chia nho pdf',
    ],
  },
  {
    id: 'qr-generator',
    kind: 'internal',
    name: 'Dán Link → Tạo Mã QR Tức Thì',
    description:
      'Gõ hoặc dán đường dẫn, văn bản, Wi-Fi, danh thiếp để tạo mã QR ngay lập tức. Hỗ trợ Copy ảnh QR 1 chạm hoặc tải PNG/SVG sắc nét.',
    icon: 'ph-qr-code',
    badge: 'Tức thì',
    keywords: [
      'tao ma qr',
      'qr code generator',
      'dan link lay ma qr',
      'qr wifi',
      'qr danh thiep',
      'vcard qr',
    ],
  },
  {
    id: 'qr-scanner',
    kind: 'internal',
    name: 'Quét Mã QR → Lấy Đường Dẫn (Ctrl+V)',
    description:
      'Giải mã ảnh chụp màn hình mã QR chỉ bằng tổ hợp phím Ctrl+V, kéo-thả ảnh hoặc quét trực tiếp qua Camera để lấy link/nội dung.',
    icon: 'ph-scan',
    badge: 'Ctrl+V',
    keywords: [
      'quet ma qr',
      'doc ma qr',
      'qr scanner',
      'qr reader',
      'quet qr tu anh',
      'dan anh qr',
    ],
  },
  {
    id: 'vietqr-generator',
    kind: 'internal',
    name: 'Tạo Mã VietQR Chuyển Khoản Ngân Hàng',
    description:
      'Sinh mã QR chuyển khoản chuẩn EMVCo/NAPAS 24/7 cho 48 ngân hàng tại Việt Nam; điền sẵn số tài khoản, số tiền và nội dung chuyển khoản.',
    icon: 'ph-bank',
    badge: 'NAPAS 24/7',
    keywords: [
      'vietqr',
      'qr ngan hang',
      'qr chuyen khoan',
      'tao ma qr ngan hang',
      'vietcombank',
      'mb bank',
      'bidv',
      'vietinbank',
      'agribank',
    ],
  },
  {
    id: 'barcode-generator',
    kind: 'internal',
    name: 'Tạo Mã Vạch Hồ Sơ & Hàng Hóa (Code 128)',
    description:
      'Tạo mã vạch chuẩn ISO/IEC 15417 (Code 128) cho mã hồ sơ, mã công văn, mã vận đơn, mã tài sản; hỗ trợ Copy ảnh PNG hoặc tải SVG sắc nét.',
    icon: 'ph-barcode',
    badge: 'Code 128',
    keywords: [
      'tao ma vach',
      'barcode generator',
      'code 128',
      'ma vach ho so',
      'ma van don',
    ],
  },
  {
    id: 'number-to-words',
    kind: 'internal',
    name: 'Đọc số tiền thành chữ (VNĐ / USD)',
    description:
      'Gõ hoặc dán số tiền từ Excel để chuyển tức thì sang câu chữ tiếng Việt & tiếng Anh chuẩn hợp đồng, kế toán, hành chính.',
    icon: 'ph-currency-circle-dollar',
    badge: 'Văn phòng',
    keywords: ['doc so tien', 'so thanh chu', 'bang chu', 'vnd', 'ke toan'],
  },
  {
    id: 'vn-font-converter',
    kind: 'internal',
    name: 'Chuyển mã Tiếng Việt (TCVN3 / VNI ↔ Unicode)',
    description:
      'Tự động nhận diện văn bản lỗi font (.VnTime, VNI-Times) và chuyển sang Unicode dựng sẵn chuẩn chỉ với 1 lần dán.',
    icon: 'ph-translate',
    badge: 'Sửa lỗi Font',
    keywords: ['chuyen ma font', 'tcvn3 sang unicode', 'vni sang unicode', 'loi font vntime'],
  },
  {
    id: 'text-case-accent',
    kind: 'internal',
    name: 'Chuẩn hóa Chữ Hoa/Thường, Họ Tên & Bỏ dấu',
    description:
      'Viết Hoa Chữ Cái Đầu Từ (chuẩn hóa Họ Tên), IN HOA, chữ thường, viết hoa đầu câu, bỏ dấu tiếng Việt và dọn khoảng trắng thừa.',
    icon: 'ph-text-aa',
    keywords: ['doi chu hoa thuong', 'bo dau tieng viet', 'chuan hoa ho ten', 'xoa khoang trang'],
  },
  {
    id: 'text-diff',
    kind: 'internal',
    name: 'So sánh 2 văn bản (Tìm điểm sửa đổi)',
    description:
      'Đối chiếu bản thảo cũ và bản thảo mới, tô màu rõ từng từ vừa thêm mới hoặc vừa xóa bỏ để rà soát văn bản nhanh.',
    icon: 'ph-git-diff',
    keywords: ['so sanh van ban', 'diff text', 'doi chieu van ban'],
  },
  {
    id: 'word-counter',
    kind: 'internal',
    name: 'Đếm từ, Ký tự & Thời lượng phát biểu',
    description:
      'Thống kê tức thì số từ, ký tự, câu, đoạn văn và ước tính thời gian đọc bài phát biểu hội nghị (130 từ/phút).',
    icon: 'ph-calculator',
    keywords: ['dem tu', 'dem ky tu', 'word counter', 'thoi gian phat bieu'],
  },
  {
    id: 'find-replace-batch',
    kind: 'internal',
    name: 'Tìm & Thay thế hàng loạt (Multi-Replace)',
    description:
      'Khai báo nhiều cặp từ khóa để thay thế đồng loạt trên toàn bộ văn bản chỉ trong một lần thao tác.',
    icon: 'ph-arrows-left-right',
    keywords: ['tim va thay the', 'find replace', 'thay the hang loat'],
  },
  {
    id: 'text-extractor',
    kind: 'internal',
    name: 'Trích xuất Email, SĐT, CCCD & Link từ văn bản',
    description:
      'Dán văn bản hỗn hợp hoặc bảng dữ liệu thô để tự động lọc riêng danh sách Số điện thoại, Email, Số CCCD 12 số và URL không trùng lặp.',
    icon: 'ph-funnel-simple',
    badge: 'Lọc nhanh',
    keywords: [
      'trich xuat email',
      'loc so dien thoai',
      'loc cccd',
      'lay link tu van ban',
      'text extractor',
    ],
  },
  {
    id: 'id-card-merger',
    kind: 'internal',
    name: 'Ghép ảnh CCCD / Thẻ 2 mặt vào trang A4',
    description:
      'Chọn ảnh Mặt trước và Mặt sau CCCD/Thẻ để tự động căn chỉnh thẳng hàng trên trang trắng chuẩn A4, xuất PDF hoặc JPG nộp hồ sơ.',
    icon: 'ph-identification-card',
    badge: 'Hồ sơ',
    keywords: ['ghep anh cccd', 'cccd 2 mat', 'cmnd 2 mat', 'ghep anh a4'],
  },
  {
    id: 'id-photo-cropper',
    kind: 'internal',
    name: 'Cắt ảnh thẻ 3×4, 4×6 & Ghép vỉ in 10×15',
    description:
      'Căn chỉnh khung ảnh chân dung chuẩn tỷ lệ 3×4 cm, 4×6 cm, 2×3 cm (300 DPI); tải ảnh lẻ hoặc vỉ ghép khổ 10×15 cm để in.',
    icon: 'ph-user-focus',
    keywords: ['cat anh the', 'anh 3x4', 'anh 4x6', 'in anh the 10x15'],
  },
  {
    id: 'image-compressor',
    kind: 'internal',
    name: 'Nén ảnh & Đổi đuôi hàng loạt (JPG / PNG / WebP)',
    description:
      'Giảm 50%–85% dung lượng ảnh để đính kèm cổng dịch vụ công hoặc email mà vẫn rõ nét, hỗ trợ tải trọn gói ZIP.',
    icon: 'ph-file-image',
    keywords: ['nen anh', 'giam dung luong anh', 'doi duoi anh', 'webp sang jpg', 'png sang jpg'],
  },
  {
    id: 'image-converter',
    kind: 'internal',
    name: 'Đổi đuôi ảnh tức thì (PNG ↔ JPG ↔ WebP ↔ ICO)',
    description:
      'Chuyển đổi định dạng ảnh PNG sang JPG, JPG sang PNG, WebP, ICO hàng loạt ngay trên trình duyệt; hỗ trợ chọn màu nền cho PNG trong suốt.',
    icon: 'ph-arrows-clockwise',
    badge: 'Đổi đuôi',
    keywords: [
      'doi duoi anh',
      'png sang jpg',
      'jpg sang png',
      'webp sang jpg',
      'webp sang png',
      'anh sang ico',
      'image converter',
    ],
  },
  {
    id: 'image-resizer',
    kind: 'internal',
    name: 'Đổi kích thước ảnh chống vỡ nét (Super-Sharp Resize)',
    description:
      'Phóng to 2×/3× tái tạo cạnh sắc nét (Unsharp Mask) hoặc thu nhỏ đa bước chống răng cưa; hỗ trợ xoay, lật và đổi đuôi PNG/JPG/WebP.',
    icon: 'ph-arrows-out',
    badge: 'Siêu nét',
    keywords: [
      'doi kich thuoc anh',
      'chinh size anh khong vo net',
      'phong to anh ro net',
      'resize image',
      'xoay anh',
      'lat anh',
    ],
  },
  {
    id: 'vn-name-splitter',
    kind: 'internal',
    name: 'Tách Họ - Tên đệm - Tên & Xếp A→Z chuẩn Excel',
    description:
      'Dán cột Họ và Tên từ Excel để tự động tách thành cột Họ đệm & cột Tên, sắp xếp A→Z chuẩn tiếng Việt và Copy dán lại vào Excel.',
    icon: 'ph-users-three',
    badge: 'Excel',
    keywords: ['tach ho ten', 'tach ten trong excel', 'sap xep ten a-z tieng viet'],
  },
  {
    id: 'list-deduplicator',
    kind: 'internal',
    name: 'Lọc trùng & Đối chiếu 2 danh sách (Tìm người chưa nộp)',
    description:
      'Lọc bỏ dòng trùng lặp trong danh sách hoặc đối chiếu Danh sách A với Danh sách B để tìm ngay ai còn thiếu.',
    icon: 'ph-funnel',
    keywords: ['loc trung danh sach', 'so sanh 2 danh sach', 'tim nguoi chua nop'],
  },
  {
    id: 'table-converter',
    kind: 'internal',
    name: 'Chuyển đổi Bảng Excel ↔ CSV / JSON / Markdown',
    description:
      'Copy vùng bảng từ Excel dán vào để chuyển tức thì sang bảng Markdown, CSV hoặc JSON.',
    icon: 'ph-table',
    keywords: ['excel sang markdown', 'excel sang json', 'csv sang json', 'tsv'],
  },
  {
    id: 'vat-percent-calculator',
    kind: 'internal',
    name: 'Tính Thuế GTGT (VAT 8% / 10%) Xuôi – Ngược',
    description:
      'Tách ngược tiền trước thuế từ tổng thanh toán hoặc cộng thuế GTGT (5%, 8%, 10%) và chiết khấu để ghi hóa đơn chính xác.',
    icon: 'ph-percent',
    badge: 'Kế toán',
    keywords: [
      'tinh thue vat',
      'tinh vat nguoc',
      'thue gtgt 8%',
      'thue gtgt 10%',
      'tinh chiet khau',
    ],
  },
  {
    id: 'workday-calculator',
    kind: 'internal',
    name: 'Tính Ngày làm việc & Hạn giải quyết văn bản',
    description:
      'Tính chính xác ngày đến hạn trả kết quả hồ sơ/văn bản (tự động trừ Thứ Bảy, Chủ Nhật và ngày Lễ) hoặc đếm ngày làm việc giữa 2 mốc.',
    icon: 'ph-calendar-check',
    badge: 'Hành chính',
    keywords: ['tinh ngay lam viec', 'han xu ly van ban', 'tru thu 7 chu nhat'],
  },
  {
    id: 'seniority-age-calculator',
    kind: 'internal',
    name: 'Tính Tuổi, Thâm niên công tác & Mốc tròn năm',
    description:
      'Tính chính xác số năm – tháng – ngày giữa 2 mốc thời gian và tra cứu các mốc kỷ niệm tròn 5, 10, 15, 20, 30, 40 năm.',
    icon: 'ph-hourglass-high',
    keywords: ['tinh tuoi', 'tinh tham nien cong tac', 'tinh so nam lam viec', 'moc tron nam'],
  },
  {
    id: 'lunar-solar-calendar',
    kind: 'internal',
    name: 'Tra cứu Âm – Dương lịch & Ngày Can Chi',
    description:
      'Quy đổi nhanh ngày Dương lịch sang Âm lịch Việt Nam, xem ngày/năm Thiên Can Địa Chi và thứ trong tuần.',
    icon: 'ph-moon-stars',
    keywords: ['am lich', 'duong lich', 'doi ngay am duong', 'can chi'],
  },
  {
    id: 'password-generator',
    kind: 'internal',
    name: 'Tạo mật khẩu mạnh & Mã định danh UUID',
    description:
      'Tạo mật khẩu ngẫu nhiên an toàn cao và danh sách mã định danh chuẩn UUID v4 ngay trên trình duyệt.',
    icon: 'ph-key',
    keywords: ['tao mat khau', 'password generator', 'uuid generator'],
  },
];
