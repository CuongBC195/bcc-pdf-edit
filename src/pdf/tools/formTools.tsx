import React, { useState } from 'react';
import { ClipboardEdit, FileSpreadsheet, Layers } from 'lucide-react';
import { PDFCheckBox, PDFDropdown, PDFName, PDFOptionList, PDFRadioGroup, PDFTextField } from 'pdf-lib';
import { fileSignature } from '../core/fileStore';
import { embedFont } from '../core/fonts';
import { applyObjects, newObjectId, type EditorObject, type FieldType } from '../core/objects';
import { loadPdf, savePdf, type PdfInput } from '../core/ops';
import { compactPdf, runQpdf } from '../core/qpdf';
import { PageCanvasEditor } from '../ui/PageCanvasEditor';
import { Field, Notice, NumberInput, ProcessButton, ResultPanel, Segmented, Toggle } from '../ui/components';
import { useTask, useToolState } from '../ui/hooks';
import { useAsyncResult } from '../ui/useAsyncResult';
import { useToolFiles } from '../ui/useToolFiles';
import { SingleFileTool } from './common';
import { outName } from './naming';

interface FormFieldInfo {
  name: string;
  kind: 'text' | 'checkbox' | 'dropdown' | 'optionlist' | 'radio' | 'other';
  value: string;
  options: string[];
  readOnly: boolean;
}

async function inspectFormFields(input: PdfInput): Promise<FormFieldInfo[]> {
  const doc = await loadPdf(input);
  let fields;
  try {
    fields = doc.getForm().getFields();
  } catch {
    return [];
  }
  return fields.map((f) => {
    const name = f.getName();
    const readOnly = f.isReadOnly();
    if (f instanceof PDFTextField) {
      return { name, kind: 'text', value: f.getText() ?? '', options: [], readOnly };
    }
    if (f instanceof PDFCheckBox) {
      return { name, kind: 'checkbox', value: f.isChecked() ? 'true' : 'false', options: [], readOnly };
    }
    if (f instanceof PDFDropdown) {
      return { name, kind: 'dropdown', value: f.getSelected()[0] ?? '', options: f.getOptions(), readOnly };
    }
    if (f instanceof PDFOptionList) {
      return { name, kind: 'optionlist', value: f.getSelected()[0] ?? '', options: f.getOptions(), readOnly };
    }
    if (f instanceof PDFRadioGroup) {
      return { name, kind: 'radio', value: f.getSelected() ?? '', options: f.getOptions(), readOnly };
    }
    return { name, kind: 'other', value: '', options: [], readOnly };
  });
}

async function fillFormFields(
  input: PdfInput,
  values: Record<string, string>,
  flatten: boolean
): Promise<Uint8Array> {
  const doc = await loadPdf(input);
  const form = doc.getForm();
  const font = await embedFont(doc, 'sans', 'regular');
  for (const f of form.getFields()) {
    const name = f.getName();
    if (!(name in values)) continue;
    const val = values[name];
    try {
      if (f instanceof PDFTextField) {
        f.setText(val);
        f.updateAppearances(font);
      } else if (f instanceof PDFCheckBox) {
        if (val === 'true') f.check();
        else f.uncheck();
      } else if (f instanceof PDFDropdown || f instanceof PDFOptionList) {
        if (val) f.select(val);
      } else if (f instanceof PDFRadioGroup) {
        if (val) f.select(val);
      }
    } catch {
      /* bỏ qua trường lỗi định dạng */
    }
  }
  try {
    form.updateFieldAppearances(font);
  } catch {
    /* một số trường đặc biệt không hỗ trợ tự vẽ lại */
  }
  if (flatten) {
    try {
      form.flatten();
    } catch {
      /* giữ nguyên nếu flatten gặp lỗi */
    }
  }
  return savePdf(doc);
}

