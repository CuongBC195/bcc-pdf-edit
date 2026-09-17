import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import type { SplitRule, PDFMetadata } from '../types/pdf';
import { sanitizeRelativePath } from '../utils/pageUtils';

/**
 * Loads basic metadata from PDF file ArrayBuffer
 */
export async function loadPdfMetadata(file: File): Promise<PDFMetadata> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer.slice(0), { ignoreEncryption: true });
  const pageCount = pdfDoc.getPageCount();

  return {
    name: file.name,
    size: file.size,
    pageCount,
    arrayBuffer,
  };
}

export interface GeneratedPdfResult {
  path: string; // e.g., "01_PhapLy/HopDong.pdf"
  bytes: Uint8Array;
  pageCount: number;
}

/**
 * Splits source PDF into multiple output PDFs based on user defined rules
 * Supports pageRotations mapping (1-based page number to additional clockwise degrees: 0, 90, 180, 270)
 */
export async function executeMultiSplit(
  sourceBuffer: ArrayBuffer,
  rules: SplitRule[],
  pageRotationsOrProgress?: Record<number, number> | ((current: number, total: number, message: string) => void),
  onProgressCallback?: (current: number, total: number, message: string) => void
): Promise<GeneratedPdfResult[]> {
  let pageRotations: Record<number, number> = {};
  let onProgress: ((current: number, total: number, message: string) => void) | undefined;

  if (typeof pageRotationsOrProgress === 'function') {
    onProgress = pageRotationsOrProgress;
  } else if (pageRotationsOrProgress) {
    pageRotations = pageRotationsOrProgress;
    onProgress = onProgressCallback;
  }

  const sourceDoc = await PDFDocument.load(sourceBuffer.slice(0), { ignoreEncryption: true });
  const totalSourcePages = sourceDoc.getPageCount();
  const results: GeneratedPdfResult[] = [];

  const validRules = rules.filter((r) => r.isValid && r.pages.length > 0);
  if (validRules.length === 0) {
    throw new Error('Không có quy tắc cắt nào hợp lệ để xử lý.');
  }

  const total = validRules.length;

  for (let i = 0; i < total; i++) {
    const rule = validRules[i];
    const sanitizedPath = sanitizeRelativePath(rule.name, `split_part_${i + 1}.pdf`);

    if (onProgress) {
      onProgress(i + 1, total, `Đang tạo: ${sanitizedPath} (${rule.pages.length} trang)...`);
    }

    const newDoc = await PDFDocument.create();

    // Map 1-based page numbers to 0-based indices and clamp to source limits
    const zeroBasedIndices = rule.pages
      .filter((p) => p >= 1 && p <= totalSourcePages)
      .map((p) => p - 1);

    if (zeroBasedIndices.length > 0) {
      const copiedPages = await newDoc.copyPages(sourceDoc, zeroBasedIndices);
      for (let idx = 0; idx < copiedPages.length; idx++) {
        const page = copiedPages[idx];
        const pageNum = zeroBasedIndices[idx] + 1; // 1-based page number
        const currentRot = page.getRotation().angle;
        const additionalRot = (pageRotations && pageRotations[pageNum]) || 0;

        if (additionalRot !== 0) {
          page.setRotation(degrees((currentRot + additionalRot) % 360));
        }
        newDoc.addPage(page);
      }
    }

    const bytes = await newDoc.save();
    results.push({
      path: sanitizedPath,
      bytes,
      pageCount: zeroBasedIndices.length,
    });
  }

  return results;
}

/**
 * Creates a beautiful sample PDF document with 12 pages for immediate testing
 */
