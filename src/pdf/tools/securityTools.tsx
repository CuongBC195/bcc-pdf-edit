import React, { useState } from 'react';
import { KeyRound, Lock, ShieldAlert, ShieldCheck, Unlock } from 'lucide-react';
import { baseName } from '../core/download';
import { runQpdf } from '../core/qpdf';
import { sanitizePdf, type SanitizeOptions } from '../core/structure';
import { Field, Notice, ProcessButton, ResultPanel, Segmented, Toggle, ToolLayout, ToolShell } from '../ui/components';
import { useTask, useToolState } from '../ui/hooks';
import { useToolFiles } from '../ui/useToolFiles';
import { SingleFileTool } from './common';
import { outName } from './naming';

// ---------------------------------------------------------------------------
// 1. Đặt mật khẩu bảo vệ PDF (protect-pdf)
// ---------------------------------------------------------------------------
export const ProtectPdf: React.FC = () => {
  const toolId = 'protect-pdf';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;

  const [userPw, setUserPw] = useState('');
  const [ownerPw, setOwnerPw] = useState('');
  const [printPerm, setPrintPerm] = useToolState<'full' | 'low' | 'none'>(toolId, 'print', 'full');
  const [allowModify, setAllowModify] = useToolState(toolId, 'modify', false);
  const [allowExtract, setAllowExtract] = useToolState(toolId, 'extract', false);

  const run = () =>
    f &&
    task.run(async () => {
      const effectiveOwner = ownerPw.trim() || userPw.trim();
      if (!effectiveOwner) throw new Error('Vui lòng nhập ít nhất một mật khẩu.');
      const res = await runQpdf(f.buffer, [
        '--encrypt',
        userPw,
        effectiveOwner,
        '256',
        `--print=${printPerm}`,
        `--modify=${allowModify ? 'all' : 'none'}`,
        `--extract=${allowExtract ? 'y' : 'n'}`,
        '--',
      ]);
      return [{ name: outName(f, 'mat-khau'), bytes: res.output }];
    });

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() => (
        <div className="pdft-files">
          <Field label="Mật khẩu mở tệp (User Password — người nhận phải nhập mới xem được)" htmlFor="pw-user">
            <input
              id="pw-user"
              type="password"
              className="pdft-input"
              placeholder="Nhập mật khẩu mở tệp..."
              value={userPw}
              onChange={(e) => setUserPw(e.target.value)}
            />
          </Field>
          <Field label="Mật khẩu chủ sở hữu (Owner Password — để trống sẽ dùng chung mật khẩu mở tệp)" htmlFor="pw-owner">
            <input
              id="pw-owner"
              type="password"
              className="pdft-input"
              placeholder="Mật khẩu quản trị quyền in/sửa..."
              value={ownerPw}
              onChange={(e) => setOwnerPw(e.target.value)}
            />
          </Field>
        </div>
      )}
      panel={(file) => (
        <>
          <h3>Mã hóa AES-256</h3>
          <Field label="Quyền in ấn">
            <Segmented
              label="Quyền in ấn"
              value={printPerm}
              onChange={setPrintPerm}
              options={[
                { value: 'full', label: 'Cho in nét' },
                { value: 'low', label: 'In độ nét thấp' },
                { value: 'none', label: 'Cấm in' },
              ]}
            />
          </Field>
          <Toggle checked={allowModify} onChange={setAllowModify} label="Cho phép chỉnh sửa nội dung / trang" />
          <Toggle checked={allowExtract} onChange={setAllowExtract} label="Cho phép sao chép chữ và hình ảnh" />
          <Notice>Sử dụng chuẩn mã hóa AES 256-bit (qpdf). Tệp được mã hóa ngay trên máy của bạn.</Notice>
          <ProcessButton
            task={task}
            label="Khóa mật khẩu PDF"
            icon={<Lock size={18} />}
            disabled={!file || (!userPw.trim() && !ownerPw.trim())}
            onClick={run}
          />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// 2. Mở khóa mật khẩu PDF (unlock-pdf)
// ---------------------------------------------------------------------------
export const UnlockPdf: React.FC = () => {
  const toolId = 'unlock-pdf';
  const task = useTask();
  const [rawFile, setRawFile] = useState<{ name: string; buffer: ArrayBuffer } | null>(null);
  const [password, setPassword] = useState('');

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setRawFile({ name: f.name, buffer: await f.arrayBuffer() });
  };

  const run = () =>
    rawFile &&
    task.run(async () => {
      const res = await runQpdf(rawFile.buffer, [`--password=${password}`, '--decrypt']);
      return [{ name: `${baseName(rawFile.name)}_mo-khoa.pdf`, bytes: res.output }];
    });

  return (
    <ToolShell toolId={toolId}>
      <ToolLayout
        main={
          <div>
            <label className="pdft-drop" style={{ cursor: 'pointer', marginBottom: 16 }}>
              <Unlock size={36} />
              <div className="pdft-drop__title">
                {rawFile ? `Đã chọn: ${rawFile.name}` : 'Chọn tệp PDF đang bị khóa mật khẩu'}
              </div>
              <div className="pdft-drop__sub">Nhập mật khẩu hiện tại ở khung bên phải để gỡ bỏ vĩnh viễn mật khẩu khỏi tệp.</div>
              <input type="file" accept="application/pdf,.pdf" hidden onChange={onPick} />
            </label>
          </div>
        }
        panel={
          <>
            <h3>Gỡ mật khẩu PDF</h3>
            <Field label="Mật khẩu hiện tại của tệp" htmlFor="ul-pw">
              <input
                id="ul-pw"
                type="password"
                className="pdft-input"
                placeholder="Nhập mật khẩu để giải mã..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Notice>Nếu tệp chỉ khóa quyền in/sao chép (không hỏi mật khẩu khi mở), bạn có thể để trống ô mật khẩu.</Notice>
            <ProcessButton task={task} label="Mở khóa PDF" icon={<Unlock size={18} />} disabled={!rawFile} onClick={run} />
            <ResultPanel task={task} />
          </>
        }
      />
    </ToolShell>
  );
};

// ---------------------------------------------------------------------------
// 3. Gỡ bỏ hạn chế in & sao chép (remove-restrictions)
// ---------------------------------------------------------------------------
export const RemoveRestrictions: React.FC = () => {
  const toolId = 'remove-restrictions';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const [ownerPw, setOwnerPw] = useState('');

  const run = () =>
    f &&
    task.run(async () => {
      const args = ownerPw ? [`--password=${ownerPw}`, '--decrypt'] : ['--decrypt'];
      const res = await runQpdf(f.buffer, args);
      return [{ name: outName(f, 'go-han-che'), bytes: res.output }];
    });

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() => (
        <Notice>
          Gỡ bỏ các hạn chế cấm in ấn, cấm sao chép chữ và cấm chỉnh sửa trang đối với các tệp PDF mở xem được bình thường nhưng bị khóa quyền chủ sở hữu (Owner Password).
        </Notice>
      )}
      panel={(file) => (
        <>
          <h3>Gỡ hạn chế quyền PDF</h3>
          <Field label="Mật khẩu gốc (nếu tệp yêu cầu)" htmlFor="rr-pw">
            <input
              id="rr-pw"
              type="password"
              className="pdft-input"
              placeholder="Để trống nếu tệp mở xem được..."
              value={ownerPw}
              onChange={(e) => setOwnerPw(e.target.value)}
            />
          </Field>
          <ProcessButton task={task} label="Gỡ bỏ hạn chế" icon={<KeyRound size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// 4. Đổi phân quyền PDF (change-permissions)
// ---------------------------------------------------------------------------
export const ChangePermissions: React.FC = () => {
  const toolId = 'change-permissions';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;

  const [ownerPw, setOwnerPw] = useState('');
  const [userPw, setUserPw] = useState('');
  const [printPerm, setPrintPerm] = useToolState<'full' | 'low' | 'none'>(toolId, 'print', 'full');
  const [modifyPerm, setModifyPerm] = useToolState<'all' | 'annotate' | 'form' | 'none'>(toolId, 'modify', 'none');
  const [allowExtract, setAllowExtract] = useToolState(toolId, 'extract', false);

  const run = () =>
    f &&
    task.run(async () => {
      const effectiveOwner = ownerPw.trim() || userPw.trim() || 'bcc-owner';
      const res = await runQpdf(f.buffer, [
        '--encrypt',
        userPw,
        effectiveOwner,
        '256',
        `--print=${printPerm}`,
        `--modify=${modifyPerm}`,
        `--extract=${allowExtract ? 'y' : 'n'}`,
        '--',
      ]);
      return [{ name: outName(f, 'phan-quyen'), bytes: res.output }];
    });

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() => (
        <div className="pdft-files">
          <Field label="Mật khẩu quản trị quyền (Owner Password)" htmlFor="cp-owner">
            <input
              id="cp-owner"
              type="password"
              className="pdft-input"
              placeholder="Nhập mật khẩu bảo vệ cấu hình quyền..."
              value={ownerPw}
              onChange={(e) => setOwnerPw(e.target.value)}
            />
          </Field>
          <Field label="Mật khẩu mở tệp (để trống nếu cho phép mọi người mở xem)" htmlFor="cp-user">
            <input
              id="cp-user"
              type="password"
              className="pdft-input"
              placeholder="Để trống = mở không cần mật khẩu"
              value={userPw}
              onChange={(e) => setUserPw(e.target.value)}
            />
          </Field>
        </div>
      )}
      panel={(file) => (
        <>
          <h3>Thiết lập quyền hạn</h3>
          <Field label="Quyền in">
            <Segmented
              label="Quyền in"
              value={printPerm}
              onChange={setPrintPerm}
              options={[
                { value: 'full', label: 'Đầy đủ' },
                { value: 'low', label: 'Độ nét thấp' },
                { value: 'none', label: 'Không cho in' },
              ]}
            />
          </Field>
          <Field label="Quyền sửa đổi" htmlFor="cp-mod">
            <select
              id="cp-mod"
              className="pdft-select"
              value={modifyPerm}
              onChange={(e) => setModifyPerm(e.target.value as typeof modifyPerm)}
            >
              <option value="none">Không cho phép sửa đổi</option>
              <option value="form">Chỉ cho điền biểu mẫu</option>
              <option value="annotate">Cho điền biểu mẫu & thêm chú thích</option>
              <option value="all">Cho phép mọi chỉnh sửa</option>
            </select>
          </Field>
          <Toggle checked={allowExtract} onChange={setAllowExtract} label="Cho phép sao chép văn bản & trích xuất trang" />
          <ProcessButton task={task} label="Lưu phân quyền" icon={<ShieldCheck size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// 5. Làm sạch PDF (sanitize-pdf)
// ---------------------------------------------------------------------------
const DEFAULT_SANITIZE: SanitizeOptions = {
  javascript: true,
  embeddedFiles: true,
  externalLinks: false,
  metadata: true,
  forms: false,
  annotations: false,
};

export const SanitizePdf: React.FC = () => {
  const toolId = 'sanitize-pdf';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const [opts, setOpts] = useToolState<SanitizeOptions>(toolId, 'opts', DEFAULT_SANITIZE);

  const run = () =>
    f &&
    task.run(async () => {
      const r = await sanitizePdf(f.buffer, opts);
      return {
        outputs: [{ name: outName(f, 'lam-sach'), bytes: r.bytes }],
        note: r.report.removed.length
          ? `Đã dọn sạch: ${r.report.removed.join(', ')}.`
          : 'Không phát hiện thành phần nguy hiểm nào trong các mục đã chọn.',
      };
    });

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() => (
        <div className="pdft-files">
          <Toggle
            checked={opts.javascript}
            onChange={(v) => setOpts({ ...opts, javascript: v })}
            label="Gỡ bỏ mã thực thi JavaScript, OpenAction và hành động tự chạy (/AA)"
          />
          <Toggle
            checked={opts.metadata}
            onChange={(v) => setOpts({ ...opts, metadata: v })}
            label="Xóa thông tin ẩn của tài liệu (Document Info & XMP Metadata)"
          />
          <Toggle
            checked={opts.embeddedFiles}
            onChange={(v) => setOpts({ ...opts, embeddedFiles: v })}
            label="Xóa tệp đính kèm ẩn (EmbeddedFiles & FileAttachment)"
          />
          <Toggle
            checked={opts.externalLinks}
            onChange={(v) => setOpts({ ...opts, externalLinks: v })}
            label="Gỡ liên kết nhảy ra trang web ngoài / mở ứng dụng hệ thống (URI, Launch)"
          />
          <Toggle
            checked={opts.forms}
            onChange={(v) => setOpts({ ...opts, forms: v })}
            label="Làm phẳng và xóa cấu trúc biểu mẫu tương tác (AcroForm / XFA)"
          />
          <Toggle
            checked={opts.annotations}
            onChange={(v) => setOpts({ ...opts, annotations: v })}
            label="Xóa toàn bộ ghi chú và bình luận trên trang"
          />
        </div>
      )}
      panel={(file) => (
        <>
          <h3>Làm sạch bảo mật PDF</h3>
          <Notice>Loại bỏ mã độc tiềm ẩn, kịch bản tự chạy và dữ liệu nhạy cảm trước khi phát hành hồ sơ.</Notice>
          <ProcessButton task={task} label="Làm sạch tệp PDF" icon={<ShieldAlert size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

