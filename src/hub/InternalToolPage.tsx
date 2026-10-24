import React, { Suspense, useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { findToolById, getToolHref, resolveToolId } from '../catalog';
import { recordRecentTool } from '../utils/hubStorage';
import { HubShell } from './HubShell';
import type { QrBarcodeToolId } from '../tools/QrToolPage';
import type { VnTextToolId } from '../tools/VietnameseTextTools';
import type { OfficeImageToolId } from '../tools/OfficeImageTools';
import type { DataSpreadsheetToolId } from '../tools/DataSpreadsheetTools';
import type { TimeAdminToolId } from '../tools/TimeAdminTools';

const MultiSplitToolApp = React.lazy(() => import('../App'));
const QrToolPage = React.lazy(() => import('../tools/QrToolPage'));
const VietnameseTextTools = React.lazy(() => import('../tools/VietnameseTextTools'));
const OfficeImageTools = React.lazy(() => import('../tools/OfficeImageTools'));
const DataSpreadsheetTools = React.lazy(() => import('../tools/DataSpreadsheetTools'));
const TimeAdminTools = React.lazy(() => import('../tools/TimeAdminTools'));

const QR_BARCODE_IDS = new Set<QrBarcodeToolId>([
  'qr-generator',
  'qr-scanner',
  'vietqr-generator',
  'barcode-generator',
]);

const VN_TEXT_IDS = new Set<VnTextToolId>([
  'number-to-words',
  'vn-font-converter',
  'text-case-accent',
  'text-extractor',
  'text-diff',
  'word-counter',
  'find-replace-batch',
]);

const OFFICE_IMAGE_IDS = new Set<OfficeImageToolId>([
  'image-converter',
  'image-resizer',
  'image-compressor',
  'id-photo-cropper',
  'id-card-merger',
]);

const DATA_SPREADSHEET_IDS = new Set<DataSpreadsheetToolId>([
  'vn-name-splitter',
  'list-deduplicator',
  'vat-percent-calculator',
  'table-converter',
]);

const TIME_ADMIN_IDS = new Set<TimeAdminToolId>([
  'workday-calculator',
  'seniority-age-calculator',
  'lunar-solar-calendar',
  'password-generator',
]);

export const InternalToolPage: React.FC = () => {
  const { toolId = '' } = useParams();
  const resolvedId = resolveToolId(toolId);
  const tool = findToolById(resolvedId);

  useEffect(() => {
    if (!tool) return;
    recordRecentTool(tool.id);
    if (tool.kind === 'bento') {
      window.location.replace(getToolHref(tool));
    }
  }, [tool]);

  const loadingFallback = (
    <div
      style={{
        padding: '64px 20px',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: '0.95rem',
      }}
    >
      Đang tải công cụ...
    </div>
  );

  if (resolvedId === 'bcc-multi-split') {
    return (
      <Suspense fallback={loadingFallback}>
        <MultiSplitToolApp />
      </Suspense>
    );
  }

  if (QR_BARCODE_IDS.has(resolvedId as QrBarcodeToolId)) {
    return (
      <Suspense fallback={loadingFallback}>
        <QrToolPage toolId={resolvedId as QrBarcodeToolId} />
      </Suspense>
    );
  }

  if (VN_TEXT_IDS.has(resolvedId as VnTextToolId)) {
    return (
      <Suspense fallback={loadingFallback}>
        <VietnameseTextTools toolId={resolvedId as VnTextToolId} />
      </Suspense>
    );
  }

  if (OFFICE_IMAGE_IDS.has(resolvedId as OfficeImageToolId)) {
    return (
      <Suspense fallback={loadingFallback}>
        <OfficeImageTools toolId={resolvedId as OfficeImageToolId} />
      </Suspense>
    );
  }

  if (DATA_SPREADSHEET_IDS.has(resolvedId as DataSpreadsheetToolId)) {
    return (
      <Suspense fallback={loadingFallback}>
        <DataSpreadsheetTools toolId={resolvedId as DataSpreadsheetToolId} />
      </Suspense>
    );
  }

  if (TIME_ADMIN_IDS.has(resolvedId as TimeAdminToolId)) {
    return (
      <Suspense fallback={loadingFallback}>
        <TimeAdminTools toolId={resolvedId as TimeAdminToolId} />
      </Suspense>
    );
  }

  return (
    <HubShell>
      <div
        className="bento-card"
        style={{
          padding: '48px 24px',
          textAlign: 'center',
        }}
      >
        <h2 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '10px' }}>
          Không tìm thấy công cụ
        </h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '0.9rem' }}>
          Công cụ <code>{toolId}</code> không tồn tại trong hệ thống.
        </p>
        <Link to="/" className="btn btn-primary" style={{ textDecoration: 'none' }}>
          <ArrowLeft size={16} />
          <span>Quay về Trang chủ bccHub</span>
        </Link>
      </div>
    </HubShell>
  );
};
