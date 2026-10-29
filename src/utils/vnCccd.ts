/**
 * Giải mã & Kiểm tra cấu trúc số Căn cước / CCCD 12 chữ số Việt Nam
 *
 * Cấu trúc 12 chữ số:
 * - 3 chữ số đầu (001–096): Mã tỉnh/thành phố trực thuộc trung ương nơi đăng ký khai sinh
 * - 1 chữ số kế tiếp (0–9): Mã thế kỷ sinh và giới tính
 *   + Thế kỷ 20 (1900–1999): Nam = 0, Nữ = 1
 *   + Thế kỷ 21 (2000–2099): Nam = 2, Nữ = 3
 *   + Thế kỷ 22 (2100–2199): Nam = 4, Nữ = 5
 *   + Thế kỷ 23 (2200–2299): Nam = 6, Nữ = 7
 *   + Thế kỷ 24 (2300–2399): Nam = 8, Nữ = 9
 * - 2 chữ số tiếp theo (00–99): 2 số cuối năm sinh
 * - 6 chữ số cuối (000001–999999): Số ngẫu nhiên định danh
 */

export const VN_PROVINCE_CODES: Record<string, string> = {
  '001': 'Thành phố Hà Nội',
  '002': 'Tỉnh Hà Giang',
  '004': 'Tỉnh Cao Bằng',
  '006': 'Tỉnh Bắc Kạn',
  '008': 'Tỉnh Tuyên Quang',
  '010': 'Tỉnh Lào Cai',
  '011': 'Tỉnh Điện Biên',
  '012': 'Tỉnh Lai Châu',
  '014': 'Tỉnh Sơn La',
  '015': 'Tỉnh Yên Bái',
  '017': 'Tỉnh Hòa Bình',
  '019': 'Tỉnh Thái Nguyên',
  '020': 'Tỉnh Lạng Sơn',
  '022': 'Tỉnh Quảng Ninh',
  '024': 'Tỉnh Bắc Giang',
  '025': 'Tỉnh Phú Thọ',
  '026': 'Tỉnh Vĩnh Phúc',
  '027': 'Tỉnh Bắc Ninh',
  '030': 'Tỉnh Hải Dương',
  '031': 'Thành phố Hải Phòng',
  '033': 'Tỉnh Hưng Yên',
  '034': 'Tỉnh Thái Bình',
  '035': 'Tỉnh Hà Nam',
  '036': 'Tỉnh Nam Định',
  '037': 'Tỉnh Ninh Bình',
  '038': 'Tỉnh Thanh Hóa',
  '040': 'Tỉnh Nghệ An',
  '042': 'Tỉnh Hà Tĩnh',
  '044': 'Tỉnh Quảng Bình',
  '045': 'Tỉnh Quảng Trị',
  '046': 'Thành phố Huế',
  '048': 'Thành phố Đà Nẵng',
  '049': 'Tỉnh Quảng Nam',
  '051': 'Tỉnh Quảng Ngãi',
  '052': 'Tỉnh Bình Định',
  '054': 'Tỉnh Phú Yên',
  '056': 'Tỉnh Khánh Hòa',
  '058': 'Tỉnh Ninh Thuận',
  '060': 'Tỉnh Bình Thuận',
  '062': 'Tỉnh Kon Tum',
  '064': 'Tỉnh Gia Lai',
  '066': 'Tỉnh Đắk Lắk',
  '067': 'Tỉnh Đắk Nông',
  '068': 'Tỉnh Lâm Đồng',
  '070': 'Tỉnh Bình Phước',
  '072': 'Tỉnh Tây Ninh',
  '074': 'Tỉnh Bình Dương',
  '075': 'Tỉnh Đồng Nai',
  '077': 'Tỉnh Bà Rịa - Vũng Tàu',
  '079': 'Thành phố Hồ Chí Minh',
  '080': 'Tỉnh Long An',
  '082': 'Tỉnh Tiền Giang',
  '083': 'Tỉnh Bến Tre',
  '084': 'Tỉnh Trà Vinh',
  '086': 'Tỉnh Vĩnh Long',
  '087': 'Tỉnh Đồng Tháp',
  '089': 'Tỉnh An Giang',
  '091': 'Tỉnh Kiên Giang',
  '092': 'Thành phố Cần Thơ',
  '093': 'Tỉnh Hậu Giang',
  '094': 'Tỉnh Sóc Trăng',
  '095': 'Tỉnh Bạc Liêu',
  '096': 'Tỉnh Cà Mau',
};

