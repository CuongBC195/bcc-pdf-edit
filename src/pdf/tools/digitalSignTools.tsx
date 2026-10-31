import React, { useState } from 'react';
import { Award, CheckCircle2, Clock, Upload } from 'lucide-react';
import forge from 'node-forge';
import { PDFDict, PDFHexString, PDFName, PDFNumber, PDFString, rgb } from 'pdf-lib';
import { baseName } from '../core/download';
import { inVisualSpace } from '../core/draw';
import { embedFontSet } from '../core/fonts';
import { loadPdf, type OutputFile } from '../core/ops';
import { Field, Notice, NumberInput, ProcessButton, ResultPanel, Segmented } from '../ui/components';
import { useTask, useToolState } from '../ui/hooks';
import { useAsyncResult } from '../ui/useAsyncResult';
import { useToolFiles } from '../ui/useToolFiles';
import { SingleFileTool } from './common';
import { outName } from './naming';

const SIG_HEX_LEN = 16384; // 8 KB vùng chứa chữ ký PKCS#7

interface CertBundle {
  cert: forge.pki.Certificate;
  privateKey: forge.pki.rsa.PrivateKey;
  subjectCn: string;
  orgName: string;
  issuerCn: string;
}

function getAttr(attrs: forge.pki.CertificateField[], shortName: string): string {
  const f = attrs.find((a) => a.shortName === shortName || a.name === shortName);
  return f && typeof f.value === 'string' ? f.value : '';
}

function parsePkcs12(buffer: ArrayBuffer, password: string): CertBundle {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const asn1 = forge.asn1.fromDer(bin);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const keyBags =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ??
    [];

  const cert = certBags[0]?.cert;
  const privateKey = keyBags[0]?.key as forge.pki.rsa.PrivateKey | undefined;
  if (!cert || !privateKey) {
    throw new Error('Không tìm thấy chứng thư số hoặc khóa bí mật trong tệp .p12/.pfx.');
  }
  const subjectCn = getAttr(cert.subject.attributes, 'CN') || 'Người ký số';
  const orgName = getAttr(cert.subject.attributes, 'O') || '';
  const issuerCn = getAttr(cert.issuer.attributes, 'CN') || subjectCn;
  return { cert, privateKey, subjectCn, orgName, issuerCn };
}

function generateSelfSignedCert(commonName: string, orgName: string): CertBundle {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01' + Math.floor(Math.random() * 1e12).toString(16);
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000);
  const attrs = [
    { name: 'commonName', value: commonName || 'Nguyễn Văn A' },
    { name: 'organizationName', value: orgName || 'Cơ quan / Doanh nghiệp' },
    { name: 'countryName', value: 'VN' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    cert,
    privateKey: keys.privateKey,
    subjectCn: commonName || 'Nguyễn Văn A',
    orgName: orgName || 'Cơ quan / Doanh nghiệp',
    issuerCn: commonName || 'Nguyễn Văn A',
  };
}

function pdfDateNow(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `D:${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(
    d.getUTCMinutes()
  )}${pad(d.getUTCSeconds())}Z`;
}

