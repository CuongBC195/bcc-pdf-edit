/**
 * Tạo chuỗi dữ liệu VietQR chuyển khoản (chuẩn EMVCo QR thanh toán của NAPAS).
 *
 * Cấu trúc (Tag-Length-Value):
 *   00 Payload Format Indicator = "01"
 *   01 Point of Initiation      = "11" (QR tĩnh) | "12" (QR động, có số tiền)
 *   38 Merchant Account Info    = { 00 GUID "A000000727", 01 { 00 BIN, 01 số tài khoản }, 02 "QRIBFTTA" }
 *   53 Mã tiền tệ               = "704" (VND)
 *   54 Số tiền                  (tùy chọn)
 *   58 Mã quốc gia              = "VN"
 *   62 Thông tin bổ sung        = { 08 nội dung chuyển khoản } (tùy chọn)
 *   63 CRC                      = CRC-16/CCITT-FALSE trên toàn chuỗi, gồm cả "6304"
 */

const NAPAS_GUID = 'A000000727';
const SERVICE_ACCOUNT_TRANSFER = 'QRIBFTTA';

function tlv(tag: string, value: string): string {
  if (value.length > 99) throw new Error(`Trường ${tag} vượt quá 99 ký tự`);
  return `${tag}${String(value.length).padStart(2, '0')}${value}`;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF). Giá trị kiểm tra "123456789" = 29B1. */
export function crc16Ccitt(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Bỏ dấu & ký tự đặc biệt: nội dung chuyển khoản chỉ nên dùng chữ không dấu, số và khoảng trắng. */
export function sanitizeTransferNote(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface VietQrInput {
  bin: string;
  accountNo: string;
  amount?: number;
  note?: string;
}

export function buildVietQrPayload({ bin, accountNo, amount, note }: VietQrInput): string {
  if (!/^\d{6}$/.test(bin)) throw new Error('Mã ngân hàng (BIN) không hợp lệ');
  const account = accountNo.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9]{4,19}$/.test(account)) {
    throw new Error('Số tài khoản chỉ gồm chữ/số, dài 4–19 ký tự');
  }

  const hasAmount = typeof amount === 'number' && Number.isFinite(amount) && amount > 0;
  const beneficiary = tlv('00', bin) + tlv('01', account);
  const merchantInfo = tlv('00', NAPAS_GUID) + tlv('01', beneficiary) + tlv('02', SERVICE_ACCOUNT_TRANSFER);
  const cleanNote = note ? sanitizeTransferNote(note) : '';

  let payload =
    tlv('00', '01') +
    tlv('01', hasAmount ? '12' : '11') +
    tlv('38', merchantInfo) +
    tlv('53', '704') +
    (hasAmount ? tlv('54', String(Math.round(amount))) : '') +
    tlv('58', 'VN') +
    (cleanNote ? tlv('62', tlv('08', cleanNote)) : '');

  payload += '6304';
  return payload + crc16Ccitt(payload);
}
