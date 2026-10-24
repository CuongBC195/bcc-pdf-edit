import React, { useMemo, useState } from 'react';
import { Check, ClipboardPaste, Copy, Plus, Trash2 } from 'lucide-react';
import { HubShell } from '../hub/HubShell';
import { ToolPageHeader } from './ToolPageHeader';

export type VnTextToolId =
  | 'number-to-words'
  | 'vn-font-converter'
  | 'text-case-accent'
  | 'text-diff'
  | 'word-counter'
  | 'find-replace-batch'
  | 'text-extractor';

// ============================================================================
// 1. LOGIC ĐỌC SỐ TIỀN THÀNH CHỮ TIẾNG VIỆT & TIẾNG ANH
// ============================================================================
const VN_DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const VN_UNITS = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

function readThreeDigitsVn(hundred: number, ten: number, unit: number, readZeroHundred: boolean): string {
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

function numberToVietnameseWords(rawDigits: string): string {
  const clean = rawDigits.replace(/^0+/, '');
  if (!clean) return 'Không';
  if (clean.length > 18) return 'Số vượt quá phạm vi đọc tự động (tối đa 18 chữ số)';

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
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
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

function numberToEnglishWords(rawDigits: string): string {
  const clean = rawDigits.replace(/^0+/, '');
  if (!clean) return 'Zero';
  if (clean.length > 18) return 'Number too large';

  const padded = clean.padStart(Math.ceil(clean.length / 3) * 3, '0');
  const groups: number[] = [];
  for (let i = 0; i < padded.length; i += 3) {
    groups.push(Number(padded.slice(i, i + 3)));
  }

  const parts: string[] = [];
  for (let i = 0; i < groups.length; i++) {
    const val = groups[i];
    if (val === 0) continue;
    const scale = EN_SCALES[groups.length - 1 - i] ?? '';
    const sub = readThreeDigitsEn(val);
    parts.push(scale ? `${sub} ${scale}` : sub);
  }
  const s = parts.join(' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ============================================================================
// 2. BẢNG CHUYỂN MÃ TCVN3 (ABC) & VNI WINDOWS <-> UNICODE
// ============================================================================
const UNICODE_CHARS =
  'àảãáạăằẳẵắặâầẩẫấậđèẻẽéẹêềểễếệìỉĩíịòỏõóọôồổỗốộơờởỡớợùủũúụưừửữứựỳỷỹýỵĂÂĐÊÔƠƯ';

const TCVN3_CHARS =
  'µ¶·¸¹¨»¼½¾Æ©ÇÈÉÊË®ÌÎÏÐÑªÒÓÔÕÖ×ØÜÝÞßáâãä«åæçèé¬êëìíîïñòóô­õö÷øùúûüýþ¡¢§£¤¥¦';

const VNI_PAIRS: [string, string][] = [
  ['aø', 'à'], ['aû', 'ả'], ['aõ', 'ã'], ['aù', 'á'], ['aï', 'ạ'],
  ['aê', 'ă'], ['aè', 'ằ'], ['aú', 'ẳ'], ['aẵ', 'ẵ'], ['aé', 'ắ'], ['aë', 'ặ'],
  ['aâ', 'â'], ['aà', 'ầ'], ['aå', 'ẩ'], ['aẫ', 'ẫ'], ['aá', 'ấ'], ['aä', 'ậ'],
  ['ñ', 'đ'], ['Ñ', 'Đ'],
  ['eø', 'è'], ['eû', 'ẻ'], ['eõ', 'ẽ'], ['eù', 'é'], ['eï', 'ẹ'],
  ['eê', 'ê'], ['eà', 'ề'], ['eå', 'ể'], ['eẫ', 'ễ'], ['eá', 'ế'], ['eä', 'ệ'],
  ['ì', 'ì'], ['æ', 'ỉ'], ['ó', 'ĩ'], ['í', 'í'], ['ò', 'ị'],
  ['oø', 'ò'], ['oû', 'ỏ'], ['oõ', 'õ'], ['où', 'ó'], ['oï', 'ọ'],
  ['oâ', 'ô'], ['oà', 'ồ'], ['oå', 'ổ'], ['oẫ', 'ỗ'], ['oá', 'ố'], ['oä', 'ộ'],
  ['ô', 'ơ'], ['ôø', 'ờ'], ['ôû', 'ở'], ['ôõ', 'ỡ'], ['ôù', 'ớ'], ['ôï', 'ợ'],
  ['uø', 'ù'], ['uû', 'ủ'], ['uõ', 'ũ'], ['uù', 'ú'], ['uï', 'ụ'],
  ['ö', 'ư'], ['öø', 'ừ'], ['öû', 'ử'], ['öõ', 'ữ'], ['öù', 'ứ'], ['öï', 'ự'],
  ['yø', 'ỳ'], ['yû', 'ỷ'], ['yõ', 'ỹ'], ['yù', 'ý'], ['yï', 'ỵ'],
  ['AØ', 'À'], ['AÛ', 'Ả'], ['AÕ', 'Ã'], ['AÙ', 'Á'], ['AÏ', 'Ạ'],
  ['AÊ', 'Ă'], ['AÈ', 'Ằ'], ['AÚ', 'Ẳ'], ['AÉ', 'Ắ'], ['AË', 'Ặ'],
  ['AÂ', 'Â'], ['AÀ', 'Ầ'], ['AÅ', 'Ẩ'], ['AÁ', 'Ấ'], ['AÄ', 'Ậ'],
  ['EØ', 'È'], ['EÛ', 'Ẻ'], ['EÕ', 'Ẽ'], ['EÙ', 'É'], ['EÏ', 'Ẹ'],
  ['EÊ', 'Ê'], ['EÀ', 'Ề'], ['EÅ', 'Ể'], ['EÁ', 'Ế'], ['EÄ', 'Ệ'],
  ['OØ', 'Ò'], ['OÛ', 'Ỏ'], ['OÕ', 'Õ'], ['OÙ', 'Ó'], ['OÏ', 'Ọ'],
  ['OÂ', 'Ô'], ['OÀ', 'Ồ'], ['OÅ', 'Ổ'], ['OÁ', 'Ố'], ['OÄ', 'Ộ'],
  ['Ô', 'Ơ'], ['ÔØ', 'Ờ'], ['ÔÛ', 'Ở'], ['ÔÕ', 'Ỡ'], ['ÔÙ', 'Ớ'], ['ÔÏ', 'Ợ'],
  ['UØ', 'Ù'], ['UÛ', 'Ủ'], ['UÕ', 'Ũ'], ['UÙ', 'Ú'], ['UÏ', 'Ụ'],
  ['Ö', 'Ư'], ['ÖØ', 'Ừ'], ['ÖÛ', 'Ử'], ['ÖÕ', 'Ữ'], ['ÖÙ', 'Ứ'], ['ÖÏ', 'Ự'],
  ['YØ', 'Ỳ'], ['YÛ', 'Ỷ'], ['YÕ', 'Ỹ'], ['YÙ', 'Ý'], ['YÏ', 'Ỵ'],
];

function convertTcvn3ToUnicode(input: string): string {
  const map = new Map<string, string>();
  for (let i = 0; i < TCVN3_CHARS.length; i++) {
    map.set(TCVN3_CHARS[i], UNICODE_CHARS[i]);
  }
  return Array.from(input)
    .map((ch) => map.get(ch) ?? ch)
    .join('');
}

function convertUnicodeToTcvn3(input: string): string {
  const map = new Map<string, string>();
  for (let i = 0; i < UNICODE_CHARS.length; i++) {
    map.set(UNICODE_CHARS[i], TCVN3_CHARS[i]);
  }
  return Array.from(input)
    .map((ch) => map.get(ch) ?? ch)
    .join('');
}

function convertVniToUnicode(input: string): string {
  let out = input;
  const sorted = [...VNI_PAIRS].sort((a, b) => b[0].length - a[0].length);
  for (const [vni, uni] of sorted) {
    out = out.split(vni).join(uni);
  }
  return out;
}

function detectVietnameseEncoding(text: string): 'tcvn3' | 'vni' | 'unicode' {
  let tcvnHits = 0;
  for (const ch of text) {
    if ('µ¶·¸¹¨»¼½¾Æ©ÇÈÉÊË®ÌÎÏÐÑªÒÓÔÕÖ'.includes(ch)) tcvnHits++;
  }
  let vniHits = 0;
  for (const [vni] of VNI_PAIRS) {
    if (vni.length === 2 && text.includes(vni)) vniHits += 2;
  }
  if (tcvnHits > vniHits && tcvnHits >= 2) return 'tcvn3';
  if (vniHits >= 2) return 'vni';
  return 'unicode';
}

// ============================================================================
// 3. SO SÁNH 2 VĂN BẢN (WORD-LEVEL LCS DIFF)
// ============================================================================
interface DiffToken {
  type: 'same' | 'added' | 'removed';
  text: string;
}

function computeWordDiff(oldText: string, newText: string): DiffToken[] {
  const a = oldText.split(/(\s+)/).filter((s) => s.length > 0);
  const b = newText.split(/(\s+)/).filter((s) => s.length > 0);
  if (a.length * b.length > 400000) {
    // Fallback theo dòng nếu văn bản quá lớn
    const linesA = oldText.split('\n');
    const linesB = newText.split('\n');
    const setA = new Set(linesA);
    const setB = new Set(linesB);
    const out: DiffToken[] = [];
    for (const l of linesA) {
      if (!setB.has(l)) out.push({ type: 'removed', text: l + '\n' });
    }
    for (const l of linesB) {
      out.push({ type: setA.has(l) ? 'same' : 'added', text: l + '\n' });
    }
    return out;
  }

  const m = a.length;
  const n = b.length;
  const dp: Uint16Array[] = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const result: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      result.push({ type: 'same', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'removed', text: a[i] });
      i++;
    } else {
      result.push({ type: 'added', text: b[j] });
      j++;
    }
  }
  while (i < m) result.push({ type: 'removed', text: a[i++] });
  while (j < n) result.push({ type: 'added', text: b[j++] });
  return result;
}

// ============================================================================
// COMPONENT NÚT COPY NHANH
// ============================================================================
const CopyButton: React.FC<{ value: string; label?: string }> = ({
  value,
  label = 'Sao chép',
}) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      disabled={!value}
      onClick={async () => {
        if (!value) return;
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className="btn btn-secondary btn-sm"
      style={{ flexShrink: 0 }}
    >
      {copied ? <Check size={14} color="var(--accent-emerald)" /> : <Copy size={14} />}
      <span>{copied ? 'Đã chép' : label}</span>
    </button>
  );
};

// ============================================================================
// COMPONENT CHÍNH
// ============================================================================
export const VietnameseTextTools: React.FC<{ toolId: VnTextToolId }> = ({ toolId }) => {
  // 1. State Đọc số tiền
  const [amountInput, setAmountInput] = useState('125450000');
  const [currencyUnit, setCurrencyUnit] = useState<'VND' | 'USD'>('VND');

  // 2. State Chuyển mã TCVN3/VNI
  const [fontInput, setFontInput] = useState('');
  const [fontMode, setFontMode] = useState<'auto-to-uni' | 'tcvn3-to-uni' | 'vni-to-uni' | 'uni-to-tcvn3'>('auto-to-uni');

  // 3. State Chuẩn hóa chữ Hoa/Thường & Bỏ dấu
  const [caseInput, setCaseInput] = useState('nguyễn   văn   an — chuyên viên văn phòng');

  // 4. State So sánh văn bản
  const [diffOld, setDiffOld] = useState(
    'Căn cứ Kế hoạch số 12/KH-UBND ngày 10/01/2025 về triển khai nhiệm vụ quý I.'
  );
  const [diffNew, setDiffNew] = useState(
    'Căn cứ Kế hoạch số 15/KH-UBND ngày 18/02/2026 về triển khai nhiệm vụ trọng tâm quý I và quý II.'
  );

  // 5. State Đếm từ
  const [counterInput, setCounterInput] = useState('');

  // 6. State Tìm & Thay thế hàng loạt
  const [batchText, setBatchText] = useState('');
  const [replaceRules, setReplaceRules] = useState<{ id: string; find: string; replace: string }[]>([
    { id: '1', find: '2025', replace: '2026' },
    { id: '2', find: '', replace: '' },
  ]);

  // 7. State Trích xuất Email, SĐT, CCCD, URL từ văn bản hỗn hợp
  const [extractInput, setExtractInput] = useState(
    [
      '1. Ông Nguyễn Văn An - CCCD: 079090001234 - SĐT: 0901.234.567 - Email: an.nv@donvi.gov.vn',
      '2. Bà Trần Thị Bình - CCCD: 001192005678 - ĐT liên hệ: +84 988 765 432 - Email: binh.tt@cskh.vn',
      'Tài liệu tham khảo tại: https://dichvucong.gov.vn và https://chinhphu.vn',
    ].join('\n')
  );

  // Tính toán cho Đọc số tiền
  const cleanDigits = useMemo(() => amountInput.replace(/\D/g, ''), [amountInput]);
  const formattedNumber = useMemo(() => {
    if (!cleanDigits) return '0';
    return cleanDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }, [cleanDigits]);

  const vnWordsStandard = useMemo(() => {
    if (!cleanDigits) return '';
    const base = numberToVietnameseWords(cleanDigits);
    const suffix = currencyUnit === 'VND' ? 'đồng chẵn.' : 'đô la Mỹ.';
    return `${base} ${suffix}`;
  }, [cleanDigits, currencyUnit]);

  const enWordsStandard = useMemo(() => {
    if (!cleanDigits) return '';
    const base = numberToEnglishWords(cleanDigits);
    const suffix = currencyUnit === 'VND' ? 'Vietnamese dong only.' : 'US dollars only.';
    return `${base} ${suffix}`;
  }, [cleanDigits, currencyUnit]);

  // Tính toán cho Chuyển mã
  const detectedEnc = useMemo(() => detectVietnameseEncoding(fontInput), [fontInput]);
  const convertedFontText = useMemo(() => {
    if (!fontInput) return '';
    if (fontMode === 'uni-to-tcvn3') return convertUnicodeToTcvn3(fontInput);
    if (fontMode === 'tcvn3-to-uni') return convertTcvn3ToUnicode(fontInput);
    if (fontMode === 'vni-to-uni') return convertVniToUnicode(fontInput);
    if (detectedEnc === 'tcvn3') return convertTcvn3ToUnicode(fontInput);
    if (detectedEnc === 'vni') return convertVniToUnicode(fontInput);
    return convertTcvn3ToUnicode(convertVniToUnicode(fontInput));
  }, [fontInput, fontMode, detectedEnc]);

  // Tính toán cho Chuẩn hóa chữ
  const caseVariants = useMemo(() => {
    const trimmed = caseInput.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    const titleCase = trimmed
      .toLowerCase()
      .replace(/(^|\s|\(|-)\S/g, (m) => m.toUpperCase());
    const upperCase = trimmed.toUpperCase();
    const lowerCase = trimmed.toLowerCase();
    const sentenceCase = trimmed
      .toLowerCase()
      .replace(/(^\s*\w|[.!?]\s+\w)/g, (m) => m.toUpperCase());
    const noAccent = trimmed
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D');
    const slug = noAccent
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return [
      { label: 'Chuẩn hóa Họ Tên / Tiêu đề', value: titleCase },
      { label: 'IN HOA TOÀN BỘ', value: upperCase },
      { label: 'Viết hoa đầu câu & dọn khoảng trắng', value: sentenceCase },
      { label: 'chữ thường toàn bộ', value: lowerCase },
      { label: 'Bỏ dấu Tiếng Việt', value: noAccent },
      { label: 'Đường dẫn Slug (URL / Tên file)', value: slug },
    ];
  }, [caseInput]);

  // Tính toán cho So sánh văn bản
  const diffTokens = useMemo(() => computeWordDiff(diffOld, diffNew), [diffOld, diffNew]);
  const diffStats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const tk of diffTokens) {
      if (!tk.text.trim()) continue;
      if (tk.type === 'added') added++;
      if (tk.type === 'removed') removed++;
    }
    return { added, removed };
  }, [diffTokens]);

  // Tính toán cho Đếm từ
  const wordStats = useMemo(() => {
    const text = counterInput;
    const charsWithSpaces = text.length;
    const charsNoSpaces = text.replace(/\s/g, '').length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const sentences = text.trim()
      ? text.split(/[.!?…]+/).filter((s) => s.trim().length > 0).length
      : 0;
    const paragraphs = text.trim()
      ? text.split(/\n+/).filter((p) => p.trim().length > 0).length
      : 0;
    const lines = text ? text.split('\n').length : 0;
    const speakMinutes = Math.ceil((words / 130) * 60);
    const readMinutes = Math.ceil((words / 220) * 60);
    return {
      words,
      charsWithSpaces,
      charsNoSpaces,
      sentences,
      paragraphs,
      lines,
      speakMinutes,
      readMinutes,
    };
  }, [counterInput]);

  // Tính toán cho Tìm & Thay thế hàng loạt
  const batchReplacedText = useMemo(() => {
    let out = batchText;
    for (const r of replaceRules) {
      if (!r.find) continue;
      out = out.split(r.find).join(r.replace);
    }
    return out;
  }, [batchText, replaceRules]);

  // Tính toán cho Trích xuất dữ liệu
  const extractedData = useMemo(() => {
    const emails = Array.from(
      new Set(
        (extractInput.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? []).map((s) =>
          s.toLowerCase()
        )
      )
    );

    const rawPhones =
      extractInput.match(/(?:\+?84|0)(?:[\s.-]*\d){9}\b/g) ?? [];
    const phones = Array.from(
      new Set(
        rawPhones
          .map((p) => p.replace(/[\s.-]/g, '').replace(/^\+?84/, '0'))
          .filter((p) => /^0[235789]\d{8}$/.test(p))
      )
    );

    const cccds = Array.from(
      new Set(extractInput.match(/\b0\d{11}\b/g) ?? [])
    );

    const urls = Array.from(
      new Set(
        (extractInput.match(/https?:\/\/[^\s"'<>)\]]+/gi) ?? []).map((u) =>
          u.replace(/[.,;]+$/, '')
        )
      )
    );

    return { emails, phones, cccds, urls };
  }, [extractInput]);

  return (
    <HubShell>
      <ToolPageHeader toolId={toolId} />

      {/* ==================== 1. ĐỌC SỐ TIỀN THÀNH CHỮ ==================== */}
      {toolId === 'number-to-words' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '20px',
            alignItems: 'start',
          }}
        >
          <div className="bento-card" style={{ padding: '22px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <label style={{ fontSize: '0.86rem', fontWeight: 700 }}>
                Nhập số tiền (tự động lọc bỏ dấu chấm, phẩy, ký hiệu tiền tệ):
              </label>
              <button
                type="button"
                onClick={async () => {
                  const t = await navigator.clipboard.readText().catch(() => '');
                  if (t) setAmountInput(t);
                }}
                className="btn btn-secondary btn-sm"
              >
                <ClipboardPaste size={14} />
                <span>Dán số</span>
              </button>
            </div>

            <input
              type="text"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="Ví dụ: 125.450.000"
              className="input-field"
              style={{ fontSize: '1.35rem', fontWeight: 800, padding: '12px 14px' }}
            />

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '14px',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                Định dạng chuẩn: {formattedNumber} {currencyUnit === 'VND' ? '₫' : 'USD'}
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setCurrencyUnit('VND')}
                  className={`hub-pill ${currencyUnit === 'VND' ? 'is-active' : ''}`}
                  style={{ cursor: 'pointer' }}
                >
                  VNĐ (Đồng)
                </button>
                <button
                  type="button"
                  onClick={() => setCurrencyUnit('USD')}
                  className={`hub-pill ${currencyUnit === 'USD' ? 'is-active' : ''}`}
                  style={{ cursor: 'pointer' }}
                >
                  USD (Đô la Mỹ)
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '14px' }}>
              {['5000000', '25600000', '150000000', '1250000000'].map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => setAmountInput(sample)}
                  className="btn btn-ghost btn-sm"
                  style={{ border: '1px solid var(--border-subtle)', fontSize: '0.76rem' }}
                >
                  {sample.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                </button>
              ))}
            </div>
          </div>

          <div className="bento-card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {[
              { label: 'Chuẩn văn bản / Hợp đồng / Chứng từ', value: vnWordsStandard },
              {
                label: 'Kèm chữ "Bằng chữ:" để dán thẳng vào Word/Excel',
                value: vnWordsStandard
                  ? `Bằng chữ: ${vnWordsStandard}`
                  : '',
              },
              { label: 'IN HOA TOÀN BỘ', value: vnWordsStandard.toUpperCase() },
              { label: 'Tiếng Anh (Chứng từ song ngữ)', value: enWordsStandard },
            ].map((row) => (
              <div
                key={row.label}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginBottom: '3px' }}>
                    {row.label}
                  </div>
                  <div style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-main)' }}>
                    {row.value || '—'}
                  </div>
                </div>
                <CopyButton value={row.value} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== 2. CHUYỂN MÃ TCVN3 / VNI <-> UNICODE ==================== */}
      {toolId === 'vn-font-converter' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '20px',
          }}
        >
          <div className="bento-card" style={{ padding: '22px 24px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                marginBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { id: 'auto-to-uni', label: 'Tự nhận diện → Unicode' },
                  { id: 'tcvn3-to-uni', label: 'TCVN3 (.VnTime) → Unicode' },
                  { id: 'vni-to-uni', label: 'VNI Windows → Unicode' },
                  { id: 'uni-to-tcvn3', label: 'Unicode → TCVN3' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setFontMode(m.id as typeof fontMode)}
                    className={`hub-pill ${fontMode === m.id ? 'is-active' : ''}`}
                    style={{ cursor: 'pointer', fontSize: '0.78rem' }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              rows={9}
              value={fontInput}
              onChange={(e) => setFontInput(e.target.value)}
              placeholder="Dán đoạn văn bản bị lỗi font (.VnTime, VNI-Times...) vào đây để chuyển sang Unicode chuẩn tức thì..."
              className="input-field"
              style={{ fontSize: '0.95rem', lineHeight: 1.55 }}
            />
            <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)', marginTop: '6px' }}>
              Nhận diện tự động:{' '}
              <strong>
                {detectedEnc === 'tcvn3'
                  ? 'Bảng mã TCVN3 (ABC)'
                  : detectedEnc === 'vni'
                    ? 'Bảng mã VNI Windows'
                    : 'Unicode'}
              </strong>
            </div>
          </div>

          <div className="bento-card" style={{ padding: '22px 24px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                Kết quả đã chuyển mã
              </span>
              <CopyButton value={convertedFontText} label="Sao chép kết quả" />
            </div>
            <textarea
              readOnly
              rows={9}
              value={convertedFontText}
              placeholder="Kết quả tiếng Việt chuẩn sẽ hiện tức thì tại đây..."
              className="input-field"
              style={{ fontSize: '0.95rem', lineHeight: 1.55 }}
            />
          </div>
        </div>
      )}

      {/* ==================== 3. CHUẨN HÓA CHỮ HOA/THƯỜNG & BỎ DẤU ==================== */}
      {toolId === 'text-case-accent' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '20px',
            alignItems: 'start',
          }}
        >
          <div className="bento-card" style={{ padding: '22px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <label style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                Nhập hoặc dán văn bản / danh sách Họ Tên:
              </label>
              <button
                type="button"
                onClick={() => setCaseInput('')}
                className="btn btn-ghost btn-sm"
              >
                Xóa trắng
              </button>
            </div>
            <textarea
              rows={10}
              value={caseInput}
              onChange={(e) => setCaseInput(e.target.value)}
              placeholder="Dán nội dung cần đổi chữ HOA/thường, chuẩn hóa tên hoặc bỏ dấu..."
              className="input-field"
              style={{ fontSize: '0.95rem', lineHeight: 1.55 }}
            />
          </div>

          <div className="bento-card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {caseVariants.map((item) => (
              <div
                key={item.label}
                style={{
                  padding: '11px 14px',
                  borderRadius: '10px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '0.73rem', color: 'var(--text-dim)', marginBottom: '3px' }}>
                    {item.label}
                  </div>
                  <div
                    style={{
                      fontSize: '0.92rem',
                      fontWeight: 600,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: '80px',
                      overflowY: 'auto',
                    }}
                  >
                    {item.value || '—'}
                  </div>
                </div>
                <CopyButton value={item.value} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== 4. SO SÁNH 2 VĂN BẢN ==================== */}
      {toolId === 'text-diff' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '18px',
            }}
          >
            <div className="bento-card" style={{ padding: '18px 20px' }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', marginBottom: '8px' }}>
                Văn bản gốc (Bản cũ)
              </label>
              <textarea
                rows={7}
                value={diffOld}
                onChange={(e) => setDiffOld(e.target.value)}
                className="input-field"
                placeholder="Dán bản thảo gốc..."
              />
            </div>

            <div className="bento-card" style={{ padding: '18px 20px' }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', marginBottom: '8px' }}>
                Văn bản đã sửa (Bản mới)
              </label>
              <textarea
                rows={7}
                value={diffNew}
                onChange={(e) => setDiffNew(e.target.value)}
                className="input-field"
                placeholder="Dán bản thảo mới..."
              />
            </div>
          </div>

          <div className="bento-card" style={{ padding: '20px 24px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
                marginBottom: '12px',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                Kết quả đối chiếu từng từ
              </span>
              <div style={{ display: 'flex', gap: '12px', fontSize: '0.82rem', fontWeight: 600 }}>
                <span style={{ color: '#10b981' }}>+ Thêm mới: {diffStats.added} từ</span>
                <span style={{ color: '#f43f5e' }}>− Đã xóa: {diffStats.removed} từ</span>
              </div>
            </div>

            <div
              style={{
                padding: '16px',
                borderRadius: '10px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                lineHeight: 1.75,
                fontSize: '0.96rem',
                whiteSpace: 'pre-wrap',
              }}
            >
              {diffTokens.map((tk, idx) => {
                if (tk.type === 'added') {
                  return (
                    <span
                      key={idx}
                      style={{
                        background: 'rgba(16, 185, 129, 0.22)',
                        color: '#10b981',
                        fontWeight: 700,
                        padding: '1px 3px',
                        borderRadius: '4px',
                      }}
                    >
                      {tk.text}
                    </span>
                  );
                }
                if (tk.type === 'removed') {
                  return (
                    <span
                      key={idx}
                      style={{
                        background: 'rgba(244, 63, 94, 0.2)',
                        color: '#f43f5e',
                        textDecoration: 'line-through',
                        padding: '1px 3px',
                        borderRadius: '4px',
                      }}
                    >
                      {tk.text}
                    </span>
                  );
                }
                return <span key={idx}>{tk.text}</span>;
              })}
            </div>
          </div>
        </div>
      )}

      {/* ==================== 5. ĐẾM TỪ & THỐNG KÊ VĂN BẢN ==================== */}
      {toolId === 'word-counter' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '20px',
            alignItems: 'start',
          }}
        >
          <div className="bento-card" style={{ padding: '22px 24px' }}>
            <textarea
              rows={11}
              value={counterInput}
              onChange={(e) => setCounterInput(e.target.value)}
              placeholder="Dán bài phát biểu, báo cáo hoặc văn bản vào đây để thống kê tức thì..."
              className="input-field"
              style={{ fontSize: '0.95rem', lineHeight: 1.6 }}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '12px',
            }}
          >
            {[
              { label: 'Tổng số từ', value: wordStats.words, accent: '#06b6d4' },
              { label: 'Tổng số ký tự', value: wordStats.charsWithSpaces, accent: '#8b5cf6' },
              { label: 'Ký tự (không khoảng trắng)', value: wordStats.charsNoSpaces, accent: '#10b981' },
              { label: 'Số câu', value: wordStats.sentences, accent: '#f59e0b' },
              { label: 'Số đoạn văn', value: wordStats.paragraphs, accent: '#3b82f6' },
              { label: 'Số dòng', value: wordStats.lines, accent: '#ec4899' },
              {
                label: 'Thời gian đọc phát biểu (130 từ/phút)',
                value: `${Math.floor(wordStats.speakMinutes / 60)}p ${wordStats.speakMinutes % 60}s`,
                accent: '#14b8a6',
              },
              {
                label: 'Thời gian đọc thầm (220 từ/phút)',
                value: `${Math.floor(wordStats.readMinutes / 60)}p ${wordStats.readMinutes % 60}s`,
                accent: '#6366f1',
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bento-card"
                style={{
                  padding: '16px 18px',
                  borderTop: `3px solid ${stat.accent}`,
                }}
              >
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  {stat.label}
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: stat.accent }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== 6. TÌM & THAY THẾ HÀNG LOẠT ==================== */}
      {toolId === 'find-replace-batch' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '20px',
            alignItems: 'start',
          }}
        >
          <div className="bento-card" style={{ padding: '22px 24px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                Danh sách cụm từ cần thay thế ({replaceRules.length})
              </span>
              <button
                type="button"
                onClick={() =>
                  setReplaceRules((prev) => [
                    ...prev,
                    { id: `${Date.now()}`, find: '', replace: '' },
                  ])
                }
                className="btn btn-secondary btn-sm"
              >
                <Plus size={14} />
                <span>Thêm cặp</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {replaceRules.map((rule, idx) => (
                <div key={rule.id} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={rule.find}
                    onChange={(e) => {
                      const v = e.target.value;
                      setReplaceRules((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, find: v } : r))
                      );
                    }}
                    placeholder="Tìm cụm từ..."
                    className="input-field"
                  />
                  <span style={{ color: 'var(--text-dim)' }}>→</span>
                  <input
                    type="text"
                    value={rule.replace}
                    onChange={(e) => {
                      const v = e.target.value;
                      setReplaceRules((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, replace: v } : r))
                      );
                    }}
                    placeholder="Thay bằng..."
                    className="input-field"
                  />
                  {replaceRules.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setReplaceRules((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '6px' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', marginBottom: '6px' }}>
              Văn bản gốc:
            </label>
            <textarea
              rows={7}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              placeholder="Dán văn bản cần thay thế hàng loạt..."
              className="input-field"
            />
          </div>

          <div className="bento-card" style={{ padding: '22px 24px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                Kết quả sau khi thay thế
              </span>
              <CopyButton value={batchReplacedText} label="Sao chép kết quả" />
            </div>
            <textarea
              readOnly
              rows={12}
              value={batchReplacedText}
              placeholder="Kết quả thay thế hiển thị tức thì tại đây..."
              className="input-field"
            />
          </div>
        </div>
      )}

      {/* ==================== 7. TRÍCH XUẤT EMAIL, SĐT, CCCD & URL ==================== */}
      {toolId === 'text-extractor' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="bento-card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                Dán văn bản hỗn hợp, danh sách thô, nội dung email hoặc bảng biểu:
              </label>
              <button
                type="button"
                onClick={() => setExtractInput('')}
                className="btn btn-ghost btn-sm"
              >
                Xóa trắng
              </button>
            </div>
            <textarea
              rows={6}
              value={extractInput}
              onChange={(e) => setExtractInput(e.target.value)}
              placeholder="Dán nội dung bất kỳ vào đây — công cụ sẽ tự lọc riêng Email, Số điện thoại, Số CCCD 12 số và Đường dẫn..."
              className="input-field"
              style={{ fontSize: '0.93rem', lineHeight: 1.55 }}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '16px',
            }}
          >
            {[
              {
                label: `Số điện thoại VN (${extractedData.phones.length})`,
                items: extractedData.phones,
                accent: '#10b981',
              },
              {
                label: `Địa chỉ Email (${extractedData.emails.length})`,
                items: extractedData.emails,
                accent: '#06b6d4',
              },
              {
                label: `Số CCCD 12 số (${extractedData.cccds.length})`,
                items: extractedData.cccds,
                accent: '#8b5cf6',
              },
              {
                label: `Đường dẫn URL (${extractedData.urls.length})`,
                items: extractedData.urls,
                accent: '#f59e0b',
              },
            ].map((group) => (
              <div
                key={group.label}
                className="bento-card"
                style={{ padding: '16px 18px', borderTop: `3px solid ${group.accent}` }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '10px',
                    gap: '8px',
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: '0.86rem' }}>{group.label}</span>
                  <CopyButton value={group.items.join('\n')} label="Copy cột" />
                </div>
                <textarea
                  readOnly
                  rows={7}
                  value={group.items.join('\n')}
                  placeholder="Chưa tìm thấy dữ liệu..."
                  className="input-field"
                  style={{ fontFamily: 'monospace', fontSize: '0.86rem' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </HubShell>
  );
};

export default VietnameseTextTools;
