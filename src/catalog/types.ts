/**
 * Kiểu dữ liệu cho cây danh mục của Hub.
 *
 * Một danh mục có thể chứa đồng thời danh mục con và công cụ; trang danh mục hiển thị
 * cả hai trên cùng một lưới (danh mục con trước, công cụ sau).
 */

/** Tên class Phosphor Icons, ví dụ `ph-scissors` (xem https://phosphoricons.com). */
export type IconName = `ph-${string}`;

export type ToolKind =
  /** Công cụ React nội bộ, mở tại /t/:id */
  | 'internal'
  /** Công cụ BentoPDF, mở trang tĩnh /pdf/vi/:id */
  | 'bento';

export interface ToolDef {
  id: string;
  kind: ToolKind;
  name: string;
  description: string;
  icon: IconName;
  /** Từ khóa bổ sung cho tìm kiếm (tiếng Anh, tên gọi khác...) */
  keywords?: string[];
  /** Gắn nhãn nổi bật trên thẻ công cụ */
  badge?: string;
}

/** Định nghĩa danh mục trong file cấu hình (tham chiếu công cụ bằng id). */
export interface CategoryDef {
  slug: string;
  name: string;
  description: string;
  icon: IconName;
  /** Tông màu nhấn của danh mục (CSS color) */
  accent?: string;
  children?: CategoryDef[];
  tools?: string[];
}

/** Danh mục đã được resolve (công cụ là object đầy đủ, có đường dẫn). */
export interface CategoryNode {
  slug: string;
  /** Đường dẫn slug từ gốc, ví dụ ['chuyen-sang-pdf', 'van-phong'] */
  path: string[];
  name: string;
  description: string;
  icon: IconName;
  accent: string;
  children: CategoryNode[];
  tools: ToolDef[];
  /** Tổng số công cụ (kể cả trong danh mục con) */
  totalTools: number;
}

export interface ToolLocation {
  tool: ToolDef;
  /** Chuỗi danh mục chứa công cụ, từ gốc tới danh mục trực tiếp */
  trail: CategoryNode[];
}