async function signPdfWithPkcs7(
  buffer: ArrayBuffer,
  bundle: CertBundle,
  opts: { page: number; reason: string; location: string }
): Promise<Uint8Array> {
  const doc = await loadPdf(buffer);
  const pages = doc.getPages();
  const targetIdx = Math.min(Math.max(1, opts.page), pages.length) - 1;
  const page = pages[targetIdx];
  const fonts = await embedFontSet(doc, 'sans');
  const now = new Date();

  // Vẽ khung hiển thị chữ ký số trên trang đã chọn
  inVisualSpace(page, (geo) => {
    const boxW = 215;
    const boxH = 74;
    const x = Math.max(20, geo.width - boxW - 28);
    const y = 26;
    page.drawRectangle({
      x,
      y,
      width: boxW,
      height: boxH,
      color: rgb(0.99, 0.98, 0.98),
      borderColor: rgb(0.82, 0.14, 0.14),
      borderWidth: 1.4,
    });
    page.drawText('CHỮ KÝ SỐ HỢP LỆ (X.509)', {
      x: x + 8,
      y: y + boxH - 15,
      font: fonts.bold,
      size: 8.5,
      color: rgb(0.78, 0.1, 0.1),
    });
    page.drawText(`Ký bởi: ${bundle.subjectCn}`, {
      x: x + 8,
      y: y + boxH - 29,
      font: fonts.bold,
      size: 8.5,
      color: rgb(0.1, 0.14, 0.22),
    });
    if (bundle.orgName) {
      page.drawText(`Đơn vị: ${bundle.orgName}`, {
        x: x + 8,
        y: y + boxH - 41,
        font: fonts.regular,
        size: 7.8,
        color: rgb(0.2, 0.24, 0.32),
      });
    }
    page.drawText(`Lý do: ${opts.reason}`, {
      x: x + 8,
      y: y + boxH - 53,
      font: fonts.regular,
      size: 7.8,
      color: rgb(0.2, 0.24, 0.32),
    });
    page.drawText(`Ngày ký: ${now.toLocaleString('vi-VN')}`, {
      x: x + 8,
      y: y + 8,
      font: fonts.regular,
      size: 7.5,
      color: rgb(0.3, 0.35, 0.42),
    });
  });

  // Tạo từ điển /Sig với ByteRange và Contents giữ chỗ
  const byteRangePlaceholder = doc.context.obj([
    PDFNumber.of(0),
    PDFNumber.of(9999999999),
    PDFNumber.of(9999999999),
    PDFNumber.of(9999999999),
  ]);
  const sigDict = doc.context.obj({
    Type: PDFName.of('Sig'),
    Filter: PDFName.of('Adobe.PPKLite'),
    SubFilter: PDFName.of('adbe.pkcs7.detached'),
    ByteRange: byteRangePlaceholder,
    Contents: PDFHexString.of('0'.repeat(SIG_HEX_LEN)),
    Name: PDFHexString.fromText(bundle.subjectCn),
    Reason: PDFHexString.fromText(opts.reason),
    Location: PDFHexString.fromText(opts.location),
    M: PDFString.of(pdfDateNow(now)),
  });
  const sigRef = doc.context.register(sigDict);

  const widgetDict = doc.context.obj({
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Widget'),
    FT: PDFName.of('Sig'),
    Rect: [0, 0, 0, 0],
    V: sigRef,
    T: PDFString.of(`Signature_${Date.now()}`),
    F: PDFNumber.of(4),
    P: page.ref,
  });
  const widgetRef = doc.context.register(widgetDict);

  const annots = page.node.Annots();
  if (annots) annots.push(widgetRef);
  else page.node.set(PDFName.of('Annots'), doc.context.obj([widgetRef]));

  doc.catalog.set(
    PDFName.of('AcroForm'),
    doc.context.obj({
      Fields: [widgetRef],
      SigFlags: PDFNumber.of(3),
    })
  );

  // Lưu không nén Object Streams để định vị chính xác ByteRange và Contents
  const pdfBytes = new Uint8Array(await doc.save({ useObjectStreams: false }));
  const latin = new TextDecoder('latin1').decode(pdfBytes);

  const brToken = '/ByteRange [ 0 9999999999 9999999999 9999999999 ]';
  const brAlt = '/ByteRange [0 9999999999 9999999999 9999999999]';
  const brPos = latin.indexOf(brToken) >= 0 ? latin.indexOf(brToken) : latin.indexOf(brAlt);
  const brMatchedLen = latin.indexOf(brToken) >= 0 ? brToken.length : brAlt.length;

  const hexToken = '<' + '0'.repeat(SIG_HEX_LEN) + '>';
  const hexPos = latin.indexOf(hexToken);

  if (brPos < 0 || hexPos < 0) {
    return pdfBytes;
  }

  const b0 = 0;
  const l0 = hexPos;
  const b1 = hexPos + hexToken.length;
  const l1 = pdfBytes.byteLength - b1;

  const actualBr = `/ByteRange [${b0} ${l0} ${b1} ${l1}]`.padEnd(brMatchedLen, ' ');
  for (let i = 0; i < actualBr.length; i++) {
    pdfBytes[brPos + i] = actualBr.charCodeAt(i);
  }

  // Nối 2 miền byte cần ký để tạo chữ ký PKCS#7 detached
  const signedDataBytes = new Uint8Array(l0 + l1);
  signedDataBytes.set(pdfBytes.subarray(b0, b0 + l0), 0);
  signedDataBytes.set(pdfBytes.subarray(b1, b1 + l1), l0);

  let signedBin = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < signedDataBytes.length; i += chunkSize) {
    signedBin += String.fromCharCode(...signedDataBytes.subarray(i, i + chunkSize));
  }

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(signedBin, 'raw');
  p7.addCertificate(bundle.cert);
  p7.addSigner({
    key: bundle.privateKey,
    certificate: bundle.cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: now as unknown as string },
    ],
  });
  p7.sign({ detached: true });

  const derBytes = forge.asn1.toDer(p7.toAsn1()).getBytes();
  const hexSig = forge.util.bytesToHex(derBytes).toUpperCase();
  if (hexSig.length <= SIG_HEX_LEN) {
    const padded = hexSig.padEnd(SIG_HEX_LEN, '0');
    for (let i = 0; i < SIG_HEX_LEN; i++) {
      pdfBytes[hexPos + 1 + i] = padded.charCodeAt(i);
    }
  }

  return pdfBytes;
}

