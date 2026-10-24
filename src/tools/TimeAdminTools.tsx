import React, { useMemo, useState } from 'react';
import { Check, Copy, RefreshCw } from 'lucide-react';
import { HubShell } from '../hub/HubShell';
import { ToolPageHeader } from './ToolPageHeader';

export type TimeAdminToolId =
  | 'workday-calculator'
  | 'lunar-solar-calendar'
  | 'password-generator'
  | 'seniority-age-calculator';

function toIsoDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatVnDateFull(d: Date): string {
  return d.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// Ngày lễ Dương lịch cố định hàng năm tại Việt Nam (Tết Dương lịch, 30/4, 1/5, Quốc khánh 2/9)
const FIXED_SOLAR_HOLIDAYS = new Set(['01-01', '04-30', '05-01', '09-02']);

function isFixedHoliday(d: Date): boolean {
  const key = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return FIXED_SOLAR_HOLIDAYS.has(key);
}

// ============================================================================
// 1. TÍNH NGÀY LÀM VIỆC & HẠN XỬ LÝ VĂN BẢN
// ============================================================================
const WorkdayCalculatorView: React.FC = () => {
  const todayIso = useMemo(() => toIsoDateString(new Date()), []);
  const [startDateStr, setStartDateStr] = useState(todayIso);
  const [workdaysToAdd, setWorkdaysToAdd] = useState(5);
  const [includeSaturday, setIncludeSaturday] = useState(false);

  const [rangeStartStr, setRangeStartStr] = useState(todayIso);
  const [rangeEndStr, setRangeEndStr] = useState(todayIso);

  const deadlineResult = useMemo(() => {
    const start = new Date(`${startDateStr}T00:00:00`);
    if (Number.isNaN(start.getTime())) return null;
    const cur = new Date(start);
    let remaining = Math.max(0, Math.min(3650, workdaysToAdd));
    let skippedWeekends = 0;
    let skippedHolidays = 0;

    while (remaining > 0) {
      cur.setDate(cur.getDate() + 1);
      const dow = cur.getDay();
      const isWeekend = dow === 0 || (!includeSaturday && dow === 6);
      if (isWeekend) {
        skippedWeekends++;
        continue;
      }
      if (isFixedHoliday(cur)) {
        skippedHolidays++;
        continue;
      }
      remaining--;
    }

    return {
      dueDate: cur,
      skippedWeekends,
      skippedHolidays,
    };
  }, [startDateStr, workdaysToAdd, includeSaturday]);

  const rangeStats = useMemo(() => {
    const d1 = new Date(`${rangeStartStr}T00:00:00`);
    const d2 = new Date(`${rangeEndStr}T00:00:00`);
    if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime()) || d2 < d1) return null;

    let totalDays = 0;
    let workdays = 0;
    let weekendDays = 0;
    let holidays = 0;
    const cur = new Date(d1);

    while (cur <= d2 && totalDays < 3660) {
      totalDays++;
      const dow = cur.getDay();
      const isWeekend = dow === 0 || (!includeSaturday && dow === 6);
      if (isWeekend) weekendDays++;
      else if (isFixedHoliday(cur)) holidays++;
      else workdays++;
      cur.setDate(cur.getDate() + 1);
    }

    return { totalDays, workdays, weekendDays, holidays };
  }, [rangeStartStr, rangeEndStr, includeSaturday]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '20px',
        alignItems: 'start',
      }}
    >
      {/* Khối 1: Tính hạn giải quyết văn bản */}
      <div className="bento-card" style={{ padding: '22px 24px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '14px' }}>
          Tính hạn giải quyết hồ sơ / văn bản
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '4px' }}>
              Ngày tiếp nhận / bắt đầu:
            </label>
            <input
              type="date"
              value={startDateStr}
              onChange={(e) => setStartDateStr(e.target.value)}
              className="input-field"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '4px' }}>
              Thời hạn xử lý (số ngày làm việc):
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={workdaysToAdd}
              onChange={(e) => setWorkdaysToAdd(Math.max(0, Number(e.target.value)))}
              className="input-field"
            />
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
              {[3, 5, 7, 10, 15, 20, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setWorkdaysToAdd(d)}
                  className={`hub-pill ${workdaysToAdd === d ? 'is-active' : ''}`}
                  style={{ cursor: 'pointer', fontSize: '0.76rem', padding: '4px 10px' }}
                >
                  {d} ngày
                </button>
              ))}
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeSaturday}
              onChange={(e) => setIncludeSaturday(e.target.checked)}
            />
            <span>Tính cả ngày Thứ Bảy là ngày làm việc</span>
          </label>
        </div>

        {deadlineResult && (
          <div
            style={{
              marginTop: '18px',
              padding: '16px',
              borderRadius: '12px',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Ngày đến hạn trả kết quả:
            </div>
            <div
              style={{
                fontSize: '1.3rem',
                fontWeight: 800,
                color: 'var(--accent-emerald)',
                marginTop: '4px',
              }}
            >
              {formatVnDateFull(deadlineResult.dueDate)}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '6px' }}>
              Đã trừ {deadlineResult.skippedWeekends} ngày cuối tuần
              {deadlineResult.skippedHolidays > 0
                ? ` và ${deadlineResult.skippedHolidays} ngày lễ cố định`
                : ''}
              .
            </div>
          </div>
        )}
      </div>

      {/* Khối 2: Đếm số ngày làm việc giữa 2 ngày */}
      <div className="bento-card" style={{ padding: '22px 24px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '14px' }}>
          Đếm số ngày làm việc giữa 2 mốc thời gian
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '4px' }}>
              Từ ngày:
            </label>
            <input
              type="date"
              value={rangeStartStr}
              onChange={(e) => setRangeStartStr(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '4px' }}>
              Đến ngày (bao gồm cả ngày cuối):
            </label>
            <input
              type="date"
              value={rangeEndStr}
              onChange={(e) => setRangeEndStr(e.target.value)}
              className="input-field"
            />
          </div>
        </div>

        {rangeStats ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Ngày làm việc thực tế</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>
                {rangeStats.workdays} ngày
              </div>
            </div>
            <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Tổng số ngày lịch</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>
                {rangeStats.totalDays} ngày
              </div>
            </div>
            <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Ngày nghỉ cuối tuần</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f59e0b' }}>
                {rangeStats.weekendDays} ngày
              </div>
            </div>
            <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Ngày lễ Dương lịch</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f43f5e' }}>
                {rangeStats.holidays} ngày
              </div>
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--accent-rose)', fontSize: '0.86rem' }}>
            Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 2. TRA CỨU ÂM - DƯƠNG LỊCH & CAN CHI
