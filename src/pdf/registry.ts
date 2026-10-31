import type { ToolDef } from '../catalog/types';

/**
 * Công cụ PDF tự xây (thay cho bản BentoPDF cũ). Giữ nguyên id cũ để Yêu thích / Vừa dùng không bị mất.
 */
const pdf = (id: string, name: string, description: string, icon: ToolDef['icon'], keywords: string[] = []): ToolDef => ({
  id,
  kind: 'internal',
  name,
  description,
  icon,
  keywords: [id.replace(/-/g, ' '), ...keywords],
});

export const PDF_TOOLS: ToolDef[] = [
  // Gộp & Tách
  pdf('merge-pdf', 'Gộp PDF', 'Ghép nhiều tệp PDF thành một, sắp xếp thứ tự tệp và chọn dải trang của từng tệp.', 'ph-git-merge', ['merge', 'ghep pdf', 'noi pdf']),
  pdf('split-pdf', 'Tách PDF', 'Chia tệp PDF theo điểm cắt chọn trên trang, dải trang, mỗi N trang, chia đều hoặc theo bookmark.', 'ph-scissors', ['split', 'chia pdf', 'cat pdf']),
  pdf('extract-pages', 'Trích xuất trang', 'Lấy các trang được chọn ra thành tệp PDF mới, hoặc mỗi trang một tệp.', 'ph-file-arrow-up', ['extract', 'lay trang']),
  pdf('alternate-merge', 'Trộn xen kẽ trang', 'Xen kẽ trang của nhiều tệp (A1, B1, A2, B2...), có thể đảo ngược thứ tự từng tệp.', 'ph-shuffle', ['alternate', 'interleave']),
  pdf('duplex-collate', 'Ghép bản scan 2 mặt', 'Sắp lại đúng thứ tự trang khi scan mặt trước và mặt sau riêng bằng máy scan 1 mặt.', 'ph-copy', ['duplex', 'scan hai mat']),
  pdf('overlay-pdf', 'Chồng lớp PDF', 'Đặt trang của một tệp (mẫu tiêu đề, khung, dấu) lên trên hoặc làm nền cho tệp khác.', 'ph-stack', ['overlay', 'underlay', 'letterhead']),
  pdf('pdf-to-zip', 'Đóng gói PDF thành ZIP', 'Gom nhiều tệp PDF vào một tệp nén ZIP để gửi đi nhanh.', 'ph-file-zip', ['zip', 'nen']),
  // Thao tác trang
  pdf('pdf-multi-tool', 'Sửa trang đa năng', 'Ghép trang từ nhiều tệp, kéo thả sắp xếp, xoay, nhân bản, chèn trang trắng, xóa và xuất PDF.', 'ph-squares-four', ['multi tool', 'page editor']),
  pdf('organize-pdf', 'Sắp xếp trang', 'Kéo thả đổi thứ tự trang, xoay, nhân bản, xóa trang, có hoàn tác.', 'ph-arrows-down-up', ['organize', 'reorder', 'sap xep']),
  pdf('delete-pages', 'Xóa trang', 'Chọn trên lưới hoặc nhập dải trang cần xóa khỏi tệp PDF.', 'ph-trash', ['delete', 'remove pages']),
  pdf('add-blank-page', 'Chèn trang trắng', 'Thêm trang trắng vào đầu, cuối, trước/sau trang bất kỳ hoặc sau mỗi N trang.', 'ph-file-plus', ['blank page', 'them trang']),
  pdf('remove-blank-pages', 'Xóa trang trắng tự động', 'Phát hiện và loại bỏ trang trắng trong bản scan, cho chỉnh ngưỡng và giữ lại thủ công.', 'ph-broom', ['blank', 'trang trang']),
  pdf('reverse-pages', 'Đảo ngược thứ tự trang', 'Đưa trang cuối lên đầu, hữu ích khi máy scan nạp giấy ngược.', 'ph-arrows-counter-clockwise', ['reverse']),
  pdf('rotate-pdf', 'Xoay trang', 'Xoay 90°/180° từng trang hoặc nhiều trang cùng lúc, xem trước trực tiếp.', 'ph-arrow-clockwise', ['rotate', 'xoay pdf']),
  pdf('rotate-custom', 'Xoay góc tùy ý', 'Xoay trang theo góc bất kỳ (ví dụ 1.5°) để chỉnh bản scan bị lệch.', 'ph-arrow-arc-right', ['rotate custom', 'deskew', 'xoay lech']),
  pdf('divide-pages', 'Chia đôi trang', 'Chia mỗi trang thành 2 hoặc nhiều phần (ví dụ trang scan A3 chứa 2 trang A4).', 'ph-columns', ['divide', 'split page', 'chia doi']),
  pdf('combine-single-page', 'Ghép thành 1 trang dài', 'Nối toàn bộ trang thành một trang dài theo chiều dọc hoặc ngang.', 'ph-rows', ['combine', 'long page']),
  // Bố cục & In ấn
  pdf('crop-pdf', 'Cắt lề PDF', 'Cắt lề theo số đo hoặc tự động cắt khoảng trắng quanh nội dung, xem trước khung cắt.', 'ph-crop', ['crop', 'cat le', 'trim']),
  pdf('n-up-pdf', 'Nhiều trang trên 1 tờ', 'In 2, 4, 6, 8, 9 hoặc 16 trang trên một tờ giấy để tiết kiệm giấy.', 'ph-grid-four', ['n-up', 'nup', 'tiet kiem giay']),
  pdf('pdf-booklet', 'In sách gấp', 'Sắp trang để in 2 mặt rồi gấp đôi thành sách, tự thêm trang trắng cho đủ.', 'ph-book-open', ['booklet', 'in sach']),
  pdf('posterize-pdf', 'In poster', 'Phóng to trang ra nhiều tờ A4/A3 để ghép thành poster, có phần chồng mép để dán.', 'ph-frame-corners', ['poster', 'tile']),
  pdf('fix-page-size', 'Chuẩn hóa khổ giấy', 'Đưa mọi trang về cùng một khổ (A4, A3, Letter...), chọn cách co giãn và lề.', 'ph-ruler', ['page size', 'a4', 'kho giay']),
  pdf('page-dimensions', 'Xem kích thước trang', 'Liệt kê khổ giấy, kích thước, hướng và góc xoay của từng trang; xuất bảng CSV.', 'ph-ruler', ['dimensions', 'kich thuoc']),
];

export const PDF_TOOL_IDS: ReadonlySet<string> = new Set(PDF_TOOLS.map((t) => t.id));

/** Định dạng / công cụ bản cũ không còn hỗ trợ */
export const RETIRED_TOOL_IDS: ReadonlySet<string> = new Set([
  'xps-to-pdf',
  'mobi-to-pdf',
  'wpd-to-pdf',
  'wps-to-pdf',
  'pages-to-pdf',
  'pub-to-pdf',
  'vsd-to-pdf',
  'psd-to-pdf',
  'pdf-workflow',
]);

