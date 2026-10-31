/** Đọc tệp ảnh thành data URL (PNG/JPEG; định dạng khác được chuyển sang PNG) */
export async function fileToImageDataUrl(file: File, maxSide = 2400): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const keepJpeg = file.type === 'image/jpeg' && scale === 1;
    if (keepJpeg || (file.type === 'image/png' && scale === 1)) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Làm trong suốt nền trắng của ảnh (chữ ký, con dấu scan) */
export async function removeWhiteBackground(dataUrl: string, tolerance = 40): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (lum > 255 - tolerance) d[i + 3] = Math.round(((255 - lum) / tolerance) * 255);
  }
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Kích thước ảnh (px) từ data URL */
export async function imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  return { w: img.naturalWidth, h: img.naturalHeight };
}

/** Tách bytes + định dạng từ data URL ảnh PNG/JPEG */
export function dataUrlToBytes(url: string): { bytes: Uint8Array; type: 'png' | 'jpg' } {
  const m = /^data:image\/(png|jpe?g);base64,(.*)$/i.exec(url);
  if (!m) throw new Error('Ảnh không hợp lệ.');
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, type: m[1].toLowerCase() === 'png' ? 'png' : 'jpg' };
}