export interface DecodedCccd {
  rawInput: string;
  normalizedCode: string;
  isValid: boolean;
  wasZeroPadded: boolean;
  errorReason?: string;
  provinceCode: string;
  provinceName: string;
  genderCenturyDigit: number;
  gender: 'Nam' | 'Nữ' | 'Không rõ';
  century: number;
  birthYear: number;
  age: number;
  randomSerial: string;
}

export function decodeVnCccd(
  raw: string,
  options: { autoPadLeadingZero?: boolean; currentYear?: number } = {}
): DecodedCccd {
  const { autoPadLeadingZero = true, currentYear = new Date().getFullYear() } = options;
  const trimmed = raw.trim().replace(/^'+/, '');
  const digitsOnly = trimmed.replace(/\s+/g, '');

  let normalized = digitsOnly;
  let wasZeroPadded = false;

  if (/^\d{11}$/.test(digitsOnly) && autoPadLeadingZero) {
    const candidate = `0${digitsOnly}`;
    if (VN_PROVINCE_CODES[candidate.slice(0, 3)]) {
      normalized = candidate;
      wasZeroPadded = true;
    }
  }

  if (!/^\d+$/.test(normalized)) {
    return {
      rawInput: raw,
      normalizedCode: normalized,
      isValid: false,
      wasZeroPadded: false,
      errorReason: 'Chứa ký tự không phải chữ số',
      provinceCode: '',
      provinceName: '',
      genderCenturyDigit: -1,
      gender: 'Không rõ',
      century: 0,
      birthYear: 0,
      age: 0,
      randomSerial: '',
    };
  }

  if (normalized.length !== 12) {
    return {
      rawInput: raw,
      normalizedCode: normalized,
      isValid: false,
      wasZeroPadded: false,
      errorReason: `Độ dài ${normalized.length} số (chuẩn phải đủ 12 số)`,
      provinceCode: '',
      provinceName: '',
      genderCenturyDigit: -1,
      gender: 'Không rõ',
      century: 0,
      birthYear: 0,
      age: 0,
      randomSerial: '',
    };
  }

  const provinceCode = normalized.slice(0, 3);
  const provinceName =
    VN_PROVINCE_CODES[provinceCode] ??
    (Number(provinceCode) >= 100
      ? `Đăng ký khai sinh tại nước ngoài (Mã ${provinceCode})`
      : '');

  const genderCenturyDigit = Number(normalized[3]);
  const yearTwoDigits = Number(normalized.slice(4, 6));
  const randomSerial = normalized.slice(6, 12);

  const centuryIndex = Math.floor(genderCenturyDigit / 2); // 0 -> thế kỷ 20 (1900), 1 -> thế kỷ 21 (2000)...
  const century = 20 + centuryIndex;
  const baseYear = 1900 + centuryIndex * 100;
  const birthYear = baseYear + yearTwoDigits;
  const gender: 'Nam' | 'Nữ' = genderCenturyDigit % 2 === 0 ? 'Nam' : 'Nữ';
  const age = Math.max(0, currentYear - birthYear);

  if (!provinceName) {
    return {
      rawInput: raw,
      normalizedCode: normalized,
      isValid: false,
      wasZeroPadded,
      errorReason: `Mã tỉnh/thành "${provinceCode}" không tồn tại`,
      provinceCode,
      provinceName: 'Không hợp lệ',
      genderCenturyDigit,
      gender,
      century,
      birthYear,
      age,
      randomSerial,
    };
  }

  if (century > 21 || birthYear > currentYear + 1) {
    return {
      rawInput: raw,
      normalizedCode: normalized,
      isValid: false,
      wasZeroPadded,
      errorReason: `Năm sinh giải mã (${birthYear}) vượt quá năm hiện tại`,
      provinceCode,
      provinceName,
      genderCenturyDigit,
      gender,
      century,
      birthYear,
      age,
      randomSerial,
    };
  }

  return {
    rawInput: raw,
    normalizedCode: normalized,
    isValid: true,
    wasZeroPadded,
    provinceCode,
    provinceName,
    genderCenturyDigit,
    gender,
    century,
    birthYear,
    age,
    randomSerial,
  };
}
