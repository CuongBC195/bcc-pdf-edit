import React from 'react';
import { FONT_FAMILY_LABELS, type FontFamily } from '../core/fonts';
import type { TextStyleState } from './textStyle';
import type { HPos, VPos } from '../core/draw';
import { Field, NumberInput, Toggle } from './components';

/** Chọn 1 trong 9 vị trí trên trang */
export const PositionPicker: React.FC<{
  value: { v: VPos; h: HPos };
  onChange: (v: { v: VPos; h: HPos }) => void;
  rows?: VPos[];
  label?: string;
}> = ({ value, onChange, rows = ['top', 'middle', 'bottom'], label = 'Vị trí' }) => {
  const names: Record<string, string> = { top: 'trên', middle: 'giữa', bottom: 'dưới', left: 'trái', center: 'giữa', right: 'phải' };
  return (
    <div className="pdft-field">
      <span className="pdft-field__label">{label}</span>
      <div role="radiogroup" aria-label={label} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 40px)', gap: 4 }}>
        {rows.flatMap((v) =>
          (['left', 'center', 'right'] as HPos[]).map((h) => {
            const active = value.v === v && value.h === h;
            return (
              <button
                key={`${v}-${h}`}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`${names[v]} ${names[h]}`}
                onClick={() => onChange({ v, h })}
                style={{
                  height: 30,
                  borderRadius: 6,
                  border: `1.5px solid ${active ? 'var(--accent-cyan)' : 'var(--border-medium)'}`,
                  background: active ? 'rgba(6,182,212,0.18)' : 'var(--bg-input)',
                  cursor: 'pointer',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: active ? 'var(--accent-cyan)' : 'var(--text-dim)' }}
                />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export const ColorInput: React.FC<{ id: string; value: string; onChange: (v: string) => void; label: string }> = ({ id, value, onChange, label }) => (
  <Field label={label} htmlFor={id}>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 44, height: 32, border: 0, background: 'none', padding: 0 }} />
      <input className="pdft-input" value={value} aria-label={`${label} (mã hex)`} onChange={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && onChange(e.target.value)} />
    </div>
  </Field>
);

export const TextStyleFields: React.FC<{ idPrefix: string; value: TextStyleState; onChange: (v: TextStyleState) => void; sizeMax?: number }> = ({
  idPrefix,
  value,
  onChange,
  sizeMax = 96,
}) => (
  <>
    <Field label="Phông chữ" htmlFor={`${idPrefix}-family`}>
      <select id={`${idPrefix}-family`} className="pdft-select" value={value.family} onChange={(e) => onChange({ ...value, family: e.target.value as FontFamily })}>
        {(Object.keys(FONT_FAMILY_LABELS) as FontFamily[]).map((f) => (
          <option key={f} value={f}>
            {FONT_FAMILY_LABELS[f]}
          </option>
        ))}
      </select>
    </Field>
    <div className="pdft-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <Field label="Cỡ chữ (pt)" htmlFor={`${idPrefix}-size`}>
        <NumberInput id={`${idPrefix}-size`} value={value.size} min={4} max={sizeMax} step={0.5} onChange={(size) => onChange({ ...value, size })} />
      </Field>
      <ColorInput id={`${idPrefix}-color`} label="Màu chữ" value={value.color} onChange={(color) => onChange({ ...value, color })} />
    </div>
    {value.family !== 'mono' && (
      <div style={{ display: 'flex', gap: 16 }}>
        <Toggle checked={value.bold} onChange={(bold) => onChange({ ...value, bold })} label="Đậm" />
        <Toggle checked={value.italic} onChange={(italic) => onChange({ ...value, italic })} label="Nghiêng" />
      </div>
    )}
  </>
);
