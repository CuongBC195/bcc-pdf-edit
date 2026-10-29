import { encodeQrMatrix } from './qrCode';
import { decodeVnCccd } from './vnCccd';

export interface RaycastQuickAction {
  id: string;
  badge: string;
  accent: string;
  icon: string;
  title: string;
  subtitle: string;
  copyText?: string;
  qrPayload?: string;
  qrModules?: boolean[][];
  toolHref?: string;
  specialEffect?: 'toggle-theme';
}

const VN_DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const VN_UNITS = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

function readThreeDigitsVn(
  hundred: number,
  ten: number,
  unit: number,
  readZeroHundred: boolean
): string {
  const parts: string[] = [];
  if (hundred > 0 || readZeroHundred) {
    parts.push(`${VN_DIGITS[hundred]} trăm`);
  }
  if (ten === 0 && unit > 0 && (hundred > 0 || readZeroHundred)) {
    parts.push('lẻ');
  } else if (ten === 1) {
    parts.push('mười');
  } else if (ten > 1) {
    parts.push(`${VN_DIGITS[ten]} mươi`);
  }

  if (unit > 0) {
    if (ten > 1 && unit === 1) {
      parts.push('mốt');
    } else if (ten >= 1 && unit === 5) {
      parts.push('lăm');
    } else if (ten > 1 && unit === 4) {
      parts.push('tư');
    } else {
      parts.push(VN_DIGITS[unit]);
    }
  }
  return parts.join(' ');
}

export function numberToVietnameseWords(rawDigits: string): string {
  const clean = rawDigits.replace(/^0+/, '');
  if (!clean) return 'Không';
  if (clean.length > 18) return 'Số quá lớn';

  const padded = clean.padStart(Math.ceil(clean.length / 3) * 3, '0');
  const groups: number[] = [];
  for (let i = 0; i < padded.length; i += 3) {
    groups.push(Number(padded.slice(i, i + 3)));
  }

  const numGroups = groups.length;
  const resultParts: string[] = [];

  for (let i = 0; i < numGroups; i++) {
    const val = groups[i];
    if (val === 0) continue;
    const h = Math.floor(val / 100);
    const t = Math.floor((val % 100) / 10);
    const u = val % 10;
    const unitIdx = numGroups - 1 - i;
    const text = readThreeDigitsVn(h, t, u, i > 0);
    const unitLabel = VN_UNITS[unitIdx] ?? '';
    resultParts.push(unitLabel ? `${text} ${unitLabel}` : text);
  }

  const sentence = resultParts.join(' ').trim();
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

const EN_ONES = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const EN_TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];
const EN_SCALES = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion'];

function readThreeDigitsEn(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rem = n % 100;
  if (h > 0) parts.push(`${EN_ONES[h]} hundred`);
  if (rem > 0) {
    if (rem < 20) parts.push(EN_ONES[rem]);
    else {
      const t = Math.floor(rem / 10);
      const u = rem % 10;
      parts.push(u > 0 ? `${EN_TENS[t]}-${EN_ONES[u]}` : EN_TENS[t]);
    }
  }
  return parts.join(' ');
}

export function numberToEnglishWords(rawDigits: string): string {
  const clean = rawDigits.replace(/^0+/, '');
  if (!clean) return 'Zero';
  if (clean.length > 18) return 'Number too large';

  const padded = clean.padStart(Math.ceil(clean.length / 3) * 3, '0');
  const groups: number[] = [];
  for (let i = 0; i < padded.length; i += 3) {
    groups.push(Number(padded.slice(i, i + 3)));
  }

  const numGroups = groups.length;
  const parts: string[] = [];
  for (let i = 0; i < numGroups; i++) {
    const val = groups[i];
    if (val === 0) continue;
    const scale = EN_SCALES[numGroups - 1 - i] ?? '';
    const words = readThreeDigitsEn(val);
    parts.push(scale ? `${words} ${scale}` : words);
  }
  const sentence = parts.join(' ').trim();
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/**
 * Mở rộng đơn vị viết tắt tiếng Việt: 15tr -> 15000000, 2.5ty -> 2500000000, 500k -> 500000
 */
function expandVietnameseUnits(expr: string): string {
  return expr
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:ty|tỷ|ti|tỉ)\b/gi, (_, n) =>
      String(Math.round(parseFloat(n.replace(',', '.')) * 1_000_000_000))
    )
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:tr|trieu|triệu|m)\b/gi, (_, n) =>
      String(Math.round(parseFloat(n.replace(',', '.')) * 1_000_000))
    )
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:nghin|nghìn|ngan|ngàn|k)\b/gi, (_, n) =>
      String(Math.round(parseFloat(n.replace(',', '.')) * 1_000))
    );
}