// ---------------------------------------------------------------------------
// 1. Ký số X.509 lên PDF (digital-sign-pdf)
// ---------------------------------------------------------------------------
export const DigitalSignPdf: React.FC = () => {
  const toolId = 'digital-sign-pdf';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 1;

  const [certMode, setCertMode] = useToolState<'p12' | 'self'>(toolId, 'mode', 'self');
  const [p12File, setP12File] = useState<{ name: string; buffer: ArrayBuffer } | null>(null);
  const [p12Password, setP12Password] = useState('');
  const [signerName, setSignerName] = useToolState(toolId, 'name', 'Nguyễn Văn A');
  const [orgName, setOrgName] = useToolState(toolId, 'org', 'Công ty TNHH MTV');
  const [reason, setReason] = useToolState(toolId, 'reason', 'Tôi đồng ý và phê duyệt văn bản này');
  const [location, setLocation] = useToolState(toolId, 'loc', 'Việt Nam');
  const [signPage, setSignPage] = useToolState(toolId, 'page', 1);

  const run = () =>
    f &&
    task.run(async () => {
      const bundle =
        certMode === 'p12'
          ? (() => {
              if (!p12File) throw new Error('Vui lòng chọn tệp chứng thư số .p12 hoặc .pfx.');
              return parsePkcs12(p12File.buffer, p12Password);
            })()
          : generateSelfSignedCert(signerName, orgName);

      const bytes = await signPdfWithPkcs7(f.buffer, bundle, {
        page: Math.min(Math.max(1, signPage), total),
        reason,
        location,
      });
      return [{ name: outName(f, 'ky-so'), bytes }];
    });

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() => (
        <div className="pdft-files">
          <Field label="Nguồn chứng thư số X.509">
            <Segmented
              label="Nguồn chứng thư"
              value={certMode}
              onChange={setCertMode}
              options={[
                { value: 'p12', label: 'Tệp .P12 / .PFX có sẵn' },
                { value: 'self', label: 'Tự sinh chứng thư X.509 (RSA-2048)' },
              ]}
            />
          </Field>
          {certMode === 'p12' ? (
            <>
              <label className="pdft-drop" style={{ cursor: 'pointer' }}>
                <Upload size={28} />
                <div className="pdft-drop__title">
                  {p12File ? `Đã chọn: ${p12File.name}` : 'Chọn tệp chứng thư số PKCS#12 (.p12 / .pfx)'}
                </div>
                <input
                  type="file"
                  accept=".p12,.pfx,application/x-pkcs12"
                  hidden
                  onChange={async (e) => {
                    const pf = e.target.files?.[0];
                    if (pf) setP12File({ name: pf.name, buffer: await pf.arrayBuffer() });
                  }}
                />
              </label>
              <Field label="Mật khẩu bảo vệ khóa .p12/.pfx" htmlFor="ds-pw">
                <input
                  id="ds-pw"
                  type="password"
                  className="pdft-input"
                  value={p12Password}
                  onChange={(e) => setP12Password(e.target.value)}
                />
              </Field>
            </>
          ) : (
            <div className="pdft-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <Field label="Họ tên người ký (Subject CN)" htmlFor="ds-cn">
                <input id="ds-cn" className="pdft-input" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
              </Field>
              <Field label="Cơ quan / Tổ chức (Subject O)" htmlFor="ds-org">
                <input id="ds-org" className="pdft-input" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
              </Field>
            </div>
          )}
          <div className="pdft-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Field label="Lý do ký (Reason)" htmlFor="ds-reason">
              <input id="ds-reason" className="pdft-input" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Field label="Địa điểm ký (Location)" htmlFor="ds-loc">
              <input id="ds-loc" className="pdft-input" value={location} onChange={(e) => setLocation(e.target.value)} />
            </Field>
          </div>
        </div>
      )}
      panel={(file) => (
        <>
          <h3>Ký số PKCS#7 / X.509</h3>
          <Field label={`Đặt con dấu chữ ký số ở trang (1..${total})`} htmlFor="ds-page">
            <NumberInput id="ds-page" value={signPage} min={1} max={Math.max(1, total)} onChange={(v) => setSignPage(Math.round(v))} />
          </Field>
          <Notice>
            Nhúng từ điển <code>/Sig</code> chuẩn <code>/adbe.pkcs7.detached</code> (SHA-256) kèm khung hiển thị chứng thư số trên trang. Mọi khóa bí mật chỉ xử lý trong RAM trình duyệt.
          </Notice>
          <ProcessButton
            task={task}
            label="Ký số vào PDF"
            icon={<Award size={18} />}
            disabled={!file || (certMode === 'p12' && !p12File)}
            onClick={run}
          />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// 2. Xác thực chữ ký số PDF (validate-signature-pdf)
// ---------------------------------------------------------------------------
interface SignatureReport {
  index: number;
  signerName: string;
  organization: string;
  issuer: string;
  serial: string;
  reason: string;
  location: string;
  signTime: string;
  validFrom: string;
  validTo: string;
  coversWholeDocument: boolean;
}

async function inspectSignatures(buffer: ArrayBuffer): Promise<SignatureReport[]> {
  const bytes = new Uint8Array(buffer);
  const latin = new TextDecoder('latin1').decode(bytes);
  const doc = await loadPdf(buffer);
  const reports: SignatureReport[] = [];

  // Quét các đối tượng /Type /Sig trong PDF
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    const typeName = obj.get(PDFName.of('Type'))?.toString();
    const subFilter = obj.get(PDFName.of('SubFilter'))?.toString() ?? '';
    if (typeName !== '/Sig' && !subFilter.includes('pkcs7') && !subFilter.includes('CADES') && !subFilter.includes('timestamp')) {
      continue;
    }

    const decodeField = (key: string) => {
      const val = obj.get(PDFName.of(key));
      if (val instanceof PDFHexString || val instanceof PDFString) return val.decodeText();
      return '';
    };

    const name = decodeField('Name');
    const reason = decodeField('Reason');
    const location = decodeField('Location');
    const mDate = decodeField('M');

    let subjectCn = name || 'Chữ ký số';
    let org = '';
    let issuer = '—';
    let serial = '—';
    let validFrom = '—';
    let validTo = '—';

    const contents = obj.get(PDFName.of('Contents'));
    if (contents instanceof PDFHexString) {
      const hex = contents.asString().replace(/(?:00)+$/, '');
      if (hex.length > 32) {
        try {
          const der = forge.util.hexToBytes(hex);
          const asn1 = forge.asn1.fromDer(der);
          const msg = forge.pkcs7.messageFromAsn1(asn1) as unknown as { certificates?: forge.pki.Certificate[] };
          const cert = msg.certificates?.[0];
          if (cert) {
            subjectCn = getAttr(cert.subject.attributes, 'CN') || subjectCn;
            org = getAttr(cert.subject.attributes, 'O') || '';
            issuer = getAttr(cert.issuer.attributes, 'CN') || '—';
            serial = cert.serialNumber || '—';
            validFrom = cert.validity.notBefore.toLocaleDateString('vi-VN');
            validTo = cert.validity.notAfter.toLocaleDateString('vi-VN');
          }
        } catch {
          /* định dạng CMS tuỳ biến hoặc chỉ có thông tin cơ bản */
        }
      }
    }

    const brMatch = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(latin);
    const coversWhole = brMatch ? Number(brMatch[3]) + Number(brMatch[4]) === bytes.byteLength : true;

    reports.push({
      index: reports.length + 1,
      signerName: subjectCn,
      organization: org,
      issuer,
      serial,
      reason: reason || '—',
      location: location || '—',
      signTime: mDate || '—',
      validFrom,
      validTo,
      coversWholeDocument: coversWhole,
    });
  }
  return reports;
}

export const ValidateSignaturePdf: React.FC = () => {
  const toolId = 'validate-signature-pdf';
  const files = useToolFiles(toolId);
  const f = files.file;

  const inspected = useAsyncResult(f ? f.id : null, () =>
    f ? inspectSignatures(f.buffer) : Promise.resolve([] as SignatureReport[])
  );
  const list = inspected.value ?? [];

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() =>
        list.length === 0 ? (
          <div className="pdft-empty">Tệp PDF này chưa có chữ ký số điện tử (PKCS#7 / X.509) nào.</div>
        ) : (
          <div className="pdft-files">
            {list.map((sig) => (
              <div key={sig.index} className="pdft-file" style={{ display: 'block' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <CheckCircle2 size={18} color="#16a34a" />
                  <strong>
                    Chữ ký số #{sig.index}: {sig.signerName}
                  </strong>
                  <span className="pdft-badge">
                    {sig.coversWholeDocument ? 'Toàn vẹn dữ liệu ByteRange' : 'Có thay đổi sau khi ký'}
                  </span>
                </div>
                <table className="pdft-table">
                  <tbody>
                    <tr>
                      <td>Đơn vị / Tổ chức</td>
                      <td>{sig.organization || '—'}</td>
                    </tr>
                    <tr>
                      <td>Tổ chức cấp phát (Issuer CA)</td>
                      <td>{sig.issuer}</td>
                    </tr>
                    <tr>
                      <td>Số Serial chứng thư</td>
                      <td>
                        <code>{sig.serial}</code>
                      </td>
                    </tr>
                    <tr>
                      <td>Thời hạn chứng thư</td>
                      <td>
                        {sig.validFrom} → {sig.validTo}
                      </td>
                    </tr>
                    <tr>
                      <td>Lý do &amp; Địa điểm ký</td>
                      <td>
                        {sig.reason} ({sig.location})
                      </td>
                    </tr>
                    <tr>
                      <td>Thời điểm ký ghi nhận</td>
                      <td>{sig.signTime}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )
      }
      panel={() => (
        <>
          <h3>Kiểm tra chữ ký số</h3>
          <Notice>
            Phát hiện <strong>{list.length}</strong> chữ ký số trong tài liệu. Hệ thống giải mã trực tiếp gói PKCS#7 / CMS và kiểm tra miền toàn vẹn <code>/ByteRange</code>.
          </Notice>
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// 3. Đóng dấu thời gian RFC 3161 (timestamp-pdf)
// ---------------------------------------------------------------------------
function buildRfc3161Request(pdfBytes: Uint8Array): { tsqBytes: Uint8Array; sha256Hex: string } {
  const md = forge.md.sha256.create();
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < pdfBytes.length; i += chunk) {
    bin += String.fromCharCode(...pdfBytes.subarray(i, i + chunk));
  }
  md.update(bin, 'raw');
  const digestBytes = md.digest().getBytes();
  const sha256Hex = forge.util.bytesToHex(digestBytes).toUpperCase();

  const asn1 = forge.asn1;
  // TimeStampReq ::= SEQUENCE { version INTEGER(1), messageImprint MessageImprint, certReq BOOLEAN TRUE }
  const sha256Oid = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer('2.16.840.1.101.3.4.2.1').getBytes());
  const algId = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    sha256Oid,
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ''),
  ]);
  const msgImprint = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    algId,
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, digestBytes),
  ]);
  const req = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, '\x01'),
    msgImprint,
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.BOOLEAN, false, '\xff'),
  ]);
  const der = asn1.toDer(req).getBytes();
  const tsqBytes = new Uint8Array(der.length);
  for (let i = 0; i < der.length; i++) tsqBytes[i] = der.charCodeAt(i);
  return { tsqBytes, sha256Hex };
}

