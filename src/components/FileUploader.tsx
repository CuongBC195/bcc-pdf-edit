import React, { useRef, useState } from 'react';
import { UploadCloud, FileText, CheckCircle2, RefreshCw, FolderOpen } from 'lucide-react';
import type { PDFMetadata } from '../types/pdf';
import { loadPdfMetadata } from '../services/pdfService';

interface FileUploaderProps {
  pdfMeta: PDFMetadata | null;
  onFileLoaded: (meta: PDFMetadata) => void;
  onReset: () => void;
  isLoading: boolean;
  isCompactMode?: boolean;
  recentCount?: number;
  onOpenRecentModal?: () => void;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  pdfMeta,
  onFileLoaded,
  onReset,
  isLoading,
  isCompactMode = false,
  recentCount,
  onOpenRecentModal,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleFile = async (file: File) => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Vui lòng chọn tệp định dạng PDF (.pdf)');
      return;
    }
    try {
      const meta = await loadPdfMetadata(file);
      onFileLoaded(meta);
    } catch (err: any) {
      alert('Không thể đọc tệp PDF này. ' + (err.message || ''));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  if (pdfMeta) {
    return (
      <div
        className="bento-card animate-fade-in"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          marginBottom: '18px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-medium)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background: 'rgba(2, 132, 199, 0.1)',
              border: '1px solid rgba(2, 132, 199, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FileText size={24} color="var(--accent-cyan)" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3 style={{ fontSize: '1.02rem', fontWeight: 700, margin: 0 }}>{pdfMeta.name}</h3>
              <span className="badge badge-emerald" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={12} /> Đã sẵn sàng
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              <span>Dung lượng: <strong>{formatFileSize(pdfMeta.size)}</strong></span>
              <span>•</span>
              <span>Tổng số trang: <strong style={{ color: 'var(--border-active)' }}>{pdfMeta.pageCount} trang</strong></span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {recentCount !== undefined && recentCount > 0 && onOpenRecentModal && (
            <button
              onClick={onOpenRecentModal}
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              title="Mở popup danh sách các tệp PDF đã lưu"
            >
              <FolderOpen size={14} color="var(--border-active)" />
              <span>Danh sách tệp ({recentCount})</span>
            </button>
          )}

          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-secondary btn-sm"
            title="Chọn một tệp PDF khác từ máy tính"
          >
            <RefreshCw size={14} />
            Đổi file khác
          </button>
          <button
            onClick={onReset}
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--accent-rose)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            title="Đóng file này và quay lại danh sách các tệp đã tải lên"
          >
            Đóng & Về danh sách tệp
          </button>
          <input
            id="bccpdf-main-file-input"
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files?.[0]) handleFile(e.target.files[0]);
            }}
          />
        </div>
      </div>
    );
  }

  if (isCompactMode) {
    return (
      <div
        className={`bento-card ${isDragOver ? 'border-active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        style={{
          padding: '24px 28px',
          textAlign: 'center',
          cursor: 'pointer',
          borderStyle: 'dashed',
          borderWidth: '2px',
          borderColor: isDragOver ? 'var(--border-active)' : 'var(--border-medium)',
          background: isDragOver ? 'rgba(2, 132, 199, 0.05)' : 'var(--bg-card)',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          transition: 'all var(--transition-smooth)',
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          id="bccpdf-main-file-input"
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files?.[0]) handleFile(e.target.files[0]);
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.12), rgba(139, 92, 246, 0.12))',
              border: '1px solid rgba(2, 132, 199, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <UploadCloud size={24} color="var(--border-active)" />
          </div>
          <div>
            <h3 style={{ fontSize: '1.02rem', fontWeight: 700, margin: '0 0 2px 0', color: 'var(--text-main)' }}>
              Kéo thả hoặc tải thêm file PDF mới
            </h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Các file tải lên sẽ được lưu an toàn trong trình duyệt của bạn (100% Client-Side).
            </p>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary btn-md"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          disabled={isLoading}
          style={{ padding: '8px 18px', fontSize: '0.86rem' }}
        >
          {isLoading ? 'Đang đọc tệp...' : '+ Tải thêm file PDF'}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`bento-card ${isDragOver ? 'border-active' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      style={{
        padding: '50px 32px',
        textAlign: 'center',
        cursor: 'pointer',
        borderStyle: 'dashed',
        borderWidth: '2px',
        borderColor: isDragOver ? 'var(--border-active)' : 'var(--border-medium)',
        background: isDragOver ? 'rgba(2, 132, 199, 0.05)' : 'var(--bg-card)',
        marginBottom: '24px',
        transition: 'all var(--transition-smooth)',
      }}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        id="bccpdf-main-file-input"
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files?.[0]) handleFile(e.target.files[0]);
        }}
      />

      <div
        style={{
          width: '64px',
          height: '64px',
          margin: '0 auto 16px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.12), rgba(139, 92, 246, 0.12))',
          border: '1px solid rgba(2, 132, 199, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <UploadCloud size={32} color="var(--border-active)" />
      </div>

      <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main)' }}>
        Kéo thả file PDF tổng vào đây hoặc click để chọn
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: '540px', margin: '0 auto 20px' }}>
        Xử lý 100% bảo mật an toàn trực tiếp trên trình duyệt của bạn (Chrome, Edge, Cốc Cốc, Safari...). Không tải file lên máy chủ.
      </p>

      <div>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          disabled={isLoading}
        >
          {isLoading ? 'Đang đọc tệp...' : 'Chọn file PDF từ máy tính'}
        </button>
      </div>
    </div>
  );
};
