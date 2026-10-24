import React, { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Clock, Search, Sparkles, Star, Trash2, X } from 'lucide-react';
import {
  findToolLocation,
  getCategoryHref,
  POPULAR_TOOLS,
  ROOT_CATEGORIES,
  searchCatalog,
  TOTAL_TOOL_COUNT,
  type ToolLocation,
} from '../catalog';
import { useHubPreferences } from '../utils/hubStorage';
import { CategoryCard, ToolCard } from './CatalogCards';
import { HubShell } from './HubShell';

const QUICK_KEYWORDS = [
  { label: 'Tạo mã QR', query: 'tao ma qr' },
  { label: 'VietQR Ngân hàng', query: 'vietqr' },
  { label: 'Quét mã QR', query: 'quet ma qr' },
  { label: 'Đổi đuôi PNG ↔ JPG', query: 'doi duoi anh' },
  { label: 'Đổi size ảnh siêu nét', query: 'chinh size anh' },
  { label: 'Đọc số tiền', query: 'doc so tien' },
  { label: 'Lỗi font TCVN3/VNI', query: 'chuyen ma font' },
  { label: 'Tách Họ Tên Excel', query: 'tach ho ten' },
];

export const HomePage: React.FC = () => {
  const [query, setQuery] = useState('');
  const { favorites, recent, toggleFavorite, recordVisit, clearRecent } = useHubPreferences();

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  const favoriteLocations = useMemo(
    () =>
      favorites
        .map((id) => findToolLocation(id))
        .filter((loc): loc is ToolLocation => Boolean(loc)),
    [favorites]
  );

  const recentLocations = useMemo(
    () =>
      recent
        .map((id) => findToolLocation(id))
        .filter((loc): loc is ToolLocation => Boolean(loc)),
    [recent]
  );

  const searchResults = useMemo(() => {
    if (!query.trim()) return null;
    return searchCatalog(query);
  }, [query]);

  // Các danh mục văn phòng (ngoài nhóm PDF) để hiển thị trực tiếp các công cụ trên luồng chính
  const officeCategories = useMemo(
    () => ROOT_CATEGORIES.filter((c) => c.slug !== 'xu-ly-pdf'),
    []
  );

  return (
    <HubShell>
      {/* Hero + Tìm kiếm trực tiếp */}
      <section
        className="bento-card"
        style={{
          padding: '26px 28px',
          marginBottom: '28px',
          background:
            'radial-gradient(ellipse 90% 100% at 10% 0%, rgba(6, 182, 212, 0.14), transparent 65%), var(--bg-card)',
        }}
      >
        <div style={{ maxWidth: '54rem', margin: '0 auto', textAlign: 'center' }}>
          <h2
            style={{
              fontSize: '1.65rem',
              fontWeight: 800,
              marginBottom: '8px',
              letterSpacing: '-0.025em',
            }}
          >
            Cổng tiện ích Văn phòng, PDF & Mã QR toàn diện
          </h2>
          <p
            style={{
              fontSize: '0.92rem',
              color: 'var(--text-muted)',
              marginBottom: '18px',
            }}
          >
            Đầy đủ {TOTAL_TOOL_COUNT} công cụ xử lý PDF chuyên sâu, tạo/quét mã QR, chuẩn hóa văn
            bản tiếng Việt, ảnh thẻ & dữ liệu Excel — 100% trên trình duyệt.
          </p>

          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-md)',
              padding: '4px 14px',
              boxShadow: '0 6px 20px rgba(0, 0, 0, 0.12)',
            }}
          >
            <Search size={19} color="var(--border-active)" style={{ flexShrink: 0 }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm công cụ theo tên tiếng Việt, không dấu hoặc tiếng Anh (VD: tach pdf, vietqr, merge, word, ocr...)"
              style={{
                width: '100%',
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: 'var(--text-main)',
                padding: '10px 12px',
                fontSize: '0.95rem',
                fontFamily: 'var(--font-sans)',
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="btn btn-ghost btn-sm"
                style={{ padding: '4px 8px' }}
                title="Xóa tìm kiếm"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexWrap: 'wrap',
              gap: '8px',
              marginTop: '14px',
            }}
          >
            {QUICK_KEYWORDS.map((item) => {
              const active = query.toLowerCase() === item.query;
              return (
                <button
                  key={item.query}
                  type="button"
                  onClick={() => setQuery(active ? '' : item.query)}
                  className={`hub-pill ${active ? 'is-active' : ''}`}
                  style={{ cursor: 'pointer', padding: '5px 11px', fontSize: '0.77rem' }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Kết quả tìm kiếm trực tiếp */}
      {searchResults ? (
        <section style={{ marginBottom: '28px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '14px',
            }}
          >
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
              Kết quả tìm kiếm cho “{query}” ({searchResults.tools.length} công cụ
              {searchResults.categories.length > 0
                ? `, ${searchResults.categories.length} danh mục`
                : ''}
              )
            </h2>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="btn btn-secondary btn-sm"
            >
              Đóng kết quả
            </button>
          </div>

          {searchResults.categories.length === 0 && searchResults.tools.length === 0 ? (
            <div
              className="bento-card"
              style={{
                padding: '32px 20px',
                textAlign: 'center',
                color: 'var(--text-muted)',
              }}
            >
              Không tìm thấy công cụ nào khớp với từ khóa “{query}”. Hãy thử từ khóa ngắn hơn (ví
              dụ: <strong>gop</strong>, <strong>tach</strong>, <strong>nen</strong>,{' '}
              <strong>word</strong>, <strong>ocr</strong>).
            </div>
          ) : (
            <>
              {searchResults.categories.length > 0 && (
                <div className="hub-grid" style={{ marginBottom: '18px' }}>
                  {searchResults.categories.map((cat) => (
                    <CategoryCard key={cat.path.join('/')} node={cat} />
                  ))}
                </div>
              )}

              {searchResults.tools.length > 0 && (
                <div className="hub-grid">
                  {searchResults.tools.map(({ tool, trail }) => (
                    <ToolCard
                      key={tool.id}
                      tool={tool}
                      trail={trail}
                      isFavorite={favoriteSet.has(tool.id)}
                      onToggleFavorite={toggleFavorite}
                      onOpenTool={recordVisit}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        <>
          {/* Công cụ yêu thích */}
          {favoriteLocations.length > 0 && (
            <section style={{ marginBottom: '26px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '12px',
                }}
              >
                <Star size={17} color="#f59e0b" fill="#f59e0b" />
                <h2 style={{ fontSize: '1.08rem', fontWeight: 700, margin: 0 }}>
                  Công cụ yêu thích ({favoriteLocations.length})
                </h2>
              </div>
              <div className="hub-grid">
                {favoriteLocations.map(({ tool, trail }) => (
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    trail={trail}
                    isFavorite={true}
                    onToggleFavorite={toggleFavorite}
                    onOpenTool={recordVisit}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Vừa sử dụng */}
          {recentLocations.length > 0 && (
            <section style={{ marginBottom: '26px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={17} color="var(--accent-cyan)" />
                  <h2 style={{ fontSize: '1.08rem', fontWeight: 700, margin: 0 }}>
                    Vừa sử dụng gần đây ({recentLocations.length})
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={clearRecent}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '0.76rem', padding: '4px 10px' }}
                >
                  <Trash2 size={13} />
                  <span>Xóa lịch sử</span>
                </button>
              </div>
              <div className="hub-grid">
                {recentLocations.slice(0, 6).map(({ tool, trail }) => (
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    trail={trail}
                    isFavorite={favoriteSet.has(tool.id)}
                    onToggleFavorite={toggleFavorite}
                    onOpenTool={recordVisit}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Công cụ nổi bật & phổ biến */}
          <section style={{ marginBottom: '28px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} color="var(--accent-emerald)" />
                <h2 style={{ fontSize: '1.12rem', fontWeight: 700, margin: 0 }}>
                  Công cụ nổi bật & dùng nhiều nhất
                </h2>
              </div>
              <Link
                to="/c/xu-ly-pdf"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--accent-cyan)',
                  textDecoration: 'none',
                }}
              >
                <span>Mở trọn bộ 119 công cụ PDF</span>
                <ArrowRight size={14} />
              </Link>
            </div>

            <div className="hub-grid">
              {POPULAR_TOOLS.map(({ tool, trail }) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  trail={trail}
                  isFavorite={favoriteSet.has(tool.id)}
                  onToggleFavorite={toggleFavorite}
                  onOpenTool={recordVisit}
                />
              ))}
            </div>
          </section>

          {/* Truy cập nhanh các nhóm Tiện ích Văn phòng */}
          {officeCategories.map((cat) => (
            <section key={cat.slug} style={{ marginBottom: '26px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '11px',
                }}
              >
                <Link
                  to={getCategoryHref(cat)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    textDecoration: 'none',
                    color: 'var(--text-main)',
                  }}
                >
                  <i
                    className={`ph ${cat.icon}`}
                    style={{ fontSize: '1.15rem', color: cat.accent }}
                  />
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>
                    {cat.name}
                  </h3>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    ({cat.totalTools})
                  </span>
                </Link>
                <Link
                  to={getCategoryHref(cat)}
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: cat.accent,
                    textDecoration: 'none',
                  }}
                >
                  Xem nhóm →
                </Link>
              </div>

              <div className="hub-grid">
                {cat.tools.map((tool) => (
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    accent={cat.accent}
                    isFavorite={favoriteSet.has(tool.id)}
                    onToggleFavorite={toggleFavorite}
                    onOpenTool={recordVisit}
                  />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </HubShell>
  );
};
