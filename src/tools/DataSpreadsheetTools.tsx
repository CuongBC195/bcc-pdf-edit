import React, { useMemo, useState } from 'react';
import { ArrowDownAZ, Check, Copy } from 'lucide-react';
import { HubShell } from '../hub/HubShell';
import { ToolPageHeader } from './ToolPageHeader';

export type DataSpreadsheetToolId =
  | 'vn-name-splitter'
  | 'list-deduplicator'
  | 'table-converter'
  | 'vat-percent-calculator';

const CopyTextBtn: React.FC<{ text: string; label: string; primary?: boolean }> = ({
  text,
  label,
  primary = false,
}) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      disabled={!text}
      onClick={async () => {
        if (!text) return;
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className={`btn btn-sm ${primary ? 'btn-primary' : 'btn-secondary'}`}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      <span>{copied ? 'Đã sao chép!' : label}</span>
    </button>
  );
};

// ============================================================================
// 1. TÁCH HỌ - TÊN ĐỆM - TÊN & SẮP XẾP A-Z CHUẨN TIẾNG VIỆT CHO EXCEL
// ============================================================================
interface SplitNameRow {
  fullName: string;
  lastName: string; // Họ
  middleName: string; // Tên đệm
  lastAndMiddle: string; // Họ và tên đệm
  firstName: string; // Tên
}

function normalizeAndSplitVietnameseName(raw: string): SplitNameRow {
  const clean = raw
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (m) => m.toUpperCase());
  const parts = clean.split(' ').filter(Boolean);
  if (parts.length === 0) {
    return { fullName: '', lastName: '', middleName: '', lastAndMiddle: '', firstName: '' };
  }
  if (parts.length === 1) {
    return {
      fullName: parts[0],
      lastName: '',
      middleName: '',
      lastAndMiddle: '',
      firstName: parts[0],
    };
  }
  const firstName = parts[parts.length - 1];
  const lastName = parts[0];
  const middleName = parts.slice(1, -1).join(' ');
  const lastAndMiddle = parts.slice(0, -1).join(' ');
  return {
    fullName: clean,
    lastName,
    middleName,
    lastAndMiddle,
    firstName,
  };
}

