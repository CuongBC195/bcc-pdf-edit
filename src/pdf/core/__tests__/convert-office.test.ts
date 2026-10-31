import { beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { setFontLoader } from '../fonts'
import { htmlToDocBlocks, parseCsvRows, renderBlocksToPdf } from '../docLayout'
import { convertExcelToPdf } from '../office'

beforeAll(() => {
  setFontLoader(async (file) => new Uint8Array(fs.readFileSync(path.resolve('public/fonts', file))))
})

describe('Waves 3–5 Core Modules (docLayout, office)', () => {
  it('parses CSV rows including quoted fields and renders to PDF', async () => {
    const csv = 'Họ tên,Đơn vị,Ghi chú\n"Nguyễn Văn A","Phòng Kỹ thuật","Có dấu, phẩy"\n"Trần Thị B","Phòng Nhân sự","Bình thường"'
    const rows = parseCsvRows(csv)
    expect(rows).toHaveLength(3)
    expect(rows[1][2]).toBe('Có dấu, phẩy')

    const pdfBytes = await renderBlocksToPdf(
      [
        { kind: 'heading', level: 1, text: 'Báo cáo Danh sách' },
        { kind: 'paragraph', text: 'Dữ liệu trích xuất từ hệ thống.' },
        { kind: 'table', headers: rows[0], rows: rows.slice(1) },
      ],
      { title: 'Test Report' },
    )
    const doc = await PDFDocument.load(pdfBytes)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1)
  })

  it('converts HTML strings into structured DocBlocks', () => {
    const html = '<h1>Tiêu đề chính</h1><p>Đoạn văn thứ nhất.</p><ul><li>Mục 1</li><li>Mục 2</li></ul>'
    const blocks = htmlToDocBlocks(html)
    expect(blocks.some((b) => b.kind === 'heading' && b.text.includes('Tiêu đề chính'))).toBe(true)
    expect(blocks.some((b) => b.kind === 'paragraph' && b.text.includes('Đoạn văn thứ nhất'))).toBe(true)
    expect(blocks.some((b) => b.kind === 'list')).toBe(true)
  })

  it('converts CSV spreadsheet buffer into multi-column PDF via convertExcelToPdf', async () => {
    const csvBytes = new TextEncoder().encode('STT,Nội dung,Số tiền\n1,Chi phí văn phòng,1500000\n2,Thiết bị mạng,3200000')
    const pdfBytes = await convertExcelToPdf(csvBytes.buffer as ArrayBuffer, 'bang-ke.csv')
    const doc = await PDFDocument.load(pdfBytes)
    expect(doc.getPageCount()).toBe(1)
  })
})