// ---------------------------------------------------------------------------
// 1. Điền biểu mẫu PDF (form-filler)
// ---------------------------------------------------------------------------
export const FormFiller: React.FC = () => {
  const toolId = 'form-filler';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const sig = f ? fileSignature(f.file) : '';
  const total = f?.pageCount ?? 0;

  const inspected = useAsyncResult(f ? f.id : null, () =>
    f ? inspectFormFields(f.buffer) : Promise.resolve([] as FormFieldInfo[])
  );
  const fields = inspected.value ?? [];

  const [values, setValues] = useToolState<Record<string, string>>(toolId, 'values', {}, sig);
  const [flatten, setFlatten] = useToolState(toolId, 'flatten', false);
  const [page, setPage] = useState(1);
  const [objects, setObjects] = useToolState<EditorObject[]>(toolId, 'objects', [], sig);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const getValue = (fld: FormFieldInfo) => (fld.name in values ? values[fld.name] : fld.value);
  const setValue = (name: string, val: string) => setValues({ ...values, [name]: val });

  const run = () =>
    f &&
    task.run(async () => {
      let bytes = fields.length ? await fillFormFields(f.buffer, values, flatten) : new Uint8Array(f.buffer);
      if (objects.length) bytes = await applyObjects(bytes, objects);
      return [{ name: outName(f, 'da-dien'), bytes }];
    });

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <>
          {fields.length > 0 ? (
            <div className="pdft-files" style={{ marginBottom: 16 }}>
              {fields.map((fld) => (
                <div key={fld.name} className="pdft-file" style={{ gridTemplateColumns: '220px 1fr' }}>
                  <div>
                    <strong>{fld.name}</strong>
                    <div className="pdft-file__meta">{fld.kind}</div>
                  </div>
                  {fld.kind === 'checkbox' ? (
                    <Toggle
                      checked={getValue(fld) === 'true'}
                      onChange={(v) => setValue(fld.name, v ? 'true' : 'false')}
                      label="Đánh dấu chọn"
                    />
                  ) : fld.kind === 'dropdown' || fld.kind === 'optionlist' || fld.kind === 'radio' ? (
                    <select
                      className="pdft-select"
                      aria-label={fld.name}
                      value={getValue(fld)}
                      onChange={(e) => setValue(fld.name, e.target.value)}
                    >
                      <option value="">— Chọn —</option>
                      {fld.options.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="pdft-input"
                      aria-label={fld.name}
                      value={getValue(fld)}
                      onChange={(e) => setValue(fld.name, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginBottom: 10 }}>
              <Notice>
                Tệp này không có trường biểu mẫu điện tử (AcroForm). Bạn có thể bấm trực tiếp lên trang bên dưới để đặt hộp chữ điền vào chỗ trống.
              </Notice>
            </div>
          )}
          <PageCanvasEditor
            buffer={file.buffer}
            pageCount={total}
            page={Math.min(page, Math.max(1, total))}
            onPageChange={setPage}
            objects={objects}
            onChange={setObjects}
            selectedId={selectedId}
            onSelect={setSelectedId}
            addKind="text"
            makeObject={(kind, p, rect) => ({
              id: newObjectId(),
              page: p,
              kind,
              ...rect,
              text: 'Điền thông tin',
              fontSize: 12,
              family: 'sans',
              color: '#111827',
            })}
          />
        </>
      )}
      panel={(file) => (
        <>
          <h3>Điền biểu mẫu</h3>
          <Notice>
            {fields.length > 0
              ? `Tìm thấy ${fields.length} trường biểu mẫu điện tử. Nhập giá trị ở danh sách bên trái (hỗ trợ tiếng Việt).`
              : 'Kéo hoặc bấm lên trang để chèn chữ vào đúng dòng chấm trên mẫu đơn.'}
          </Notice>
          {fields.length > 0 && (
            <Toggle
              checked={flatten}
              onChange={setFlatten}
              label="Làm phẳng sau khi điền (khóa nội dung, không cho sửa tiếp)"
            />
          )}
          <ProcessButton task={task} label="Xuất biểu mẫu đã điền" icon={<ClipboardEdit size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// 2. Tạo biểu mẫu PDF (form-creator)
// ---------------------------------------------------------------------------
const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Ô chữ 1 dòng' },
  { value: 'multiline', label: 'Ô chữ nhiều dòng' },
  { value: 'checkbox', label: 'Ô tích chọn (Checkbox)' },
  { value: 'dropdown', label: 'Danh sách thả xuống' },
  { value: 'radio', label: 'Nút chọn đơn (Radio)' },
  { value: 'signature', label: 'Ô chữ ký' },
];

export const FormCreator: React.FC = () => {
  const toolId = 'form-creator';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const sig = f ? fileSignature(f.file) : '';
  const total = f?.pageCount ?? 0;

  const [page, setPage] = useState(1);
  const [objects, setObjects] = useToolState<EditorObject[]>(toolId, 'objects', [], sig);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fieldType, setFieldType] = useToolState<FieldType>(toolId, 'fieldType', 'text');

  const selected = objects.find((o) => o.id === selectedId) ?? null;
  const updateField = (patch: Partial<NonNullable<EditorObject['field']>>) => {
    if (!selected?.field) return;
    setObjects(objects.map((o) => (o.id === selected.id ? { ...o, field: { ...o.field!, ...patch } } : o)));
  };

  const run = () =>
    f &&
    task.run(async () => [
      {
        name: outName(f, 'bieu-mau'),
        bytes: await applyObjects(f.buffer, objects),
      },
    ]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <>
          <div className="pdft-bar" style={{ marginBottom: 10 }}>
            {FIELD_TYPES.map((ft) => (
              <button
                key={ft.value}
                type="button"
                className={`btn btn-sm ${fieldType === ft.value ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFieldType(ft.value)}
              >
                + {ft.label}
              </button>
            ))}
          </div>
          <PageCanvasEditor
            buffer={file.buffer}
            pageCount={total}
            page={Math.min(page, Math.max(1, total))}
            onPageChange={setPage}
            objects={objects}
            onChange={setObjects}
            selectedId={selectedId}
            onSelect={setSelectedId}
            addKind="field"
            makeObject={(_, p, rect) => ({
              id: newObjectId(),
              page: p,
              kind: 'field',
              ...rect,
              fontSize: 12,
              field: {
                type: fieldType,
                name: `truong_${objects.length + 1}`,
                options: fieldType === 'dropdown' ? ['Lựa chọn 1', 'Lựa chọn 2'] : undefined,
                required: false,
                defaultValue: '',
              },
            })}
          />
        </>
      )}
      panel={(file) => (
        <>
          <h3>Tạo biểu mẫu điện tử</h3>
          <Notice>Chọn loại trường ở thanh phía trên trang rồi kéo chuột trên trang PDF để đặt vị trí trường nhập liệu.</Notice>
          {selected?.field && (
            <div className="pdft-panel__group" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
              <strong>Thuộc tính trường đang chọn</strong>
              <Field label="Tên định danh trường" htmlFor="fc-name">
                <input
                  id="fc-name"
                  className="pdft-input"
                  value={selected.field.name}
                  onChange={(e) => updateField({ name: e.target.value })}
                />
              </Field>
              <Field label="Giá trị mặc định" htmlFor="fc-def">
                <input
                  id="fc-def"
                  className="pdft-input"
                  value={selected.field.defaultValue ?? ''}
                  onChange={(e) => updateField({ defaultValue: e.target.value })}
                />
              </Field>
              {selected.field.type === 'dropdown' && (
                <Field label="Các lựa chọn (mỗi dòng 1 mục)" htmlFor="fc-opts">
                  <textarea
                    id="fc-opts"
                    className="pdft-textarea"
                    rows={3}
                    value={(selected.field.options ?? []).join('\n')}
                    onChange={(e) => updateField({ options: e.target.value.split('\n').filter(Boolean) })}
                  />
                </Field>
              )}
              <Field label="Cỡ chữ (pt)" htmlFor="fc-size">
                <NumberInput
                  id="fc-size"
                  value={selected.fontSize ?? 12}
                  min={8}
                  max={36}
                  onChange={(v) => setObjects(objects.map((o) => (o.id === selected.id ? { ...o, fontSize: v } : o)))}
                />
              </Field>
              <Toggle
                checked={!!selected.field.required}
                onChange={(v) => updateField({ required: v })}
                label="Bắt buộc nhập (Required)"
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setObjects(objects.filter((o) => o.id !== selected.id));
                  setSelectedId(null);
                }}
              >
                Xóa trường này
              </button>
            </div>
          )}
          <ProcessButton task={task} label="Lưu biểu mẫu PDF" icon={<FileSpreadsheet size={18} />} disabled={!file || objects.length === 0} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// 3. Làm phẳng PDF (flatten-pdf)
// ---------------------------------------------------------------------------
async function flattenDocument(input: PdfInput, mode: 'all' | 'forms' | 'annotations'): Promise<Uint8Array> {
  const doc = await loadPdf(input);
  if (mode === 'all' || mode === 'forms') {
    try {
      doc.getForm().flatten();
    } catch {
      /* bỏ qua nếu biểu mẫu trống hoặc thiếu font */
    }
    doc.catalog.delete(PDFName.of('AcroForm'));
  }
  const saved = await savePdf(doc);
  if (mode === 'all' || mode === 'annotations') {
    const res = await runQpdf(saved, ['--flatten-annotations=all', '--object-streams=generate']);
    if (res.output.byteLength) return res.output;
  }
  return compactPdf(saved);
}

export const FlattenPdf: React.FC = () => {
  const toolId = 'flatten-pdf';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const [mode, setMode] = useToolState<'all' | 'forms' | 'annotations'>(toolId, 'mode', 'all');

  const run = () =>
    f &&
    task.run(async () => [
      {
        name: outName(f, 'lam-phang'),
        bytes: await flattenDocument(f.buffer, mode),
      },
    ]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() => (
        <Notice>
          Làm phẳng (Flatten) sẽ hợp nhất các ô nhập biểu mẫu, con dấu, chữ ký và chú thích thành nội dung cố định trên trang để người nhận không thể sửa đổi hoặc xóa rời từng phần.
        </Notice>
      )}
      panel={(file) => (
        <>
          <h3>Làm phẳng PDF</h3>
          <Field label="Thành phần cần làm phẳng">
            <Segmented
              label="Thành phần làm phẳng"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'all', label: 'Biểu mẫu + Chú thích' },
                { value: 'forms', label: 'Chỉ biểu mẫu' },
                { value: 'annotations', label: 'Chỉ chú thích' },
              ]}
            />
          </Field>
          <ProcessButton task={task} label="Làm phẳng PDF" icon={<Layers size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};
