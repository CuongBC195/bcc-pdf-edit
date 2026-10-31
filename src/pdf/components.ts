import React from 'react';

type LazyTool = React.LazyExoticComponent<React.ComponentType>;

const fromModule = <M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M): LazyTool =>
  React.lazy(async () => ({ default: (await load())[name] as React.ComponentType }));

const mergeSplit = () => import('./tools/mergeSplit');
const pageOps = () => import('./tools/pageOps');
const layout = () => import('./tools/layout');
const stampTools = () => import('./tools/stampTools');
const colorTools = () => import('./tools/colorTools');
const bookmarkTocTools = () => import('./tools/bookmarkTocTools');
const editSignTools = () => import('./tools/editSignTools');
const formTools = () => import('./tools/formTools');
const metaAttachLayerTools = () => import('./tools/metaAttachLayerTools');
const toPdfTools = () => import('./tools/toPdfTools');
const fromPdfTools = () => import('./tools/fromPdfTools');
const officeTools = () => import('./tools/officeTools');
const securityTools = () => import('./tools/securityTools');
const repairPrintTools = () => import('./tools/repairPrintTools');
const ocrTools = () => import('./tools/ocrTools');
const digitalSignTools = () => import('./tools/digitalSignTools');

/** id công cụ -> component (tải lười theo nhóm) */
export const PDF_TOOL_COMPONENTS: Record<string, LazyTool> = {
  'merge-pdf': fromModule(mergeSplit, 'MergePdf'),
  'split-pdf': fromModule(mergeSplit, 'SplitPdf'),
  'extract-pages': fromModule(mergeSplit, 'ExtractPages'),
  'alternate-merge': fromModule(mergeSplit, 'AlternateMerge'),
  'duplex-collate': fromModule(mergeSplit, 'DuplexCollate'),
  'overlay-pdf': fromModule(mergeSplit, 'OverlayPdf'),
  'pdf-to-zip': fromModule(mergeSplit, 'PdfToZip'),
  'pdf-multi-tool': fromModule(pageOps, 'PdfMultiTool'),
  'organize-pdf': fromModule(pageOps, 'OrganizePdf'),
  'delete-pages': fromModule(pageOps, 'DeletePages'),
  'add-blank-page': fromModule(pageOps, 'AddBlankPage'),
  'remove-blank-pages': fromModule(pageOps, 'RemoveBlankPages'),
  'reverse-pages': fromModule(pageOps, 'ReversePages'),
  'rotate-pdf': fromModule(pageOps, 'RotatePdf'),
  'rotate-custom': fromModule(pageOps, 'RotateCustom'),
  'divide-pages': fromModule(pageOps, 'DividePages'),
  'combine-single-page': fromModule(pageOps, 'CombineSinglePage'),
  'crop-pdf': fromModule(layout, 'CropPdf'),
  'n-up-pdf': fromModule(layout, 'NUpPdf'),
  'pdf-booklet': fromModule(layout, 'PdfBooklet'),
  'posterize-pdf': fromModule(layout, 'PosterizePdf'),
  'fix-page-size': fromModule(layout, 'FixPageSize'),
  'page-dimensions': fromModule(layout, 'PageDimensions'),
  // Đợt 2: Đánh số, Hình mờ, Màu sắc, Mục lục, Chỉnh sửa, Biểu mẫu, Metadata, Đính kèm, Lớp, So sánh
  'page-numbers': fromModule(stampTools, 'PageNumbers'),
  'header-footer': fromModule(stampTools, 'HeaderFooter'),
  'bates-numbering': fromModule(stampTools, 'BatesNumbering'),
  'add-watermark': fromModule(stampTools, 'AddWatermark'),
  'add-page-labels': fromModule(stampTools, 'AddPageLabels'),
  'background-color': fromModule(stampTools, 'BackgroundColor'),
  'text-color': fromModule(stampTools, 'TextColor'),
  'invert-colors': fromModule(colorTools, 'InvertColors'),
  'adjust-colors': fromModule(colorTools, 'AdjustColors'),
  'scanner-effect': fromModule(colorTools, 'ScannerEffect'),
  'pdf-to-greyscale': fromModule(colorTools, 'PdfToGreyscale'),
  bookmark: fromModule(bookmarkTocTools, 'BookmarkTool'),
  'table-of-contents': fromModule(bookmarkTocTools, 'TableOfContentsTool'),
  'edit-pdf': fromModule(editSignTools, 'EditPdf'),
  'edit-pdf-text': fromModule(editSignTools, 'EditPdfText'),
  'sign-pdf': fromModule(editSignTools, 'SignPdf'),
  'add-stamps': fromModule(editSignTools, 'AddStamps'),
  'remove-annotations': fromModule(editSignTools, 'RemoveAnnotations'),
  'form-filler': fromModule(formTools, 'FormFiller'),
  'form-creator': fromModule(formTools, 'FormCreator'),
  'flatten-pdf': fromModule(formTools, 'FlattenPdf'),
  'view-metadata': fromModule(metaAttachLayerTools, 'ViewMetadata'),
  'edit-metadata': fromModule(metaAttachLayerTools, 'EditMetadata'),
  'remove-metadata': fromModule(metaAttachLayerTools, 'RemoveMetadata'),
  'add-attachments': fromModule(metaAttachLayerTools, 'AddAttachments'),
  'extract-attachments': fromModule(metaAttachLayerTools, 'ExtractAttachments'),
  'edit-attachments': fromModule(metaAttachLayerTools, 'EditAttachments'),
  'pdf-layers': fromModule(metaAttachLayerTools, 'PdfLayers'),
  'compare-pdfs': fromModule(metaAttachLayerTools, 'ComparePdfs'),
  // Đợt 3: Chuyển sang PDF & Chuyển từ PDF & Nén PDF
  'image-to-pdf': fromModule(toPdfTools, 'ImageToPdf'),
  'jpg-to-pdf': fromModule(toPdfTools, 'JpgToPdf'),
  'png-to-pdf': fromModule(toPdfTools, 'PngToPdf'),
  'webp-to-pdf': fromModule(toPdfTools, 'WebpToPdf'),
  'svg-to-pdf': fromModule(toPdfTools, 'SvgToPdf'),
  'bmp-to-pdf': fromModule(toPdfTools, 'BmpToPdf'),
  'heic-to-pdf': fromModule(toPdfTools, 'HeicToPdf'),
  'tiff-to-pdf': fromModule(toPdfTools, 'TiffToPdf'),
  'cbz-to-pdf': fromModule(toPdfTools, 'CbzToPdf'),
  'txt-to-pdf': fromModule(toPdfTools, 'TxtToPdf'),
  'markdown-to-pdf': fromModule(toPdfTools, 'MarkdownToPdf'),
  'csv-to-pdf': fromModule(toPdfTools, 'CsvToPdf'),
  'json-to-pdf': fromModule(toPdfTools, 'JsonToPdf'),
  'xml-to-pdf': fromModule(toPdfTools, 'XmlToPdf'),
  'rtf-to-pdf': fromModule(toPdfTools, 'RtfToPdf'),
  'email-to-pdf': fromModule(toPdfTools, 'EmailToPdf'),
  'epub-to-pdf': fromModule(toPdfTools, 'EpubToPdf'),
  'fb2-to-pdf': fromModule(toPdfTools, 'Fb2ToPdf'),
  'pdf-to-jpg': fromModule(fromPdfTools, 'PdfToJpg'),
  'pdf-to-png': fromModule(fromPdfTools, 'PdfToPng'),
  'pdf-to-webp': fromModule(fromPdfTools, 'PdfToWebp'),
  'pdf-to-bmp': fromModule(fromPdfTools, 'PdfToBmp'),
  'pdf-to-tiff': fromModule(fromPdfTools, 'PdfToTiff'),
  'pdf-to-svg': fromModule(fromPdfTools, 'PdfToSvg'),
  'pdf-to-cbz': fromModule(fromPdfTools, 'PdfToCbz'),
  'extract-images': fromModule(fromPdfTools, 'ExtractImages'),
  'pdf-to-text': fromModule(fromPdfTools, 'PdfToText'),
  'pdf-to-markdown': fromModule(fromPdfTools, 'PdfToMarkdown'),
  'pdf-to-json': fromModule(fromPdfTools, 'PdfToJson'),
  'pdf-to-csv': fromModule(fromPdfTools, 'PdfToCsv'),
  'extract-tables': fromModule(fromPdfTools, 'ExtractTables'),
  'prepare-pdf-for-ai': fromModule(fromPdfTools, 'PreparePdfForAi'),
  'compress-pdf': fromModule(fromPdfTools, 'CompressPdf'),
  // Đợt 4: Office <-> PDF
  'word-to-pdf': fromModule(officeTools, 'WordToPdf'),
  'excel-to-pdf': fromModule(officeTools, 'ExcelToPdf'),
  'powerpoint-to-pdf': fromModule(officeTools, 'PowerpointToPdf'),
  'odt-to-pdf': fromModule(officeTools, 'OdtToPdf'),
  'ods-to-pdf': fromModule(officeTools, 'OdsToPdf'),
  'odp-to-pdf': fromModule(officeTools, 'OdpToPdf'),
  'odg-to-pdf': fromModule(officeTools, 'OdgToPdf'),
  'pdf-to-word': fromModule(officeTools, 'PdfToWord'),
  'pdf-to-excel': fromModule(officeTools, 'PdfToExcel'),
  // Đợt 5: Bảo mật, Sửa lỗi, PDF/A, OCR & Chữ ký số
  'protect-pdf': fromModule(securityTools, 'ProtectPdf'),
  'unlock-pdf': fromModule(securityTools, 'UnlockPdf'),
  'remove-restrictions': fromModule(securityTools, 'RemoveRestrictions'),
  'change-permissions': fromModule(securityTools, 'ChangePermissions'),
  'sanitize-pdf': fromModule(securityTools, 'SanitizePdf'),
  'repair-pdf': fromModule(repairPrintTools, 'RepairPdf'),
  'linearize-pdf': fromModule(repairPrintTools, 'LinearizePdf'),
  'rasterize-pdf': fromModule(repairPrintTools, 'RasterizePdfTool'),
  'pdf-to-pdfa': fromModule(repairPrintTools, 'PdfToPdfa'),
  'deskew-pdf': fromModule(repairPrintTools, 'DeskewPdf'),
  'font-to-outline': fromModule(repairPrintTools, 'FontToOutline'),
  'ocr-pdf': fromModule(ocrTools, 'OcrPdf'),
  'digital-sign-pdf': fromModule(digitalSignTools, 'DigitalSignPdf'),
  'validate-signature-pdf': fromModule(digitalSignTools, 'ValidateSignaturePdf'),
  'timestamp-pdf': fromModule(digitalSignTools, 'TimestampPdf'),
};