const VnNameSplitterView: React.FC = () => {
  const [input, setInput] = useState(
    [
      'Nguyễn Thị Minh Anh',
      'Trần Văn Bình',
      'Lê Hoàng Cường',
      'Phạm Ngọc Ánh',
      'Đặng Quốc Bảo',
    ].join('\n')
  );
  const [sortByVnName, setSortByVnName] = useState(false);

  const rows = useMemo(() => {
    const parsed = input
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map(normalizeAndSplitVietnameseName);

    if (!sortByVnName) return parsed;
    const collator = new Intl.Collator('vi', { sensitivity: 'base' });
    return [...parsed].sort((a, b) => {
      const cmpFirst = collator.compare(a.firstName, b.firstName);
      if (cmpFirst !== 0) return cmpFirst;
      const cmpMid = collator.compare(a.middleName, b.middleName);
      if (cmpMid !== 0) return cmpMid;
      return collator.compare(a.lastName, b.lastName);
    });
  }, [input, sortByVnName]);

  // Chuỗi TSV 2 cột (Họ và tên đệm | Tên) để dán thẳng vào Excel
  const tsvTwoCols = useMemo(
    () => rows.map((r) => `${r.lastAndMiddle}\t${r.firstName}`).join('\n'),
    [rows]
  );

  // Chuỗi TSV 3 cột (Họ | Tên đệm | Tên)
  const tsvThreeCols = useMemo(
    () => rows.map((r) => `${r.lastName}\t${r.middleName}\t${r.firstName}`).join('\n'),
    [rows]
  );

  // Chuỗi Họ và tên đã chuẩn hóa
  const fullNamesText = useMemo(() => rows.map((r) => r.fullName).join('\n'), [rows]);

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
            marginBottom: '10px',
          }}
        >
          <label style={{ fontWeight: 700, fontSize: '0.88rem' }}>
            Dán cột Họ và Tên từ Excel ({rows.length} người):
          </label>
          <button
            type="button"
            onClick={() => setSortByVnName((v) => !v)}
            className={`btn btn-sm ${sortByVnName ? 'btn-primary' : 'btn-secondary'}`}
          >
            <ArrowDownAZ size={14} />
            <span>{sortByVnName ? 'Đang xếp A→Z theo Tên' : 'Xếp A→Z theo Tên'}</span>
          </button>
        </div>

        <textarea
          rows={12}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Mỗi họ tên trên 1 dòng..."
          className="input-field"
          style={{ fontSize: '0.94rem', lineHeight: 1.6 }}
        />
      </div>

      <div className="bento-card" style={{ padding: '22px 24px' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '14px',
          }}
        >
          <CopyTextBtn
            text={tsvTwoCols}
            label="Copy 2 cột (Họ đệm | Tên) dán Excel"
            primary={true}
          />
          <CopyTextBtn text={tsvThreeCols} label="Copy 3 cột (Họ | Đệm | Tên)" />
          <CopyTextBtn text={fullNamesText} label="Copy Họ tên đã chuẩn hóa" />
        </div>

        <div style={{ maxHeight: '360px', overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-elevated)', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)' }}>#</th>
                <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)' }}>Họ</th>
                <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)' }}>Tên đệm</th>
                <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)' }}>Họ và tên đệm</th>
                <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--accent-cyan)' }}>Tên</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '7px 10px', color: 'var(--text-dim)' }}>{idx + 1}</td>
                  <td style={{ padding: '7px 10px' }}>{r.lastName}</td>
                  <td style={{ padding: '7px 10px' }}>{r.middleName}</td>
                  <td style={{ padding: '7px 10px' }}>{r.lastAndMiddle}</td>
                  <td style={{ padding: '7px 10px', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                    {r.firstName}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. LỌC TRÙNG & ĐỐI CHIẾU 2 DANH SÁCH (AI CHƯA NỘP / PHẦN CHUNG)
// ============================================================================
const ListDeduplicatorView: React.FC = () => {
  const [listA, setListA] = useState('Nguyễn Văn A\nTrần Thị B\nLê Văn C\nNguyễn Văn A\nPhạm Văn D');
  const [listB, setListB] = useState('Trần Thị B\nPhạm Văn D\nHoàng Thị E');
  const [ignoreCase, setIgnoreCase] = useState(true);

  const stats = useMemo(() => {
    const norm = (s: string) => (ignoreCase ? s.trim().toLowerCase() : s.trim());

    const rawA = listA
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const rawB = listB
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const uniqueAMap = new Map<string, { display: string; count: number }>();
    for (const item of rawA) {
      const k = norm(item);
      const ex = uniqueAMap.get(k);
      if (ex) ex.count++;
      else uniqueAMap.set(k, { display: item, count: 1 });
    }

    const setB = new Set(rawB.map(norm));
    const setA = new Set(rawA.map(norm));

    const uniqueA = Array.from(uniqueAMap.values()).map((v) => v.display);
    const duplicatesInA = Array.from(uniqueAMap.values())
      .filter((v) => v.count > 1)
      .map((v) => `${v.display} (${v.count} lần)`);

    const onlyInA = uniqueA.filter((item) => !setB.has(norm(item)));
    const inBoth = uniqueA.filter((item) => setB.has(norm(item)));
    const onlyInB = Array.from(new Set(rawB)).filter((item) => !setA.has(norm(item)));

    return {
      totalA: rawA.length,
      uniqueA,
      duplicatesInA,
      onlyInA,
      inBoth,
      onlyInB,
    };
  }, [listA, listB, ignoreCase]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '18px',
        }}
      >
        <div className="bento-card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <label style={{ fontWeight: 700, fontSize: '0.88rem' }}>
              Danh sách A (Danh sách gốc / Tổng số: {stats.totalA} dòng)
            </label>
          </div>
          <textarea
            rows={8}
            value={listA}
            onChange={(e) => setListA(e.target.value)}
            className="input-field"
            placeholder="Dán danh sách cần lọc trùng..."
          />
        </div>

        <div className="bento-card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <label style={{ fontWeight: 700, fontSize: '0.88rem' }}>
              Danh sách B (Tùy chọn — dùng khi cần đối chiếu với Danh sách A)
            </label>
            <label style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <input
                type="checkbox"
                checked={ignoreCase}
                onChange={(e) => setIgnoreCase(e.target.checked)}
              />
              <span>Không phân biệt HOA/thường</span>
            </label>
          </div>
          <textarea
            rows={8}
            value={listB}
            onChange={(e) => setListB(e.target.value)}
            className="input-field"
            placeholder="Dán danh sách B để tìm ai có trong A nhưng chưa có trong B..."
          />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '16px',
        }}
      >
        {[
          {
            title: `Danh sách A đã lọc trùng (${stats.uniqueA.length})`,
            items: stats.uniqueA,
            accent: '#06b6d4',
          },
          {
            title: `Bị lặp trong A (${stats.duplicatesInA.length})`,
            items: stats.duplicatesInA,
            accent: '#f59e0b',
          },
          {
            title: `Có ở A nhưng CHƯA có ở B (${stats.onlyInA.length})`,
            items: stats.onlyInA,
            accent: '#f43f5e',
          },
          {
            title: `Có ở cả A và B (${stats.inBoth.length})`,
            items: stats.inBoth,
            accent: '#10b981',
          },
        ].map((box) => (
          <div
            key={box.title}
            className="bento-card"
            style={{ padding: '16px 18px', borderTop: `3px solid ${box.accent}` }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                marginBottom: '10px',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: '0.84rem' }}>{box.title}</span>
              <CopyTextBtn text={box.items.join('\n')} label="Copy" />
            </div>
            <textarea
              readOnly
              rows={6}
              value={box.items.join('\n')}
              className="input-field"
              style={{ fontSize: '0.85rem' }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// 3. CHUYỂN ĐỔI BẢNG EXCEL (TSV) <-> CSV / JSON / MARKDOWN
// ============================================================================
const TableConverterView: React.FC = () => {
  const [rawInput, setRawInput] = useState(
    'Họ tên\tChức vụ\tĐơn vị\nNguyễn Văn A\tTrưởng phòng\tPhòng Hành chính\nTrần Thị B\tChuyên viên\tPhòng Tổng hợp'
  );
  const [outputFormat, setOutputFormat] = useState<'csv' | 'json' | 'markdown' | 'tsv'>('markdown');

  const matrix = useMemo(() => {
    const lines = rawInput
      .trim()
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];
    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    return lines.map((line) => line.split(delimiter).map((cell) => cell.trim()));
  }, [rawInput]);

  const convertedOutput = useMemo(() => {
    if (matrix.length === 0) return '';
    const headers = matrix[0];
    const body = matrix.slice(1);

    if (outputFormat === 'tsv') {
      return matrix.map((row) => row.join('\t')).join('\n');
    }
    if (outputFormat === 'csv') {
      return matrix
        .map((row) =>
          row
            .map((cell) =>
              cell.includes(',') || cell.includes('"')
                ? `"${cell.replace(/"/g, '""')}"`
                : cell
            )
            .join(',')
        )
        .join('\n');
    }
    if (outputFormat === 'json') {
      const objs = body.map((row) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
          obj[h || `col_${i + 1}`] = row[i] ?? '';
        });
        return obj;
      });
      return JSON.stringify(objs, null, 2);
    }
    // Markdown table
    const headerRow = `| ${headers.join(' | ')} |`;
    const sepRow = `| ${headers.map(() => '---').join(' | ')} |`;
    const bodyRows = body.map((row) => `| ${headers.map((_, i) => row[i] ?? '').join(' | ')} |`);
    return [headerRow, sepRow, ...bodyRows].join('\n');
  }, [matrix, outputFormat]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '20px',
      }}
    >
      <div className="bento-card" style={{ padding: '22px 24px' }}>
        <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', marginBottom: '8px' }}>
          Copy vùng bảng từ Excel hoặc CSV dán vào đây:
        </label>
        <textarea
          rows={11}
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          className="input-field"
          style={{ fontFamily: 'monospace', fontSize: '0.86rem' }}
        />
      </div>

      <div className="bento-card" style={{ padding: '22px 24px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '10px',
          }}
        >
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { id: 'markdown', label: 'Bảng Markdown' },
              { id: 'csv', label: 'CSV' },
              { id: 'json', label: 'JSON' },
              { id: 'tsv', label: 'TSV (Dán vào Excel)' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setOutputFormat(f.id as typeof outputFormat)}
                className={`hub-pill ${outputFormat === f.id ? 'is-active' : ''}`}
                style={{ cursor: 'pointer', fontSize: '0.78rem' }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <CopyTextBtn text={convertedOutput} label="Sao chép" primary={true} />
        </div>

        <textarea
          readOnly
          rows={11}
          value={convertedOutput}
          className="input-field"
          style={{ fontFamily: 'monospace', fontSize: '0.86rem' }}
        />
      </div>
    </div>
  );
};

