import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText,
  ArrowRight,
  Trash2,
  Clock,
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle2,
  FolderOpen,
  Plus,
} from 'lucide-react';
import type { RecentFileSummary } from '../services/storageService';

interface RecentFilesListProps {
  recentFiles: RecentFileSummary[];
  onOpenRecentFile: (fileId: string) => void;
  onDeleteRecentFile: (fileId: string) => void;
  onClearAllRecent: () => void;
  onUploadNewClick?: () => void;
  isModalMode?: boolean;
  onCloseModal?: () => void;
}

export const RecentFilesList: React.FC<RecentFilesListProps> = ({
  recentFiles,
  onOpenRecentFile,
  onDeleteRecentFile,
  onClearAllRecent,
  onUploadNewClick,
  isModalMode = false,
  onCloseModal,
}) => {
  // State for search, filtering, sorting, pagination
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'configured' | 'unconfigured'>('all');
  const [sortBy, setSortBy] = useState<
    'recent' | 'oldest' | 'name-asc' | 'name-desc' | 'size-desc' | 'size-asc' | 'pages-desc' | 'rules-desc'
  >('recent');
  const [pageSize, setPageSize] = useState<number>(6);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Close modal on ESC key
  useEffect(() => {
    if (!isModalMode || !onCloseModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalMode, onCloseModal]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatTimeAgo = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Vừa xong';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} phút trước`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Hôm qua';
    return `${days} ngày trước`;
  };

  // Counts for filter tabs
  const configuredCount = useMemo(() => recentFiles.filter((f) => f.ruleCount > 0).length, [recentFiles]);
  const unconfiguredCount = useMemo(() => recentFiles.filter((f) => f.ruleCount === 0).length, [recentFiles]);

  // Filtered files
  const filteredFiles = useMemo(() => {
    return recentFiles.filter((file) => {
      // 1. Search Query
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        if (!file.name.toLowerCase().includes(query)) {
          return false;
        }
      }
      // 2. Status Filter
      if (statusFilter === 'configured') {
        return file.ruleCount > 0;
      }
      if (statusFilter === 'unconfigured') {
        return file.ruleCount === 0;
      }
      return true;
    });
  }, [recentFiles, searchTerm, statusFilter]);

  // Sorted files
  const sortedFiles = useMemo(() => {
    const list = [...filteredFiles];
    switch (sortBy) {
      case 'recent':
        return list.sort((a, b) => b.lastUpdated - a.lastUpdated);
      case 'oldest':
        return list.sort((a, b) => a.lastUpdated - b.lastUpdated);
      case 'name-asc':
        return list.sort((a, b) => a.name.localeCompare(b.name));
      case 'name-desc':
        return list.sort((a, b) => b.name.localeCompare(a.name));
      case 'size-desc':
        return list.sort((a, b) => b.size - a.size);
      case 'size-asc':
        return list.sort((a, b) => a.size - b.size);
      case 'pages-desc':
        return list.sort((a, b) => b.pageCount - a.pageCount);
      case 'rules-desc':
        return list.sort((a, b) => b.ruleCount - a.ruleCount);
      default:
        return list;
    }
  }, [filteredFiles, sortBy]);

  // Pagination calculation
  const totalItems = sortedFiles.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);

  const paginatedFiles = useMemo(() => {
    if (pageSize >= 999) return sortedFiles;
    const startIndex = (validCurrentPage - 1) * pageSize;
    return sortedFiles.slice(startIndex, startIndex + pageSize);
  }, [sortedFiles, validCurrentPage, pageSize]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, sortBy, pageSize]);

  const startIndexDisplay = totalItems === 0 ? 0 : (validCurrentPage - 1) * pageSize + 1;
  const endIndexDisplay = Math.min(validCurrentPage * pageSize, totalItems);

  return (
    <div
      className={isModalMode ? '' : 'bento-card animate-fade-in'}
      style={{
        position: 'relative',
        padding: isModalMode ? '24px 28px' : '24px',
        marginBottom: isModalMode ? '0' : '28px',
        background: 'var(--bg-surface)',
        border: isModalMode ? 'none' : '1px solid var(--border-medium)',
        boxShadow: isModalMode ? 'none' : '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
      }}
    >
      {/* Absolute Close [X] Button for Modal Mode (Standard Top-Right Position) */}
      {isModalMode && onCloseModal && (
        <button
          type="button"
          onClick={onCloseModal}
          className="btn btn-ghost"
          style={{
            position: 'absolute',
            top: '20px',
            right: '22px',
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            background: 'var(--bg-input)',
            border: '1px solid var(--border-medium)',
            cursor: 'pointer',
            zIndex: 10,
            transition: 'all 0.15s ease',
          }}
          title="Đóng cửa sổ (ESC)"
          aria-label="Đóng cửa sổ"
        >
          <X size={18} />
        </button>
      )}

      {/* 1. Header Section */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          paddingBottom: '18px',
          borderBottom: '1px solid var(--border-subtle)',
          marginBottom: '18px',
          paddingRight: isModalMode ? '48px' : '0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 320px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.15), rgba(139, 92, 246, 0.15))',
              border: '1px solid rgba(2, 132, 199, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--border-active)',
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.12)',
              flexShrink: 0,
            }}
          >
            <Clock size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3 style={{ fontSize: '1.18rem', fontWeight: 800, margin: 0, color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
                Danh sách tệp PDF đã tải lên
              </h3>
              <span className="badge badge-cyan" style={{ fontSize: '0.74rem', padding: '3px 9px' }}>
                {recentFiles.length} tệp đã lưu
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '3px 0 0 0' }}>
              Lưu trữ an toàn 100% Client-Side trong IndexedDB. Mở lại bất kỳ file nào chỉ với 1 cú nhấp chuột!
            </p>
          </div>
        </div>

        {/* Right-aligned Header Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto' }}>
          {onUploadNewClick && (
            <button
              type="button"
              onClick={onUploadNewClick}
              className="btn btn-primary btn-sm"
              style={{
                fontSize: '0.82rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                fontWeight: 600,
              }}
            >
              <Plus size={15} />
              <span>Tải thêm tệp PDF</span>
            </button>
          )}

          {recentFiles.length > 0 && (
            <button
              type="button"
              onClick={onClearAllRecent}
              className="btn btn-ghost btn-sm"
              style={{
                color: 'var(--accent-rose)',
                fontSize: '0.78rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
              }}
              title="Xóa toàn bộ các tệp đã lưu trong bộ nhớ trình duyệt"
            >
              <Trash2 size={14} />
              <span>Xóa tất cả</span>
            </button>
          )}
        </div>
      </div>

      {recentFiles.length === 0 ? (
        <div
          style={{
            padding: '56px 24px',
            textAlign: 'center',
            background: 'var(--bg-card)',
            borderRadius: '16px',
            border: '1px dashed var(--border-medium)',
            margin: '12px 0 6px 0',
          }}
        >
          <div
            style={{
              width: '60px',
              height: '60px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.12), rgba(139, 92, 246, 0.12))',
              border: '1px solid rgba(2, 132, 199, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
              color: 'var(--border-active)',
            }}
          >
            <FolderOpen size={30} />
          </div>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
            Chưa có tệp PDF nào trong danh sách
          </h4>
          <p style={{ margin: '0 auto 24px auto', fontSize: '0.86rem', color: 'var(--text-muted)', maxWidth: '460px', lineHeight: 1.5 }}>
            Lịch sử lưu trữ hiện đang trống. Mọi tệp bạn tải lên và phân tách sẽ được tự động lưu trữ an toàn 100% Client-Side trong trình duyệt để mở lại bất kỳ lúc nào.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {onUploadNewClick && (
              <button
                type="button"
                onClick={onUploadNewClick}
                className="btn btn-primary btn-md"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 18px',
                  fontWeight: 600,
                  fontSize: '0.86rem',
                }}
              >
                <Plus size={16} />
                <span>Tải lên tệp PDF mới</span>
              </button>
            )}
            {isModalMode && onCloseModal && (
              <button
                type="button"
                onClick={onCloseModal}
                className="btn btn-secondary btn-md"
                style={{ padding: '9px 18px', fontSize: '0.86rem' }}
              >
                Đóng cửa sổ (ESC)
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* 2. Management Toolbar: Search, Filters, Sort, Page Size */}
          <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
          padding: '12px 16px',
          background: 'var(--bg-card)',
          borderRadius: '12px',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {/* Left: Search Box & Status Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1, minWidth: '280px' }}>
          {/* Search Box */}
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              width: '260px',
              maxWidth: '100%',
            }}
          >
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '10px',
                color: 'var(--text-dim)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              placeholder="Tìm kiếm theo tên tệp..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 30px 6px 32px',
                fontSize: '0.82rem',
                borderRadius: '8px',
                border: '1px solid var(--border-medium)',
                background: 'var(--bg-surface)',
                color: 'var(--text-main)',
                outline: 'none',
                transition: 'all 0.15s ease',
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Xóa tìm kiếm"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Status Filter Tabs */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: 'var(--bg-surface)',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              style={{
                padding: '4px 10px',
                fontSize: '0.78rem',
                fontWeight: statusFilter === 'all' ? 700 : 500,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: statusFilter === 'all' ? 'var(--border-active)' : 'transparent',
                color: statusFilter === 'all' ? '#ffffff' : 'var(--text-muted)',
                transition: 'all 0.15s ease',
              }}
            >
              Tất cả ({recentFiles.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('configured')}
              style={{
                padding: '4px 10px',
                fontSize: '0.78rem',
                fontWeight: statusFilter === 'configured' ? 700 : 500,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: statusFilter === 'configured' ? 'var(--border-active)' : 'transparent',
                color: statusFilter === 'configured' ? '#ffffff' : 'var(--text-muted)',
                transition: 'all 0.15s ease',
              }}
            >
              Đã chia file ({configuredCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('unconfigured')}
              style={{
                padding: '4px 10px',
                fontSize: '0.78rem',
                fontWeight: statusFilter === 'unconfigured' ? 700 : 500,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: statusFilter === 'unconfigured' ? 'var(--border-active)' : 'transparent',
                color: statusFilter === 'unconfigured' ? '#ffffff' : 'var(--text-muted)',
                transition: 'all 0.15s ease',
              }}
            >
              Chưa chia ({unconfiguredCount})
            </button>
          </div>
        </div>

        {/* Right: Sort By & Page Size Dropdowns */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Sort Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowUpDown size={14} color="var(--text-dim)" />
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Sắp xếp:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
                padding: '5px 8px',
                fontSize: '0.78rem',
                borderRadius: '8px',
                border: '1px solid var(--border-medium)',
                background: 'var(--bg-surface)',
                color: 'var(--text-main)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="recent">Mới cập nhật nhất</option>
              <option value="oldest">Cũ nhất</option>
              <option value="name-asc">Tên file (A - Z)</option>
              <option value="name-desc">Tên file (Z - A)</option>
              <option value="size-desc">Dung lượng (Lớn - Nhỏ)</option>
              <option value="size-asc">Dung lượng (Nhỏ - Lớn)</option>
              <option value="pages-desc">Số trang (Nhiều - Ít)</option>
              <option value="rules-desc">Nhiều file con nhất</option>
            </select>
          </div>

          {/* Page Size Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Hiển thị:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              style={{
                padding: '5px 8px',
                fontSize: '0.78rem',
                borderRadius: '8px',
                border: '1px solid var(--border-medium)',
                background: 'var(--bg-surface)',
                color: 'var(--text-main)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value={6}>6 tệp / trang</option>
              <option value={12}>12 tệp / trang</option>
              <option value={24}>24 tệp / trang</option>
              <option value={999}>Tất cả ({recentFiles.length})</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Empty Results State (when search/filter has no match) */}
      {paginatedFiles.length === 0 && (
        <div
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            background: 'var(--bg-card)',
            borderRadius: '12px',
            border: '1px dashed var(--border-medium)',
            margin: '10px 0 20px 0',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(2, 132, 199, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px auto',
              color: 'var(--border-active)',
            }}
          >
            <Search size={22} />
          </div>
          <h4 style={{ margin: '0 0 4px 0', fontSize: '0.98rem', color: 'var(--text-main)' }}>
            Không tìm thấy tệp nào phù hợp
          </h4>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Vui lòng thử thay đổi từ khóa tìm kiếm hoặc chọn bộ lọc khác.
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setSearchTerm('');
              setStatusFilter('all');
            }}
          >
            Đặt lại bộ lọc
          </button>
        </div>
      )}

      {/* 4. Files Bento Grid */}
      {paginatedFiles.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: '16px',
            marginBottom: totalPages > 1 ? '20px' : '8px',
          }}
        >
          {paginatedFiles.map((file) => (
            <div
              key={file.id}
              className="bento-card"
              style={{
                padding: '16px 18px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-medium)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '14px',
                borderRadius: '14px',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                position: 'relative',
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-active)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 24px -4px rgba(2, 132, 199, 0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-medium)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.03)';
              }}
            >
              {/* File Info Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(249, 115, 22, 0.12))',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    position: 'relative',
                  }}
                >
                  <FileText size={20} color="#ef4444" />
                  <span
                    style={{
                      fontSize: '0.58rem',
                      fontWeight: 800,
                      color: '#ef4444',
                      letterSpacing: '0.04em',
                      lineHeight: 1,
                      marginTop: '2px',
                    }}
                  >
                    PDF
                  </span>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4
                    style={{
                      fontSize: '0.92rem',
                      fontWeight: 700,
                      color: 'var(--text-main)',
                      margin: '0 0 6px 0',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={file.name}
                  >
                    {file.name}
                  </h4>

                  {/* Status Badge & Page Count */}
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    {file.ruleCount > 0 ? (
                      <span
                        className="badge badge-emerald"
                        style={{
                          fontSize: '0.7rem',
                          padding: '2px 8px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <CheckCircle2 size={11} />
                        <span>Đã tạo {file.ruleCount} file con</span>
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          background: 'rgba(148, 163, 184, 0.15)',
                          color: 'var(--text-dim)',
                          border: '1px solid rgba(148, 163, 184, 0.25)',
                          fontWeight: 600,
                        }}
                      >
                        Chưa chia file
                      </span>
                    )}

                    <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                      <strong>{file.pageCount}</strong> trang
                    </span>
                  </div>
                </div>
              </div>

              {/* Meta Stats Row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'var(--bg-surface)',
                  borderRadius: '8px',
                  fontSize: '0.76rem',
                  color: 'var(--text-dim)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span>Dung lượng: <strong style={{ color: 'var(--text-muted)' }}>{formatFileSize(file.size)}</strong></span>
                <span>•</span>
                <span>Cập nhật: <strong style={{ color: 'var(--text-muted)' }}>{formatTimeAgo(file.lastUpdated)}</strong></span>
              </div>

              {/* Actions Footer */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--border-subtle)',
                  gap: '10px',
                }}
              >
                <button
                  type="button"
                  onClick={() => onOpenRecentFile(file.id)}
                  className="btn btn-primary btn-sm"
                  style={{
                    flex: 1,
                    padding: '7px 16px',
                    fontSize: '0.82rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '7px',
                    fontWeight: 700,
                    boxShadow: '0 2px 10px rgba(2, 132, 199, 0.25)',
                  }}
                >
                  <FolderOpen size={15} />
                  <span>Mở tệp này để tiếp tục tách</span>
                  <ArrowRight size={14} />
                </button>

                <button
                  type="button"
                  onClick={() => onDeleteRecentFile(file.id)}
                  className="btn btn-ghost btn-sm"
                  style={{
                    padding: '6px 10px',
                    color: 'var(--text-dim)',
                    fontSize: '0.76rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    borderRadius: '8px',
                  }}
                  title="Xóa tệp này khỏi bộ nhớ trình duyệt"
                >
                  <Trash2 size={14} />
                  <span>Xóa</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 5. Pagination Controls Footer */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
          }}
        >
          <div>
            Hiển thị <strong>{startIndexDisplay}</strong> – <strong>{endIndexDisplay}</strong> trên tổng số <strong>{totalItems}</strong> tệp
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={validCurrentPage <= 1}
              style={{ padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <ChevronLeft size={15} />
              <span>Trước</span>
            </button>

            {/* Page Numbers */}
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setCurrentPage(p)}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: validCurrentPage === p ? 700 : 500,
                  border: validCurrentPage === p ? '1px solid var(--border-active)' : '1px solid var(--border-subtle)',
                  background: validCurrentPage === p ? 'var(--border-active)' : 'var(--bg-card)',
                  color: validCurrentPage === p ? '#ffffff' : 'var(--text-main)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                {p}
              </button>
            ))}

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={validCurrentPage >= totalPages}
              style={{ padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <span>Sau</span>
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
