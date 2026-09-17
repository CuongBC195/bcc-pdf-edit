import React from 'react';
import { Plus, Files, FolderTree } from 'lucide-react';
import type { SplitRule } from '../types/pdf';
import { SplitRuleCard } from './SplitRuleCard';

interface SplitRuleListProps {
  rules: SplitRule[];
  totalSourcePages: number;
  activeRuleId: string | null;
  onSelectRule: (id: string) => void;
  onHoverRule: (id: string | null) => void;
  onAddRule: () => void;
  onChangeName: (id: string, name: string) => void;
  onChangeRange: (id: string, rangeStr: string) => void;
  onChangeColor: (id: string, color: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

export const SplitRuleList: React.FC<SplitRuleListProps> = ({
  rules,
  totalSourcePages,
  activeRuleId,
  onSelectRule,
  onHoverRule,
  onAddRule,
  onChangeName,
  onChangeRange,
  onChangeColor,
  onDelete,
  onDuplicate,
}) => {
  const totalAssignedPages = rules.reduce((acc, r) => (r.isValid ? acc + r.pages.length : acc), 0);

  return (
    <div
      className="bento-card"
      style={{
        padding: '20px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* List Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--border-subtle)',
          marginBottom: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderTree size={18} color="var(--accent-cyan)" />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>
              Cấu hình các File con ({rules.length})
            </h3>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', margin: '2px 0 0 0' }}>
            Tổng số trang đã chọn: <strong>{totalAssignedPages} trang</strong>
          </p>
        </div>

        <button
          type="button"
          onClick={onAddRule}
          className="btn btn-primary btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={16} />
          <span>Thêm File con</span>
        </button>
      </div>

      {/* Rules Scrollable Container */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          maxHeight: 'calc(100vh - 280px)',
          paddingRight: '6px',
          paddingBottom: '140px',
        }}
      >
        {rules.length === 0 ? (
          <div
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              border: '2px dashed var(--border-medium)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-input)',
            }}
          >
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '14px',
                background: 'rgba(2, 132, 199, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px',
              }}
            >
              <Files size={28} color="var(--border-active)" />
            </div>
            <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>
              Chưa có file con nào được tạo
            </h4>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginBottom: '20px', maxWidth: '320px', margin: '0 auto 20px', lineHeight: 1.5 }}>
              Nhấp vào các trang ở cột bên trái hoặc bấm nút bên dưới để bắt đầu chia file.
            </p>
            <button onClick={onAddRule} className="btn btn-primary btn-sm" style={{ padding: '8px 18px' }}>
              <Plus size={16} /> Thêm File con đầu tiên
            </button>
          </div>
        ) : (
          rules.map((rule, idx) => (
            <SplitRuleCard
              key={rule.id}
              rule={rule}
              index={idx}
              totalSourcePages={totalSourcePages}
              isActive={rule.id === activeRuleId}
              onSelectRule={onSelectRule}
              onHoverRule={onHoverRule}
              onChangeName={onChangeName}
              onChangeRange={onChangeRange}
              onChangeColor={onChangeColor}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
            />
          ))
        )}
      </div>
    </div>
  );
};