/**
 * Bộ tính toán biểu thức số học an toàn (Shunting-yard, không dùng eval)
 */
function evaluateMathExpression(rawInput: string): number | null {
  const trimmed = rawInput.trim().replace(/^=\s*/, '');
  if (!trimmed) return null;

  const expanded = expandVietnameseUnits(trimmed)
    // Đổi 8% thành *0.08 nếu đứng sau phép nhân/chia hoặc (1 + 8%)
    .replace(/(\d+(?:\.\d+)?)\s*%/g, '($1*0.01)');

  // Chỉ cho phép chữ số, dấu chấm, +, -, *, /, (, ), khoảng trắng
  if (!/^[0-9+\-*/().\s]+$/.test(expanded)) return null;
  // Phải chứa ít nhất 1 toán tử hoặc đơn vị viết tắt đã được mở rộng
  const hasOperator = /[+\-*/%]/.test(trimmed) || /\b(ty|tỷ|ti|tỉ|tr|trieu|triệu|k|nghin|nghìn)\b/i.test(trimmed);
  if (!hasOperator) return null;

  const tokens = expanded.match(/\d+(?:\.\d+)?|[+\-*/()]/g);
  if (!tokens || tokens.length < 2) return null;

  const values: number[] = [];
  const ops: string[] = [];

  const precedence = (op: string) => (op === '+' || op === '-' ? 1 : op === '*' || op === '/' ? 2 : 0);

  const applyOp = () => {
    const op = ops.pop();
    const b = values.pop();
    const a = values.pop();
    if (op === undefined || a === undefined || b === undefined) return false;
    if (op === '+') values.push(a + b);
    else if (op === '-') values.push(a - b);
    else if (op === '*') values.push(a * b);
    else if (op === '/') {
      if (b === 0) return false;
      values.push(a / b);
    }
    return true;
  };

  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (/^\d/.test(tk)) {
      values.push(parseFloat(tk));
    } else if (tk === '(') {
      ops.push(tk);
    } else if (tk === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') {
        if (!applyOp()) return null;
      }
      if (ops.pop() !== '(') return null;
    } else if (['+', '-', '*', '/'].includes(tk)) {
      // Hỗ trợ số âm đầu biểu thức hoặc sau dấu '('
      if (tk === '-' && (i === 0 || tokens[i - 1] === '(')) {
        values.push(0);
      }
      while (ops.length && precedence(ops[ops.length - 1]) >= precedence(tk)) {
        if (!applyOp()) return null;
      }
      ops.push(tk);
    }
  }

  while (ops.length) {
    if (ops[ops.length - 1] === '(' || !applyOp()) return null;
  }

  if (values.length !== 1 || !Number.isFinite(values[0])) return null;
  return values[0];
}

function stripVietnameseAccents(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function toTitleCaseVn(str: string): string {
  return str
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
}

const CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'];
const CHI = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];
const FIXED_HOLIDAYS = new Set(['01-01', '04-30', '05-01', '09-02']);

function formatLunarInfo(date: Date): { lunarStr: string; canChiYear: string } {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-chinese', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    }).formatToParts(date);
    const lDay = parts.find((p) => p.type === 'day')?.value ?? '';
    const lMonth = parts.find((p) => p.type === 'month')?.value ?? '';
    const relatedPart = parts.find((p) => (p.type as string) === 'relatedYear');
    const relatedYear = Number(relatedPart?.value ?? date.getFullYear());
    const can = CAN[(relatedYear + 6) % 10];
    const chi = CHI[(relatedYear + 8) % 12];
    return {
      lunarStr: `Mùng/Ngày ${lDay} tháng ${lMonth} Âm lịch`,
      canChiYear: `Năm ${can} ${chi} (${relatedYear})`,
    };
  } catch {
    return { lunarStr: 'Âm lịch', canChiYear: '' };
  }
}