export const DataSpreadsheetTools: React.FC<{ toolId: DataSpreadsheetToolId }> = ({ toolId }) => {
  return (
    <HubShell>
      <ToolPageHeader toolId={toolId} />
      {toolId === 'vn-name-splitter' && <VnNameSplitterView />}
      {toolId === 'list-deduplicator' && <ListDeduplicatorView />}
      {toolId === 'table-converter' && <TableConverterView />}
      {toolId === 'vat-percent-calculator' && <VatPercentCalculatorView />}
    </HubShell>
  );
};

// ============================================================================
// 4. TÍNH THUẾ GTGT (VAT 8% / 10%) XUÔI – NGƯỢC & CHIẾT KHẤU
// ============================================================================
const VatPercentCalculatorView: React.FC = () => {
  const [amountRaw, setAmountRaw] = useState('11000000');
  const [vatRate, setVatRate] = useState<number>(10);
  const [direction, setDirection] = useState<'after-to-before' | 'before-to-after'>('after-to-before');
  const [discountPct, setDiscountPct] = useState<number>(0);

  const baseAmount = useMemo(() => {
    const clean = amountRaw.replace(/\D/g, '');
    return clean ? Number(clean) : 0;
  }, [amountRaw]);

  const calc = useMemo(() => {
    const rate = Math.max(0, vatRate) / 100;
    const disc = Math.min(100, Math.max(0, discountPct)) / 100;

    if (direction === 'before-to-after') {
      const afterDiscount = Math.round(baseAmount * (1 - disc));
      const discountAmt = baseAmount - afterDiscount;
      const vatAmt = Math.round(afterDiscount * rate);
      const total = afterDiscount + vatAmt;
      return {
        preTax: afterDiscount,
        vatAmt,
        total,
        discountAmt,
      };
    }

    // Từ tổng thanh toán (đã gồm VAT) tách ngược ra tiền trước thuế và tiền thuế
    const preTax = Math.round(baseAmount / (1 + rate));
    const vatAmt = baseAmount - preTax;
    const discountAmt = disc > 0 ? Math.round(baseAmount * disc) : 0;
    return {
      preTax,
      vatAmt,
      total: baseAmount - discountAmt,
      discountAmt,
    };
  }, [baseAmount, vatRate, direction, discountPct]);

  const fmt = (n: number) => n.toLocaleString('vi-VN');

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
          <label style={{ display: 'block', fontWeight: 700, fontSize: '0.86rem', marginBottom: '8px' }}>
            Chế độ tính hóa đơn:
          </label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setDirection('after-to-before')}
              className={`hub-pill ${direction === 'after-to-before' ? 'is-active' : ''}`}
              style={{ cursor: 'pointer' }}
            >
              Có Tổng sau thuế → Tách ngược trước thuế
            </button>
            <button
              type="button"
              onClick={() => setDirection('before-to-after')}
              className={`hub-pill ${direction === 'before-to-after' ? 'is-active' : ''}`}
              style={{ cursor: 'pointer' }}
            >
              Có Tiền trước thuế → Cộng thêm VAT
            </button>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 700, fontSize: '0.86rem', marginBottom: '6px' }}>
            {direction === 'after-to-before'
              ? 'Nhập Tổng tiền thanh toán (đã gồm VAT):'
              : 'Nhập Tiền hàng trước thuế (chưa gồm VAT):'}
          </label>
          <input
            type="text"
            value={baseAmount > 0 ? fmt(baseAmount) : amountRaw}
            onChange={(e) => setAmountRaw(e.target.value)}
            className="input-field"
            style={{ fontSize: '1.3rem', fontWeight: 800 }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
              Mức thuế suất GTGT (VAT %):
            </label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[0, 5, 8, 10].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setVatRate(r)}
                  className={`hub-pill ${vatRate === r ? 'is-active' : ''}`}
                  style={{ cursor: 'pointer', padding: '6px 12px' }}
                >
                  {r}%
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
              Chiết khấu (% tùy chọn):
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={discountPct}
              onChange={(e) => setDiscountPct(Number(e.target.value))}
              className="input-field"
            />
          </div>
        </div>
      </div>

      <div className="bento-card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {[
          {
            label: 'Tiền hàng trước thuế (Chưa VAT)',
            value: `${fmt(calc.preTax)} ₫`,
            raw: String(calc.preTax),
            accent: '#06b6d4',
          },
          {
            label: `Tiền thuế GTGT (VAT ${vatRate}%)`,
            value: `${fmt(calc.vatAmt)} ₫`,
            raw: String(calc.vatAmt),
            accent: '#f59e0b',
          },
          {
            label: 'Tổng cộng tiền thanh toán (Đã gồm VAT)',
            value: `${fmt(calc.total)} ₫`,
            raw: String(calc.total),
            accent: '#10b981',
          },
        ].map((row) => (
          <div
            key={row.label}
            style={{
              padding: '14px 16px',
              borderRadius: '12px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderLeft: `4px solid ${row.accent}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{row.label}</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: row.accent }}>
                {row.value}
              </div>
            </div>
            <CopyTextBtn text={row.raw} label="Copy số" />
          </div>
        ))}
      </div>
    </div>
  );
};

export default DataSpreadsheetTools;