export async function generateSamplePdf(): Promise<PDFMetadata> {
  const doc = await PDFDocument.create();
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

  const sections = [
    { title: 'BỘ HỒ SƠ PHÁP LÝ & HỢP ĐỒNG KINH TẾ TỔNG HỢP', sub: 'Trang 1: Bìa hồ sơ dự án', cat: 'Bìa & Giới thiệu' },
    { title: 'HỢP ĐỒNG KINH TẾ SỐ 88/2026/HĐKT', sub: 'Trang 2: Các bên tham gia & Điều khoản 1-5', cat: '01_HopDong' },
    { title: 'HỢP ĐỒNG KINH TẾ SỐ 88/2026/HĐKT', sub: 'Trang 3: Phạm vi công việc & Thanh toán', cat: '01_HopDong' },
    { title: 'HỢP ĐỒNG KINH TẾ SỐ 88/2026/HĐKT', sub: 'Trang 4: Trách nhiệm các bên & Ký tên đóng dấu', cat: '01_HopDong' },
    { title: 'PHỤ LỤC 01: BẢNG TIẾN ĐỘ THỰC HIỆN', sub: 'Trang 5: Mốc tiến độ bàn giao các giai đoạn', cat: '02_PhuLuc' },
    { title: 'PHỤ LỤC 02: BẢNG GIÁ & DỰ TOÁN KỸ THUẬT', sub: 'Trang 6: Chi tiết đơn giá vật tư thiết bị', cat: '02_PhuLuc' },
    { title: 'PHỤ LỤC 02: BẢNG GIÁ & DỰ TOÁN KỸ THUẬT', sub: 'Trang 7: Chi phí nhân công & Dự phòng phí', cat: '02_PhuLuc' },
    { title: 'GIẤY CHỨNG NHẬN ĐĂNG KÝ DOANH NGHIỆP', sub: 'Trang 8: Thông tin công ty & Người đại diện', cat: '03_PhapLy' },
    { title: 'CĂN CƯỚC CÔNG DÂN ĐẠI DIỆN PHÁP LUẬT', sub: 'Trang 9: Bản sao chứng thực CCCD', cat: '03_PhapLy' },
    { title: 'BÁO CÁO TÀI CHÍNH NĂM GẦN NHẤT', sub: 'Trang 10: Bảng cân đối kế toán & Kết quả KD', cat: '04_TaiChinh' },
    { title: 'BIÊN BẢN NGHIỆM THU GIAI ĐOẠN 1', sub: 'Trang 11: Đánh giá chất lượng và xác nhận', cat: '05_NghiemThu' },
    { title: 'HÓA ĐƠN ĐIỆN TỬ GTGT ĐÍNH KÈM', sub: 'Trang 12: Thông tin tra cứu & Ký số xác thực', cat: '05_NghiemThu' },
  ];

  for (let i = 0; i < sections.length; i++) {
    const page = doc.addPage([595.28, 841.89]); // Standard A4
    const item = sections[i];

    // Top banner color band
    page.drawRectangle({
      x: 0,
      y: 780,
      width: 595.28,
      height: 62,
      color: rgb(0.08, 0.12, 0.2),
    });

    page.drawText('BentoPDF Sample Document - Ready for Multi-Split Test', {
      x: 40,
      y: 805,
      size: 11,
      font: fontBold,
      color: rgb(0.2, 0.8, 0.6),
    });

    page.drawText(`Phân loại dự kiến: ${item.cat}`, {
      x: 40,
      y: 790,
      size: 10,
      font: fontRegular,
      color: rgb(0.8, 0.85, 0.9),
    });

    // Main Card Box
    page.drawRectangle({
      x: 40,
      y: 200,
      width: 515,
      height: 540,
      borderColor: rgb(0.85, 0.88, 0.92),
      borderWidth: 1.5,
      color: rgb(0.98, 0.99, 1.0),
    });

    page.drawText(`TRANG ${i + 1} / ${sections.length}`, {
      x: 60,
      y: 700,
      size: 26,
      font: fontBold,
      color: rgb(0.1, 0.15, 0.3),
    });

    page.drawText(item.title, {
      x: 60,
      y: 660,
      size: 14,
      font: fontBold,
      color: rgb(0.15, 0.2, 0.35),
    });

    page.drawText(item.sub, {
      x: 60,
      y: 635,
      size: 12,
      font: fontRegular,
      color: rgb(0.35, 0.4, 0.5),
    });

    // Dummy document lines
    for (let line = 0; line < 12; line++) {
      page.drawLine({
        start: { x: 60, y: 580 - line * 26 },
        end: { x: 510, y: 580 - line * 26 },
        thickness: 1,
        color: rgb(0.88, 0.9, 0.93),
      });
    }

    page.drawText(`* Đây là trang mẫu được tạo tự động để bạn kiểm tra tính năng cắt đa dải trang và custom tên folder.`, {
      x: 60,
      y: 230,
      size: 9,
      font: fontRegular,
      color: rgb(0.5, 0.55, 0.65),
    });

    // Footer
    page.drawText(`Tài liệu mẫu BentoPDF - Trang ${i + 1}`, {
      x: 40,
      y: 40,
      size: 10,
      font: fontRegular,
      color: rgb(0.55, 0.6, 0.7),
    });
  }

  const bytes = await doc.save();
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

  return {
    name: 'HoSoMau_HopDongVaPhuLuc_12Trang.pdf',
    size: arrayBuffer.byteLength,
    pageCount: 12,
    arrayBuffer,
  };
}