// ============================================================================
const THIEN_CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'];
const DIA_CHI = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];

function getJulianDayNumber(d: number, m: number, y: number): number {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return (
    d +
    Math.floor((153 * mm + 2) / 5) +
    365 * yy +
    Math.floor(yy / 4) -
    Math.floor(yy / 100) +
    Math.floor(yy / 400) -
    32045
  );
}

function getLunarInfoFromSolar(date: Date) {
  const parts = new Intl.DateTimeFormat('en-u-ca-chinese', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(date);

  const lunarDay = Number(parts.find((p) => p.type === 'day')?.value ?? 1);
  const rawMonth = parts.find((p) => p.type === 'month')?.value ?? '1';
  const isLeapMonth = rawMonth.includes('bis') || rawMonth.includes('leap');
  const lunarMonth = Number(rawMonth.replace(/\D/g, '')) || 1;
  const relatedYear = Number(
    parts.find((p) => (p.type as string) === 'relatedYear')?.value ?? date.getFullYear()
  );

  const yearCan = THIEN_CAN[(relatedYear + 6) % 10];
  const yearChi = DIA_CHI[(relatedYear + 8) % 12];

  const jdn = getJulianDayNumber(date.getDate(), date.getMonth() + 1, date.getFullYear());
  const dayCan = THIEN_CAN[(jdn + 9) % 10];
  const dayChi = DIA_CHI[(jdn + 1) % 12];

  return {
    lunarDay,
    lunarMonth,
    lunarYear: relatedYear,
    isLeapMonth,
    yearCanChi: `${yearCan} ${yearChi}`,
    dayCanChi: `${dayCan} ${dayChi}`,
  };
}

const LunarSolarCalendarView: React.FC = () => {
  const [solarStr, setSolarStr] = useState(() => toIsoDateString(new Date()));

  const info = useMemo(() => {
    const d = new Date(`${solarStr}T12:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return {
      solarDate: d,
      ...getLunarInfoFromSolar(d),
    };
  }, [solarStr]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '20px',
        alignItems: 'start',
      }}
    >
      <div className="bento-card" style={{ padding: '22px 24px' }}>
        <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: '8px' }}>
          Chọn ngày Dương lịch cần tra cứu:
        </label>
        <input
          type="date"
          value={solarStr}
          onChange={(e) => setSolarStr(e.target.value)}
          className="input-field"
          style={{ fontSize: '1.1rem', fontWeight: 700, padding: '10px 14px' }}
        />

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button
            type="button"
            onClick={() => setSolarStr(toIsoDateString(new Date()))}
            className="btn btn-secondary btn-sm"
          >
            Hôm nay
          </button>
        </div>
      </div>

      {info && (
        <div
          className="bento-card"
          style={{
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '14px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                padding: '18px',
                borderRadius: '12px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>DƯƠNG LỊCH</div>
              <div style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--accent-cyan)', margin: '4px 0' }}>
                {String(info.solarDate.getDate()).padStart(2, '0')}/
                {String(info.solarDate.getMonth() + 1).padStart(2, '0')}
              </div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                {formatVnDateFull(info.solarDate)}
              </div>
            </div>

            <div
              style={{
                padding: '18px',
                borderRadius: '12px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>ÂM LỊCH</div>
              <div style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--accent-emerald)', margin: '4px 0' }}>
                {String(info.lunarDay).padStart(2, '0')}/
                {String(info.lunarMonth).padStart(2, '0')}
              </div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                Năm {info.yearCanChi} ({info.lunarYear})
                {info.isLeapMonth ? ' • Tháng nhuận' : ''}
              </div>
            </div>
          </div>

          <div
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.9rem',
              display: 'flex',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <span>
              Ngày Can Chi: <strong>Ngày {info.dayCanChi}</strong>
            </span>
            <span>
              Năm Âm lịch: <strong>Năm {info.yearCanChi}</strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 3. TẠO MẬT KHẨU MẠNH & MÃ UUID V4
// ============================================================================
const PasswordGeneratorView: React.FC = () => {
  const [length, setLength] = useState(16);
  const [useUpper, setUseUpper] = useState(true);
  const [useLower, setUseLower] = useState(true);
  const [useDigits, setUseDigits] = useState(true);
  const [useSymbols, setUseSymbols] = useState(true);
  const [seed, setSeed] = useState(0);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const passwords = useMemo(() => {
    void seed;
    let chars = '';
    if (useUpper) chars += 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    if (useLower) chars += 'abcdefghijkmnopqrstuvwxyz';
    if (useDigits) chars += '23456789';
    if (useSymbols) chars += '!@#$%^&*_-+=';
    if (!chars) chars = 'abcdefghijkmnopqrstuvwxyz23456789';

    return Array.from({ length: 5 }, () => {
      const arr = new Uint32Array(length);
      crypto.getRandomValues(arr);
      return Array.from(arr, (n) => chars[n % chars.length]).join('');
    });
  }, [length, useUpper, useLower, useDigits, useSymbols, seed]);

  const uuids = useMemo(() => {
    void seed;
    return Array.from({ length: 5 }, () => crypto.randomUUID());
  }, [seed]);

  return (
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
            marginBottom: '14px',
          }}
        >
          <span style={{ fontWeight: 700 }}>Cấu hình mật khẩu ({length} ký tự)</span>
          <button
            type="button"
            onClick={() => setSeed((s) => s + 1)}
            className="btn btn-primary btn-sm"
          >
            <RefreshCw size={14} />
            <span>Tạo mới</span>
          </button>
        </div>

        <input
          type="range"
          min={8}
          max={48}
          value={length}
          onChange={(e) => setLength(Number(e.target.value))}
          style={{ width: '100%', marginBottom: '14px' }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '18px' }}>
          {[
            { label: 'Chữ HOA (A-Z)', checked: useUpper, set: setUseUpper },
            { label: 'Chữ thường (a-z)', checked: useLower, set: setUseLower },
            { label: 'Chữ số (2-9)', checked: useDigits, set: setUseDigits },
            { label: 'Ký tự đặc biệt (!@#$)', checked: useSymbols, set: setUseSymbols },
          ].map((opt) => (
            <label
              key={opt.label}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={opt.checked}
                onChange={(e) => opt.set(e.target.checked)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {passwords.map((pw, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                fontFamily: 'monospace',
                fontSize: '0.95rem',
              }}
            >
              <span style={{ wordBreak: 'break-all' }}>{pw}</span>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(pw);
                  setCopiedIdx(idx);
                  setTimeout(() => setCopiedIdx(null), 1500);
                }}
                className="btn btn-secondary btn-sm"
              >
                {copiedIdx === idx ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedIdx === idx ? 'Đã chép' : 'Copy'}</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="bento-card" style={{ padding: '22px 24px' }}>
        <h3 style={{ fontSize: '0.96rem', fontWeight: 700, marginBottom: '12px' }}>
          Mã định danh chuẩn UUID v4
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {uuids.map((id, idx) => {
            const cIdx = 100 + idx;
            return (
              <div
                key={id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  fontFamily: 'monospace',
                  fontSize: '0.88rem',
                }}
              >
                <span>{id}</span>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(id);
                    setCopiedIdx(cIdx);
                    setTimeout(() => setCopiedIdx(null), 1500);
                  }}
                  className="btn btn-secondary btn-sm"
                >
                  {copiedIdx === cIdx ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedIdx === cIdx ? 'Đã chép' : 'Copy'}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const TimeAdminTools: React.FC<{ toolId: TimeAdminToolId }> = ({ toolId }) => {
  return (
    <HubShell>
      <ToolPageHeader toolId={toolId} />
      {toolId === 'workday-calculator' && <WorkdayCalculatorView />}
      {toolId === 'lunar-solar-calendar' && <LunarSolarCalendarView />}
      {toolId === 'password-generator' && <PasswordGeneratorView />}
      {toolId === 'seniority-age-calculator' && <SeniorityAgeCalculatorView />}
    </HubShell>
  );
};

// ============================================================================
// 4. TÍNH TUỔI, THÂM NIÊN CÔNG TÁC & MỐC KỶ NIỆM TRÒN NĂM
// ============================================================================
const SeniorityAgeCalculatorView: React.FC = () => {
  const [fromDateStr, setFromDateStr] = useState('1995-05-19');
  const [toDateStr, setToDateStr] = useState(() => toIsoDateString(new Date()));

  const diff = useMemo(() => {
    const d1 = new Date(`${fromDateStr}T00:00:00`);
    const d2 = new Date(`${toDateStr}T00:00:00`);
    if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime()) || d2 < d1) return null;

    let years = d2.getFullYear() - d1.getFullYear();
    let months = d2.getMonth() - d1.getMonth();
    let days = d2.getDate() - d1.getDate();

    if (days < 0) {
      months--;
      const prevMonthLastDay = new Date(d2.getFullYear(), d2.getMonth(), 0).getDate();
      days += prevMonthLastDay;
    }
    if (months < 0) {
      years--;
      months += 12;
    }

    const totalDays = Math.round((d2.getTime() - d1.getTime()) / 86400000);
    const totalMonths = years * 12 + months;

    const milestones = [5, 10, 15, 20, 25, 30, 40, 50, 60].map((m) => {
      const mDate = new Date(d1);
      mDate.setFullYear(d1.getFullYear() + m);
      return {
        years: m,
        dateStr: formatVnDateFull(mDate),
        passed: mDate <= d2,
      };
    });

    return {
      years,
      months,
      days,
      totalDays,
      totalMonths,
      milestones,
    };
  }, [fromDateStr, toDateStr]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '20px',
        alignItems: 'start',
      }}
    >
      <div className="bento-card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 700, marginBottom: '6px' }}>
            Ngày gốc (Ngày sinh / Ngày tuyển dụng / Ngày vào ngành):
          </label>
          <input
            type="date"
            value={fromDateStr}
            onChange={(e) => setFromDateStr(e.target.value)}
            className="input-field"
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 700, marginBottom: '6px' }}>
            Tính đến ngày:
          </label>
          <input
            type="date"
            value={toDateStr}
            onChange={(e) => setToDateStr(e.target.value)}
            className="input-field"
          />
        </div>

        {diff && (
          <div
            style={{
              padding: '16px',
              borderRadius: '12px',
              background: 'rgba(6, 182, 212, 0.1)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
            }}
          >
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Thời gian chính xác:
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--accent-cyan)', marginTop: '4px' }}>
              {diff.years} năm, {diff.months} tháng, {diff.days} ngày
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginTop: '6px' }}>
              Quy đổi: <strong>{diff.totalMonths.toLocaleString('vi-VN')}</strong> tháng •{' '}
              <strong>{diff.totalDays.toLocaleString('vi-VN')}</strong> ngày
            </div>
          </div>
        )}
      </div>

      <div className="bento-card" style={{ padding: '22px 24px' }}>
        <h3 style={{ fontSize: '0.96rem', fontWeight: 700, marginBottom: '12px' }}>
          Các mốc kỷ niệm tròn năm (5 năm – 60 năm)
        </h3>
        {diff ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {diff.milestones.map((m) => (
              <div
                key={m.years}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.85rem',
                }}
              >
                <span style={{ fontWeight: 700, color: m.passed ? 'var(--accent-emerald)' : 'var(--text-main)' }}>
                  Mốc {m.years} năm {m.passed ? '✓' : ''}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>{m.dateStr}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: 'var(--accent-rose)', fontSize: '0.86rem' }}>
            Ngày kết thúc phải lớn hơn hoặc bằng ngày gốc.
          </div>
        )}
      </div>
    </div>
  );
};

export default TimeAdminTools;