function addWorkingDays(start: Date, days: number): Date {
  const cur = new Date(start);
  let rem = Math.max(0, Math.min(1000, days));
  while (rem > 0) {
    cur.setDate(cur.getDate() + 1);
    const dow = cur.getDay();
    if (dow === 0 || dow === 6) continue;
    const key = `${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
    if (FIXED_HOLIDAYS.has(key)) continue;
    rem--;
  }
  return cur;
}

export function resolveRaycastActions(rawQuery: string): RaycastQuickAction[] {
  const q = rawQuery.trim();
  if (!q) return [];

  const actions: RaycastQuickAction[] = [];
  const fmtNum = (n: number) => Math.round(n).toLocaleString('vi-VN');

  // 1. Kiểm tra tiền tố tạo QR hoặc URL
  const qrMatch = q.match(/^qr\s+(.+)$/i);
  const isUrl = /^(https?:\/\/|www\.)[^\s]+$/i.test(q);
  if (qrMatch || isUrl) {
    const payload = (qrMatch ? qrMatch[1] : q).trim();
    const fullPayload = /^www\./i.test(payload) ? `https://${payload}` : payload;
    try {
      const matrix = encodeQrMatrix(fullPayload, 'M');
      actions.push({
        id: 'raycast-qr-inline',
        badge: 'QR TỨC THÌ',
        accent: '#10b981',
        icon: 'ph-qr-code',
        title: `Mã QR: ${fullPayload}`,
        subtitle: 'Nhấn Enter để Copy ảnh QR (PNG) vào Clipboard • Bấm để mở trình tạo QR',
        copyText: fullPayload,
        qrPayload: fullPayload,
        qrModules: matrix.modules,
        toolHref: '/t/qr-generator',
      });
    } catch {
      // Bỏ qua nếu chuỗi quá dài
    }
  }

  // 1b. Giải mã tức thì số CCCD 12 số (hoặc 11 số mất số 0 đầu do Excel)
  const cccdMatch = q.match(/^(?:cccd|cmnd|id)?\s*('?\d{11,12})$/i);
  if (cccdMatch) {
    const decoded = decodeVnCccd(cccdMatch[1], { autoPadLeadingZero: true });
    if (decoded.isValid) {
      const summary = `${decoded.normalizedCode} • ${decoded.gender} • Sinh năm ${decoded.birthYear} (${decoded.age} tuổi) • ${decoded.provinceName}`;
      actions.push({
        id: 'raycast-cccd-decode',
        badge: decoded.wasZeroPadded ? 'CCCD (ĐÃ BÙ SỐ 0)' : 'GIẢI MÃ CCCD',
        accent: '#0284c7',
        icon: 'ph-identification-card',
        title: `${decoded.gender} • Sinh năm ${decoded.birthYear} (${decoded.age} tuổi) — ${decoded.provinceName}`,
        subtitle: `CCCD chuẩn: ${decoded.normalizedCode} (Mã tỉnh ${decoded.provinceCode} • Số định danh ${decoded.randomSerial})`,
        copyText: summary,
        toolHref: '/t/cccd-inspector',
      });
    }
  }

  // 2. Kiểm tra số tiền hoặc từ khóa đọc số / tính VAT (VD: "15000000", "15.000.000", "15tr", "vat 25000000")
  const moneyPrefixMatch = q.match(/^(?:doc|tien|so|vat|thue)\s+(.+)$/i);
  const candidateNumberStr = (moneyPrefixMatch ? moneyPrefixMatch[1] : q).trim();

  // Kiểm tra số thuần túy có dấu chấm/phẩy phân cách hàng nghìn (VD: 15.000.000 hoặc 15000000)
  const isFormattedInteger = /^\d{1,3}(?:[.,]\d{3})+$/.test(candidateNumberStr) || /^\d{3,18}$/.test(candidateNumberStr);
  const isShorthandUnit = /^\d+(?:[.,]\d+)?\s*(?:ty|tỷ|ti|tỉ|tr|trieu|triệu|nghin|nghìn|ngan|ngàn|k)$/i.test(
    candidateNumberStr
  );

  let numericAmount: number | null = null;
  if (isFormattedInteger) {
    numericAmount = Number(candidateNumberStr.replace(/[.,]/g, ''));
  } else if (isShorthandUnit) {
    numericAmount = Number(expandVietnameseUnits(candidateNumberStr));
  }

  // 3. Máy tính biểu thức toán học (nếu không phải số nguyên đơn thuần)
  if (numericAmount === null) {
    const mathVal = evaluateMathExpression(candidateNumberStr);
    if (mathVal !== null) {
      const rounded = Math.round(mathVal * 100) / 100;
      const formatted = rounded.toLocaleString('vi-VN');
      const intStr = String(Math.floor(Math.abs(rounded)));
      const vnWords = intStr.length <= 18 ? `${numberToVietnameseWords(intStr)} đồng` : '';
      actions.push({
        id: 'raycast-math-result',
        badge: 'MÁY TÍNH NHANH',
        accent: '#06b6d4',
        icon: 'ph-calculator',
        title: `= ${formatted}`,
        subtitle: vnWords
          ? `${vnWords} • Nhấn Enter để Copy kết quả số`
          : 'Nhấn Enter để Copy kết quả tính toán',
        copyText: String(rounded),
      });
      if (Math.abs(rounded) >= 100 && intStr.length <= 18) {
        numericAmount = Math.round(Math.abs(rounded));
      }
    }
  }

  if (numericAmount !== null && Number.isFinite(numericAmount) && numericAmount > 0) {
    const rawIntStr = String(Math.round(numericAmount));
    if (rawIntStr.length <= 18) {
      const vnWords = `${numberToVietnameseWords(rawIntStr)} đồng chẵn.`;
      const enWords = `${numberToEnglishWords(rawIntStr)} VND`;

      actions.push({
        id: 'raycast-money-vn',
        badge: 'ĐỌC SỐ TIỀN VNĐ',
        accent: '#8b5cf6',
        icon: 'ph-currency-circle-dollar',
        title: vnWords,
        subtitle: `${fmtNum(numericAmount)} VNĐ • Nhấn Enter để Copy chữ viết bằng tiếng Việt`,
        copyText: vnWords,
        toolHref: '/t/number-to-words',
      });

      // Tính nhanh VAT 8% & 10%
      const vat8Tax = Math.round(numericAmount * 0.08);
      const vat8Total = numericAmount + vat8Tax;
      const vat8ReverseBase = Math.round(numericAmount / 1.08);
      const vat8ReverseTax = numericAmount - vat8ReverseBase;

      actions.push({
        id: 'raycast-vat-8',
        badge: 'THUẾ VAT 8%',
        accent: '#3b82f6',
        icon: 'ph-percent',
        title: `Cộng VAT 8%: ${fmtNum(vat8Total)} đ (Thuế: ${fmtNum(vat8Tax)} đ)`,
        subtitle: `Tách ngược (đã gồm 8%): Trước thuế ${fmtNum(vat8ReverseBase)} đ + Thuế ${fmtNum(vat8ReverseTax)} đ • Enter để Copy`,
        copyText: `Trước thuế: ${fmtNum(numericAmount)} đ | VAT 8%: ${fmtNum(vat8Tax)} đ | Tổng thanh toán: ${fmtNum(vat8Total)} đ (${numberToVietnameseWords(String(vat8Total))} đồng chẵn)`,
        toolHref: '/t/vat-percent-calculator',
      });

      const vat10Tax = Math.round(numericAmount * 0.1);
      const vat10Total = numericAmount + vat10Tax;
      const vat10ReverseBase = Math.round(numericAmount / 1.1);
      const vat10ReverseTax = numericAmount - vat10ReverseBase;

      actions.push({
        id: 'raycast-vat-10',
        badge: 'THUẾ VAT 10%',
        accent: '#0284c7',
        icon: 'ph-percent',
        title: `Cộng VAT 10%: ${fmtNum(vat10Total)} đ (Thuế: ${fmtNum(vat10Tax)} đ)`,
        subtitle: `Tách ngược (đã gồm 10%): Trước thuế ${fmtNum(vat10ReverseBase)} đ + Thuế ${fmtNum(vat10ReverseTax)} đ • Enter để Copy`,
        copyText: `Trước thuế: ${fmtNum(numericAmount)} đ | VAT 10%: ${fmtNum(vat10Tax)} đ | Tổng thanh toán: ${fmtNum(vat10Total)} đ (${numberToVietnameseWords(String(vat10Total))} đồng chẵn)`,
        toolHref: '/t/vat-percent-calculator',
      });

      actions.push({
        id: 'raycast-money-en',
        badge: 'TIẾNG ANH',
        accent: '#6366f1',
        icon: 'ph-translate',
        title: enWords,
        subtitle: `Đọc tiếng Anh cho ${fmtNum(numericAmount)} • Nhấn Enter để Copy`,
        copyText: enWords,
        toolHref: '/t/number-to-words',
      });
    }
  }

  // 4. Tra cứu Ngày Âm - Dương & Tính hạn ngày làm việc (VD: "hom nay", "+15 ngay", "15/08/2026")
  const normQ = stripVietnameseAccents(q).toLowerCase();
  const workdayMatch = normQ.match(/^(?:\+|han\s+)?(\d{1,3})\s*ngay(?:\s+lam\s+viec)?$/);
  if (workdayMatch) {
    const days = Number(workdayMatch[1]);
    const due = addWorkingDays(new Date(), days);
    const dueFormatted = due.toLocaleDateString('vi-VN', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    actions.push({
      id: 'raycast-workday-deadline',
      badge: 'HẠN XỬ LÝ VĂN BẢN',
      accent: '#f43f5e',
      icon: 'ph-calendar-check',
      title: `Sau ${days} ngày làm việc: ${dueFormatted}`,
      subtitle: 'Đã tự động trừ Thứ Bảy, Chủ Nhật & ngày Lễ cố định • Nhấn Enter để Copy',
      copyText: dueFormatted,
      toolHref: '/t/workday-calculator',
    });
  }

  const dateMatch = q.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (
    dateMatch ||
    normQ === 'hom nay' ||
    normQ === 'am lich' ||
    normQ === 'ngay am' ||
    normQ === 'lich am'
  ) {
    const targetDate = dateMatch
      ? new Date(Number(dateMatch[3]), Number(dateMatch[2]) - 1, Number(dateMatch[1]))
      : new Date();
    if (!Number.isNaN(targetDate.getTime())) {
      const solarFormatted = targetDate.toLocaleDateString('vi-VN', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const { lunarStr, canChiYear } = formatLunarInfo(targetDate);
      const summary = `${solarFormatted} — ${lunarStr} (${canChiYear})`;
      actions.push({
        id: 'raycast-lunar-date',
        badge: 'LỊCH ÂM – DƯƠNG',
        accent: '#f59e0b',
        icon: 'ph-moon-stars',
        title: summary,
        subtitle: 'Nhấn Enter để Copy thông tin ngày Âm – Dương',
        copyText: summary,
        toolHref: '/t/lunar-solar-calendar',
      });
    }
  }

  // 5. Lệnh xử lý chuỗi nhanh: hoa <text>, thuong <text>, ten <text>, bodau <text>, slug <text>
  const textCmdMatch = q.match(/^(hoa|thuong|ten|bodau|slug)\s+(.+)$/i);
  if (textCmdMatch) {
    const cmd = textCmdMatch[1].toLowerCase();
    const content = textCmdMatch[2].trim();
    let result = content;
    let label = 'CHUẨN HÓA CHỮ';
    if (cmd === 'hoa') {
      result = content.toUpperCase();
      label = 'CHỮ IN HOA';
    } else if (cmd === 'thuong') {
      result = content.toLowerCase();
      label = 'CHỮ IN THƯỜNG';
    } else if (cmd === 'ten') {
      result = toTitleCaseVn(content);
      label = 'CHUẨN HÓA HỌ TÊN';
    } else if (cmd === 'bodau') {
      result = stripVietnameseAccents(content);
      label = 'BỎ DẤU TIẾNG VIỆT';
    } else if (cmd === 'slug') {
      result = stripVietnameseAccents(content)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      label = 'TẠO SLUG URL';
    }

    actions.push({
      id: `raycast-text-${cmd}`,
      badge: label,
      accent: '#8b5cf6',
      icon: 'ph-text-aa',
      title: result,
      subtitle: 'Nhấn Enter để Copy văn bản đã chuyển đổi',
      copyText: result,
      toolHref: '/t/text-case-accent',
    });
  }

  // 6. Tạo mật khẩu mạnh tức thì
  if (normQ === 'pass' || normQ === 'password' || normQ === 'mat khau' || normQ === 'mk') {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
    const arr = new Uint32Array(16);
    crypto.getRandomValues(arr);
    const pwd = Array.from(arr, (x) => chars[x % chars.length]).join('');
    actions.push({
      id: 'raycast-password',
      badge: 'MẬT KHẨU MẠNH',
      accent: '#10b981',
      icon: 'ph-key',
      title: pwd,
      subtitle: 'Mật khẩu ngẫu nhiên 16 ký tự chuẩn bảo mật (Web Crypto) • Nhấn Enter để Copy',
      copyText: pwd,
      toolHref: '/t/password-generator',
    });
  }

  // 7. Đổi giao diện Sáng / Tối nhanh
  if (normQ === 'theme' || normQ === 'giao dien' || normQ === 'sang' || normQ === 'toi' || normQ === 'dark') {
    actions.push({
      id: 'raycast-toggle-theme',
      badge: 'HỆ THỐNG',
      accent: '#06b6d4',
      icon: 'ph-sun-horizon',
      title: 'Chuyển đổi giao diện Sáng ⇄ Tối',
      subtitle: 'Nhấn Enter để đổi chế độ màu nền ngay lập tức',
      specialEffect: 'toggle-theme',
    });
  }

  return actions;
}
