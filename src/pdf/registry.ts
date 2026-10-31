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
  // Đính kèm, Lớp & Đối chiếu
  pdf('compare-pdfs', 'So sánh PDF', 'Đối chiếu hai tệp PDF theo từng trang: so sánh câu chữ thêm/bớt hoặc chồng hình điểm ảnh.', 'ph-git-diff', ['compare', 'diff', 'so sanh']),
  pdf('add-attachments', 'Đính kèm tệp vào PDF', 'Nhúng tệp Word, Excel, ảnh, ZIP... vào bên trong tài liệu PDF.', 'ph-paperclip', ['attach', 'embedded files', 'dinh kem']),
  pdf('extract-attachments', 'Lấy tệp đính kèm', 'Trích xuất toàn bộ tệp nhúng và chú thích tệp đính kèm ra ngoài hoặc tải về dạng ZIP.', 'ph-folder-Simple-Arrow-Down', ['extract attachments']),
  pdf('edit-attachments', 'Quản lý tệp đính kèm', 'Đổi tên, sửa mô tả hoặc xóa các tệp đã đính kèm trong PDF.', 'ph-paperclip', ['edit attachments', 'remove attachments']),
  pdf('pdf-layers', 'Lớp nội dung (Layers)', 'Xem, đổi tên và bật/tắt trạng thái hiển thị mặc định của các lớp OCG trong PDF.', 'ph-stack', ['layers', 'ocg']),
  // Chỉnh sửa & Chú thích
  pdf('edit-pdf', 'Chỉnh sửa PDF', 'Thêm chữ tiếng Việt, che trắng, tô sáng, vẽ khung, mũi tên, vẽ tay và chèn ảnh lên trang.', 'ph-pencil-simple-line', ['edit', 'annotate', 'chinh sua']),
  pdf('edit-pdf-text', 'Sửa chữ trong PDF', 'Bấm vào dòng chữ có sẵn trên trang để sửa nội dung hoặc chèn hộp chữ mới.', 'ph-text-t', ['edit text', 'sua chu']),
  pdf('sign-pdf', 'Ký tên vào PDF', 'Vẽ chữ ký tay, gõ tên chữ ký hoặc tải ảnh chữ ký (tự tách nền trắng) rồi đặt lên trang.', 'ph-signature', ['sign', 'signature', 'ky ten']),
  pdf('add-watermark', 'Đóng dấu mờ (Watermark)', 'Chèn chữ hoặc logo mờ chéo trang hoặc lặp kín trang, tùy chỉnh góc xoay và độ đậm.', 'ph-stamp', ['watermark', 'dong dau mo']),
  pdf('add-stamps', 'Đóng dấu nghiệp vụ', 'Đóng dấu ĐÃ THU TIỀN, SAO Y BẢN CHÍNH, KHẨN, ĐÃ PHÊ DUYỆT... kèm ngày tháng lên trang.', 'ph-stamp', ['stamp', 'con dau', 'dong dau']),
  pdf('remove-annotations', 'Xóa chú thích', 'Thống kê và gỡ bỏ các ghi chú, tô sáng, khung vẽ, liên kết khỏi tệp PDF.', 'ph-eraser', ['remove annotations', 'xoa chu thich']),
  // Đánh số & Mục lục
  pdf('page-numbers', 'Đánh số trang', 'Đánh số trang theo mẫu (Trang 1/10, - 1 -...), chọn vị trí, lề, trang bắt đầu và phông chữ.', 'ph-list-numbers', ['page numbers', 'danh so trang']),
  pdf('add-page-labels', 'Nhãn số trang (La Mã / Chữ)', 'Đặt số trang hiển thị trong trình đọc PDF (i, ii, iii cho phần đầu; 1, 2, 3 cho nội dung).', 'ph-tag', ['page labels', 'so la ma']),
  pdf('bates-numbering', 'Đánh số Bates hồ sơ', 'Đánh số thứ tự liên tục xuyên suốt nhiều tệp PDF trong một bộ hồ sơ pháp lý/kế toán.', 'ph-hash', ['bates', 'ho so']),
  pdf('header-footer', 'Đầu trang & Chân trang', 'Chèn tiêu đề đầu trang và chân trang 3 cột (trái, giữa, phải) kèm ngày tháng, tên tệp.', 'ph-rows', ['header', 'footer', 'dau trang', 'chan trang']),
  pdf('bookmark', 'Sửa mục lục (Bookmark)', 'Xem, thêm, sửa, phân cấp hoặc tự động dò tiêu đề chương/mục để tạo cây Bookmark.', 'ph-bookmarks', ['bookmark', 'outline', 'muc luc']),
  pdf('table-of-contents', 'Tạo trang mục lục', 'Tự sinh trang MỤC LỤC có chấm nối và liên kết bấm nhảy tới từng chương trong PDF.', 'ph-list-bullets', ['toc', 'table of contents', 'trang muc luc']),
  // Màu sắc & Hiệu ứng
  pdf('invert-colors', 'Đảo màu PDF (Chế độ tối)', 'Đổi nền trắng chữ đen sang nền tối dịu mắt khi đọc đêm hoặc đảo toàn bộ hệ màu RGB.', 'ph-moon', ['invert', 'dark mode', 'dao mau']),
  pdf('adjust-colors', 'Chỉnh độ sáng & tương phản', 'Tăng giảm độ sáng, độ tương phản, độ bão hòa và gamma để làm rõ bản chụp mờ.', 'ph-sliders-horizontal', ['brightness', 'contrast', 'chinh mau']),
  pdf('background-color', 'Đổi màu nền trang', 'Lót màu nền vàng dịu mắt dưới chữ hoặc thay vùng trắng trên bản scan.', 'ph-paint-bucket', ['background color', 'mau nen']),
  pdf('text-color', 'Đổi màu chữ', 'Đổi màu toàn bộ chữ đen trong tài liệu PDF vector sang màu xanh, đỏ hoặc màu tùy chọn.', 'ph-palette', ['text color', 'mau chu']),
  pdf('scanner-effect', 'Hiệu ứng bản scan', 'Giả lập tài liệu vừa quét qua máy scan với hạt giấy, ngả màu nhẹ và độ nghiêng tự nhiên.', 'ph-scan', ['scanner', 'hieu ung scan']),
  pdf('pdf-to-greyscale', 'Chuyển PDF sang trắng đen', 'Chuyển tài liệu màu sang thang xám hoặc đen trắng rõ nét để in ấn tiết kiệm mực.', 'ph-drop-half', ['grayscale', 'greyscale', 'trang den']),
  // Biểu mẫu
  pdf('form-filler', 'Điền biểu mẫu PDF', 'Điền các trường biểu mẫu điện tử (AcroForm) hỗ trợ tiếng Việt hoặc gõ chữ lên mẫu đơn phẳng.', 'ph-textbox', ['fill form', 'dien bieu mau']),
  pdf('form-creator', 'Tạo biểu mẫu PDF', 'Kéo thả tạo ô nhập chữ, ô tích chọn, danh sách thả xuống và nút chọn đơn trên trang PDF.', 'ph-selection-plus', ['create form', 'tao bieu mau']),
  pdf('flatten-pdf', 'Làm phẳng PDF (Flatten)', 'Hợp nhất các ô biểu mẫu, chữ ký và chú thích thành nội dung cố định không thể sửa xóa.', 'ph-stack-simple', ['flatten', 'lam phang']),
  // Metadata
  pdf('view-metadata', 'Xem thông tin PDF', 'Kiểm tra chi tiết tiêu đề, tác giả, phần mềm tạo, XMP, số biểu mẫu, lớp và xuất JSON.', 'ph-info', ['metadata', 'properties', 'thong tin']),
  pdf('edit-metadata', 'Sửa thông tin PDF', 'Cập nhật tiêu đề, tác giả, chủ đề, từ khóa chuẩn tiếng Việt cho tài liệu PDF.', 'ph-note-pencil', ['edit metadata', 'sua thong tin']),
  pdf('remove-metadata', 'Xóa thông tin ẩn', 'Xóa sạch Document Info, XMP và mã định danh tệp để bảo vệ quyền riêng tư trước khi chia sẻ.', 'ph-eye-slash', ['remove metadata', 'xoa thong tin']),
  // Đợt 3: Hình ảnh / Văn bản / Dữ liệu / Ebook -> PDF
  pdf('image-to-pdf', 'Ảnh sang PDF', 'Ghép các ảnh JPG, PNG, WebP, SVG, BMP, TIFF thành tệp PDF chuẩn khổ A4 hoặc khớp kích thước ảnh.', 'ph-image', ['image to pdf', 'anh sang pdf']),
  pdf('jpg-to-pdf', 'JPG sang PDF', 'Chuyển một hoặc nhiều ảnh JPG/JPEG thành tệp PDF, tùy chọn khổ giấy và lề.', 'ph-file-jpg', ['jpg to pdf', 'jpeg to pdf']),
  pdf('png-to-pdf', 'PNG sang PDF', 'Chuyển các ảnh PNG chất lượng cao sang tài liệu PDF.', 'ph-file-png', ['png to pdf']),
  pdf('webp-to-pdf', 'WebP sang PDF', 'Chuyển ảnh WebP tải từ web thành tệp PDF dễ in ấn và lưu trữ.', 'ph-image', ['webp to pdf']),
  pdf('svg-to-pdf', 'SVG sang PDF', 'Chuyển hình vẽ vector SVG sang trang PDF.', 'ph-file-svg', ['svg to pdf']),
  pdf('bmp-to-pdf', 'BMP sang PDF', 'Chuyển ảnh Bitmap (.bmp) sang định dạng PDF gọn nhẹ.', 'ph-image', ['bmp to pdf']),
  pdf('heic-to-pdf', 'HEIC sang PDF', 'Chuyển ảnh chụp từ iPhone (.heic/.heif) sang tệp PDF.', 'ph-image', ['heic to pdf', 'iphone']),
  pdf('tiff-to-pdf', 'TIFF sang PDF', 'Giải mã ảnh scan TIFF (kể cả TIFF nhiều trang) sang tài liệu PDF.', 'ph-image', ['tiff to pdf', 'tif to pdf']),
  pdf('cbz-to-pdf', 'Truyện tranh CBZ sang PDF', 'Chuyển tệp truyện tranh .cbz / .zip chứa ảnh thành sách PDF.', 'ph-book-open', ['cbz to pdf', 'comic']),
  pdf('txt-to-pdf', 'Văn bản TXT sang PDF', 'Dàn trang tệp văn bản thuần (.txt) sang PDF với phông chữ tiếng Việt rõ đẹp.', 'ph-file-txt', ['txt to pdf', 'text to pdf']),
  pdf('markdown-to-pdf', 'Markdown sang PDF', 'Kết xuất tài liệu Markdown (.md) có tiêu đề, danh sách, bảng và khối mã sang PDF.', 'ph-markdown-logo', ['markdown to pdf', 'md to pdf']),
  pdf('csv-to-pdf', 'Bảng CSV sang PDF', 'Chuyển tệp bảng tính CSV/TSV thành bảng biểu PDF có kẻ ô và tự động chia trang.', 'ph-file-csv', ['csv to pdf', 'tsv to pdf']),
  pdf('json-to-pdf', 'JSON sang PDF', 'Trình bày dữ liệu JSON thành bảng tổng hợp và mã nguồn định dạng chuẩn trên PDF.', 'ph-brackets-curly', ['json to pdf']),
  pdf('xml-to-pdf', 'XML sang PDF', 'Chuyển tệp cấu trúc XML (hóa đơn điện tử, dữ liệu) sang bảng và văn bản PDF.', 'ph-file-code', ['xml to pdf']),
  pdf('rtf-to-pdf', 'RTF sang PDF', 'Đọc văn bản Rich Text Format (.rtf) và xuất ra tệp PDF chuẩn tiếng Việt.', 'ph-file-text', ['rtf to pdf']),
  pdf('email-to-pdf', 'Email (.EML) sang PDF', 'Chuyển thư điện tử .eml (Người gửi, Người nhận, Tiêu đề, Nội dung) sang bản lưu PDF.', 'ph-envelope-open', ['email to pdf', 'eml to pdf']),
  pdf('epub-to-pdf', 'Sách EPUB sang PDF', 'Đọc các chương sách điện tử .epub và dàn trang thành tệp PDF.', 'ph-book-bookmark', ['epub to pdf', 'ebook']),
  pdf('fb2-to-pdf', 'Sách FB2 sang PDF', 'Chuyển sách điện tử FictionBook (.fb2) sang định dạng PDF.', 'ph-book', ['fb2 to pdf']),
  // Đợt 3: PDF -> Hình ảnh / Văn bản / Dữ liệu & Nén PDF
  pdf('pdf-to-jpg', 'PDF sang ảnh JPG', 'Xuất từng trang PDF thành ảnh JPG sắc nét ở 100/150/300 DPI.', 'ph-file-jpg', ['pdf to jpg', 'pdf sang anh']),
  pdf('pdf-to-png', 'PDF sang ảnh PNG', 'Xuất trang PDF thành ảnh PNG không nén mất dữ liệu.', 'ph-file-png', ['pdf to png']),
  pdf('pdf-to-webp', 'PDF sang ảnh WebP', 'Xuất trang PDF sang định dạng ảnh WebP dung lượng nhẹ.', 'ph-images', ['pdf to webp']),
  pdf('pdf-to-bmp', 'PDF sang ảnh BMP', 'Xuất trang PDF ra định dạng ảnh Bitmap 24-bit (.bmp).', 'ph-images', ['pdf to bmp']),
  pdf('pdf-to-tiff', 'PDF sang ảnh TIFF', 'Xuất các trang PDF sang tệp ảnh TIFF phục vụ lưu trữ và in ấn.', 'ph-images', ['pdf to tiff']),
  pdf('pdf-to-svg', 'PDF sang hình SVG', 'Xuất từng trang PDF sang tệp đồ họa SVG.', 'ph-file-svg', ['pdf to svg']),
  pdf('pdf-to-cbz', 'PDF sang truyện CBZ', 'Đóng gói các trang PDF thành tệp truyện tranh .cbz.', 'ph-book-open', ['pdf to cbz']),
  pdf('extract-images', 'Trích xuất ảnh từ PDF', 'Bóc tách các hình ảnh nhúng trong tài liệu PDF ra tệp ảnh rời.', 'ph-images', ['extract images', 'lay anh tu pdf']),
  pdf('pdf-to-text', 'PDF sang Văn bản (TXT)', 'Trích xuất toàn bộ nội dung chữ tiếng Việt từ PDF ra văn bản thuần.', 'ph-file-txt', ['pdf to text', 'pdf sang txt']),
  pdf('pdf-to-markdown', 'PDF sang Markdown', 'Chuyển nội dung PDF thành tài liệu Markdown có tiêu đề và bảng biểu.', 'ph-markdown-logo', ['pdf to markdown', 'pdf to md']),
  pdf('pdf-to-json', 'PDF sang JSON', 'Xuất cấu trúc trang, tiêu đề, dòng văn bản, bảng biểu và metadata ra JSON.', 'ph-brackets-curly', ['pdf to json']),
  pdf('pdf-to-csv', 'PDF sang CSV', 'Nhận diện và trích xuất dữ liệu dạng bảng trong PDF ra tệp CSV mở bằng Excel.', 'ph-file-csv', ['pdf to csv']),
  pdf('extract-tables', 'Trích xuất bảng từ PDF', 'Dò các bảng số liệu trên từng trang PDF và xuất ra định dạng CSV.', 'ph-table', ['extract tables', 'lay bang']),
  pdf('prepare-pdf-for-ai', 'Chuẩn bị PDF cho AI', 'Đóng gói nội dung PDF kèm thẻ phân trang, bảng Markdown và ước tính token cho ChatGPT/Claude/Gemini.', 'ph-sparkle', ['ai', 'llm', 'chatgpt', 'prompt']),
  pdf('compress-pdf', 'Nén giảm dung lượng PDF', 'Giảm dung lượng tệp PDF bằng tối ưu cấu trúc lossless hoặc nén lại trang scan.', 'ph-arrows-in-line-horizontal', ['compress', 'nen pdf', 'giam dung luong']),
  // Đợt 4: Văn phòng (Word, Excel, PowerPoint, OpenDocument) <-> PDF
  pdf('word-to-pdf', 'Word (.DOCX) sang PDF', 'Chuyển văn bản Microsoft Word .docx (có bảng biểu, hình ảnh, tiêu đề) sang PDF chuẩn tiếng Việt.', 'ph-microsoft-word-logo', ['word to pdf', 'docx to pdf']),
  pdf('excel-to-pdf', 'Excel (.XLSX) sang PDF', 'Chuyển bảng tính Excel .xlsx và .csv sang bảng PDF có kẻ khung và tiêu đề cột.', 'ph-microsoft-excel-logo', ['excel to pdf', 'xlsx to pdf']),
  pdf('powerpoint-to-pdf', 'PowerPoint (.PPTX) sang PDF', 'Chuyển các trang trình chiếu PowerPoint .pptx sang PDF khổ ngang 16:9.', 'ph-microsoft-powerpoint-logo', ['powerpoint to pdf', 'pptx to pdf']),
  pdf('odt-to-pdf', 'OpenDocument Text (.ODT) sang PDF', 'Chuyển tài liệu soạn thảo LibreOffice Writer (.odt) sang PDF.', 'ph-file-doc', ['odt to pdf', 'libreoffice']),
  pdf('ods-to-pdf', 'OpenDocument Spreadsheet (.ODS) sang PDF', 'Chuyển bảng tính LibreOffice Calc (.ods) sang bảng PDF.', 'ph-table', ['ods to pdf', 'calc']),
  pdf('odp-to-pdf', 'OpenDocument Presentation (.ODP) sang PDF', 'Chuyển bài trình chiếu LibreOffice Impress (.odp) sang PDF.', 'ph-presentation-chart', ['odp to pdf', 'impress']),
  pdf('odg-to-pdf', 'OpenDocument Drawing (.ODG) sang PDF', 'Chuyển bản vẽ LibreOffice Draw (.odg) sang PDF.', 'ph-bezier-curve', ['odg to pdf', 'draw']),
  pdf('pdf-to-word', 'PDF sang Word (.DOCX)', 'Trích xuất văn bản, tiêu đề và bảng biểu từ PDF sang tệp Microsoft Word .docx chỉnh sửa được.', 'ph-microsoft-word-logo', ['pdf to word', 'pdf to docx', 'pdf sang word']),
  pdf('pdf-to-excel', 'PDF sang Excel (.XLSX)', 'Trích xuất các bảng dữ liệu trong PDF ra tệp bảng tính Microsoft Excel .xlsx.', 'ph-microsoft-excel-logo', ['pdf to excel', 'pdf to xlsx', 'pdf sang excel']),
  // Đợt 5: Bảo mật, Sửa lỗi, PDF/A, OCR & Chữ ký số
  pdf('protect-pdf', 'Đặt mật khẩu PDF', 'Khóa tệp PDF bằng mật khẩu chuẩn mã hóa AES-256 và thiết lập quyền in, sao chép, chỉnh sửa.', 'ph-lock-key', ['protect', 'encrypt', 'mat khau']),
  pdf('unlock-pdf', 'Mở khóa mật khẩu PDF', 'Nhập mật khẩu hiện tại để gỡ bỏ hoàn toàn mật khẩu khỏi tệp PDF.', 'ph-lock-key-open', ['unlock', 'decrypt', 'go mat khau']),
  pdf('remove-restrictions', 'Gỡ hạn chế in & sao chép', 'Mở khóa quyền in ấn, sao chép chữ và chỉnh sửa đối với tệp PDF bị giới hạn quyền chủ sở hữu.', 'ph-key', ['remove restrictions', 'go han che']),
  pdf('change-permissions', 'Đổi phân quyền PDF', 'Thay đổi quyền cho phép in, điền biểu mẫu, chú thích hoặc sao chép văn bản trên tệp PDF.', 'ph-shield-check', ['permissions', 'phan quyen']),
  pdf('sanitize-pdf', 'Làm sạch bảo mật PDF', 'Loại bỏ JavaScript, hành động tự chạy, tệp nhúng ẩn, siêu dữ liệu và liên kết ngoài.', 'ph-broom', ['sanitize', 'lam sach']),
  pdf('repair-pdf', 'Sửa tệp PDF bị hỏng', 'Phục hồi bảng tham chiếu chéo (xref), trailer và các luồng dữ liệu của tệp PDF bị lỗi.', 'ph-wrench', ['repair', 'recover', 'sua loi pdf']),
  pdf('linearize-pdf', 'Tối ưu mở nhanh trên Web', 'Chuyển PDF sang chuẩn Fast Web View (Linearized) để hiển thị ngay trang đầu khi mở qua mạng.', 'ph-gauge', ['linearize', 'fast web view']),
  pdf('rasterize-pdf', 'Hóa ảnh trang PDF', 'Chuyển từng trang PDF thành hình ảnh phẳng để khóa cứng bố cục và chống sao chép chữ.', 'ph-image-square', ['rasterize', 'flatten to image']),
  pdf('pdf-to-pdfa', 'Chuyển sang chuẩn PDF/A', 'Đóng gói siêu dữ liệu XMP và hệ màu sRGB theo chuẩn lưu trữ dài hạn ISO 19005 (PDF/A-1b, 2b, 3b).', 'ph-archive', ['pdfa', 'pdf/a', 'luu tru']),
  pdf('deskew-pdf', 'Làm thẳng trang scan bị nghiêng', 'Tự động phát hiện góc lệch của dòng chữ trên trang scan và xoay thẳng lại.', 'ph-compass', ['deskew', 'straighten', 'lam thang']),
  pdf('font-to-outline', 'Cố định phông chữ in ấn', 'Kết xuất trang ở độ nét cao 300 DPI để không phụ thuộc vào phông chữ trên máy nhà in.', 'ph-text-aa', ['font to outline', 'khong loi font']),
  pdf('ocr-pdf', 'Nhận dạng chữ PDF (OCR)', 'Nhận diện văn bản tiếng Việt và tiếng Anh trên bản scan, tạo lớp chữ tìm kiếm được (Ctrl+F) và xuất TXT.', 'ph-scan', ['ocr', 'nhan dang chu', 'scan sang chu']),
  pdf('digital-sign-pdf', 'Ký số PDF (X.509 / PKCS#7)', 'Ký số vào tệp PDF bằng chứng thư số .p12/.pfx hoặc chứng thư X.509 tự sinh kèm con dấu hiển thị.', 'ph-signature', ['digital sign', 'pkcs12', 'p12', 'pfx', 'ky so']),
  pdf('validate-signature-pdf', 'Kiểm tra chữ ký số PDF', 'Xác thực chữ ký số PKCS#7/X.509 trong tệp PDF, kiểm tra chứng thư và tính toàn vẹn dữ liệu.', 'ph-seal-check', ['validate signature', 'verify', 'kiem tra chu ky so']),
  pdf('timestamp-pdf', 'Đóng dấu thời gian (Timestamp)', 'Đóng dấu thời gian toàn vẹn tài liệu và xuất yêu cầu chuẩn RFC 3161 (.TSQ).', 'ph-clock-countdown', ['timestamp', 'rfc3161', 'dau thoi gian']),
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

