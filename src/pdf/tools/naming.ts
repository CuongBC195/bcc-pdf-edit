import type { LoadedFile } from '../ui/useToolFiles';

/** Tên tệp kết quả: <tên gốc>_<hậu tố>.<đuôi> */
export const outName = (file: LoadedFile, suffix: string, ext = 'pdf') =>
  `${file.file.name.replace(/\.[^/.]+$/, '') || 'tai-lieu'}_${suffix}.${ext}`;