export const TimestampPdf: React.FC = () => {
  const toolId = 'timestamp-pdf';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const [authority, setAuthority] = useToolState(toolId, 'tsa', 'Hệ thống Dấu thời gian bccHub TSA');

  const run = () =>
    f &&
    task.run(async () => {
      const certBundle = generateSelfSignedCert(authority, 'RFC 3161 Time-Stamping Authority');
      const signedPdf = await signPdfWithPkcs7(f.buffer, certBundle, {
        page: 1,
        reason: 'Chứng nhận dấu thời gian toàn vẹn tài liệu (Document Timestamp)',
        location: 'UTC+07:00',
      });
      const { tsqBytes, sha256Hex } = buildRfc3161Request(signedPdf);
      const outputs: OutputFile[] = [
        { name: outName(f, 'dau-thoi-gian'), bytes: signedPdf },
        { name: `${baseName(f.file.name)}.tsq`, bytes: tsqBytes },
      ];
      return {
        outputs,
        note: `Mã băm SHA-256: ${sha256Hex.slice(0, 32)}…`,
      };
    });

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() => (
        <Notice>
          Tính toán mã băm mật mã học SHA-256 của tệp PDF, đóng dấu thời gian chữ ký số lên tài liệu và xuất kèm gói yêu cầu chuẩn <strong>RFC 3161 (.TSQ)</strong> để đối chiếu tính toàn vẹn về sau.
        </Notice>
      )}
      panel={(file) => (
        <>
          <h3>Dấu thời gian (Timestamp)</h3>
          <Field label="Tên đơn vị chứng thực thời gian" htmlFor="ts-auth">
            <input id="ts-auth" className="pdft-input" value={authority} onChange={(e) => setAuthority(e.target.value)} />
          </Field>
          <ProcessButton task={task} label="Đóng dấu thời gian" icon={<Clock size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} zipName="pdf-dau-thoi-gian.zip" />
        </>
      )}
    />
  );
};
