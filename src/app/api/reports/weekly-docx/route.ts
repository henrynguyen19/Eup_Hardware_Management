/**
 * POST /api/reports/weekly-docx
 * Tạo file báo cáo tuần Word (.docx) từ dữ liệu HoTro + Sửa chữa.
 *
 * Body (JSON):
 *   weekLabel: string                     — "19/10/2026 – 24/10/2026"
 *   hotro: {
 *     days:        DayRow[]              — chi tiết theo ngày
 *     errMatrix:   ErrorMatrix           — Error × Device
 *     staffNames:  string[]
 *     chartImages: { id: string; base64: string }[]  — PNG charts từ browser
 *   }
 *   repair: {
 *     summary:     RepairSummary         — total/repaired/warranty/noFault/broken
 *     byProduct:   ByProductRow[]
 *     errorMatrix: ErrorMatrix           — Device × Error hashtag
 *     chartImages: { id: string; base64: string }[]
 *   }
 *
 * Response: .docx file (binary)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import JSZip from 'jszip'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DayRow {
  date: string
  total: number
  fast: number
  normal: number
  slow: number
  scheduled: number
  followup: number
  staff: Record<string, number>
}

interface ErrorMatrix {
  errors: string[]
  devices: string[]
  matrix: Record<string, Record<string, number>>
  totalByError: Record<string, number>
  totalByDevice: Record<string, number>
}

interface RepairSummary {
  total: number
  repaired: number; repairedPct: number
  warranty: number; warrantyPct: number
  noFault: number;  noFaultPct: number
  broken: number;   brokenPct: number
}

interface ByProductRow {
  product: string
  delivered: number
  repaired: number
  warranty: number
  noFault: number
  broken: number
}

interface ReportBody {
  weekLabel: string
  hotro: {
    days:       DayRow[]
    errMatrix:  ErrorMatrix
    staffNames: string[]
    chartImages: { id: string; base64: string }[]
  }
  repair: {
    summary:     RepairSummary
    byProduct:   ByProductRow[]
    errorMatrix: ErrorMatrix
    chartImages: { id: string; base64: string }[]
  }
}

// ── XML helpers ────────────────────────────────────────────────────────────────

function esc(s: string | number): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function hexToRGB(hex: string): string {
  // Trả "RRGGBB" không có #
  return hex.replace('#', '')
}

function cellXml(
  text: string | number,
  opts: {
    bold?: boolean
    color?: string   // "#RRGGBB"
    bg?: string      // "#RRGGBB"
    size?: number    // half-points, default 18 (=9pt)
    align?: 'left' | 'center' | 'right'
    colspan?: number
    width?: number   // dxa
  } = {}
): string {
  const { bold, color, bg, size = 18, align = 'center', colspan, width } = opts
  const bgXml  = bg ? `<w:shd w:val="clear" w:color="auto" w:fill="${hexToRGB(bg)}"/>` : ''
  const colXml = colspan ? `<w:gridSpan w:val="${colspan}"/>` : ''
  const widXml = width   ? `<w:tcW w:w="${width}" w:type="dxa"/>` : ''
  const boldXml  = bold  ? '<w:b/>' : ''
  const colorXml = color ? `<w:color w:val="${hexToRGB(color)}"/>` : ''
  const display = text === 0 || text === '' ? '–' : esc(text)
  return `<w:tc>
  <w:tcPr>${widXml}${colXml}${bgXml}</w:tcPr>
  <w:p>
    <w:pPr><w:jc w:val="${align}"/><w:spacing w:before="0" w:after="0"/></w:pPr>
    <w:r><w:rPr>${boldXml}${colorXml}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>
      <w:t xml:space="preserve">${display}</w:t>
    </w:r>
  </w:p>
</w:tc>`
}

function headerCell(text: string, bg = '1E3A5F', width?: number): string {
  return cellXml(text, { bold: true, color: '#FFFFFF', bg: `#${bg}`, size: 18, align: 'center', width })
}

function tableXml(rows: string[], colWidths?: number[]): string {
  const gridCols = colWidths
    ? colWidths.map(w => `<w:gridCol w:w="${w}"/>`).join('')
    : ''
  return `<w:tbl>
  <w:tblPr>
    <w:tblStyle w:val="TableGrid"/>
    <w:tblW w:w="0" w:type="auto"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
      <w:left w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
      <w:right w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
    </w:tblBorders>
    <w:tblCellMar>
      <w:top w:w="60" w:type="dxa"/>
      <w:left w:w="80" w:type="dxa"/>
      <w:bottom w:w="60" w:type="dxa"/>
      <w:right w:w="80" w:type="dxa"/>
    </w:tblCellMar>
  </w:tblPr>
  <w:tblGrid>${gridCols}</w:tblGrid>
  ${rows.map(r => `<w:tr>${r}</w:tr>`).join('\n')}
</w:tbl>`
}

function paraXml(text: string, opts: { bold?: boolean; size?: number; color?: string; align?: string } = {}): string {
  const { bold, size = 18, color, align } = opts
  const jc    = align ? `<w:jc w:val="${align}"/>` : ''
  const boldX = bold ? '<w:b/>' : ''
  const colX  = color ? `<w:color w:val="${hexToRGB(color)}"/>` : ''
  return `<w:p>
  <w:pPr><w:spacing w:before="60" w:after="60"/>${jc}</w:pPr>
  <w:r><w:rPr>${boldX}${colX}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>
    <w:t xml:space="preserve">${esc(text)}</w:t>
  </w:r>
</w:p>`
}

// Chèn ảnh vào Word document (base64 PNG)
function imageXml(
  rId: string,
  widthEmu: number,
  heightEmu: number
): string {
  return `<w:p>
  <w:pPr><w:jc w:val="center"/><w:spacing w:before="80" w:after="80"/></w:pPr>
  <w:r>
    <w:rPr/>
    <w:drawing>
      <wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
                 distT="0" distB="0" distL="0" distR="0">
        <wp:extent cx="${widthEmu}" cy="${heightEmu}"/>
        <wp:effectExtent l="0" t="0" r="0" b="0"/>
        <wp:docPr id="1" name="img_${rId}"/>
        <wp:cNvGraphicFramePr>
          <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
        </wp:cNvGraphicFramePr>
        <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:nvPicPr>
                <pic:cNvPr id="0" name="img_${rId}"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>
</w:p>`
}

// ── Section builders ──────────────────────────────────────────────────────────

function buildSectionVI(body: ReportBody): string {
  const { hotro, weekLabel } = body
  const { days, errMatrix, staffNames, chartImages } = hotro
  const total      = days.reduce((s, d) => s + d.total, 0)
  const totalFast  = days.reduce((s, d) => s + d.fast,  0)
  const fastPct    = total ? Math.round(totalFast / total * 100) : 0
  const staffTotals = staffNames.reduce((acc, s) => {
    acc[s] = days.reduce((sum, d) => sum + (d.staff[s] ?? 0), 0)
    return acc
  }, {} as Record<string, number>)

  const xmlParts: string[] = []

  // KPI line
  xmlParts.push(paraXml(
    `Tuần: ${weekLabel}  |  Tổng: ${total}  |  Nhanh: ${fastPct}%  |  ${staffNames.map(s => `${s}: ${staffTotals[s]}`).join('  ')}`,
    { size: 18, color: '444444' }
  ))

  // ── Daily detail table ──
  const dayCols = ['Ngày','Tổng','Nhanh','Thường','Thấp','Hẹn', ...staffNames]
  const dayColW = [1000, 700, 800, 800, 700, 700, ...staffNames.map(() => 900)]

  const dayHdrRow = dayCols.map((h, i) => headerCell(h, '1E3A5F', dayColW[i])).join('')
  const dayRows: string[] = [dayHdrRow]

  days.forEach((d, ri) => {
    const bg = ri % 2 ? 'F0F4F8' : 'FFFFFF'
    const cells = [
      cellXml(d.date,      { align: 'left', size: 16, bg: `#${bg}`, width: dayColW[0] }),
      cellXml(d.total,     { bold: true, size: 16, bg: `#${bg}`, width: dayColW[1] }),
      cellXml(d.fast,      { size: 16, color: '#16a34a', bg: `#${bg}`, width: dayColW[2] }),
      cellXml(d.normal,    { size: 16, bg: `#${bg}`, width: dayColW[3] }),
      cellXml(d.slow || 0, { size: 16, color: d.slow ? '#dc2626' : undefined, bg: `#${bg}`, width: dayColW[4] }),
      cellXml(d.scheduled || 0, { size: 16, bg: `#${bg}`, width: dayColW[5] }),
      ...staffNames.map((s, si) => cellXml(d.staff[s] ?? 0, { size: 16, bg: `#${bg}`, width: dayColW[6 + si] })),
    ]
    dayRows.push(cells.join(''))
  })

  // Total row
  const totalCells = [
    cellXml('Tổng', { bold: true, align: 'left', size: 16, bg: '#DBEAFE', width: dayColW[0] }),
    cellXml(total,  { bold: true, size: 16, bg: '#DBEAFE', width: dayColW[1] }),
    cellXml(totalFast, { bold: true, size: 16, color: '#16a34a', bg: '#DBEAFE', width: dayColW[2] }),
    cellXml(days.reduce((s,d) => s+d.normal, 0), { bold: true, size: 16, bg: '#DBEAFE', width: dayColW[3] }),
    cellXml(days.reduce((s,d) => s+d.slow, 0),   { bold: true, size: 16, bg: '#DBEAFE', width: dayColW[4] }),
    cellXml(days.reduce((s,d) => s+d.scheduled, 0), { bold: true, size: 16, bg: '#DBEAFE', width: dayColW[5] }),
    ...staffNames.map((s, si) => cellXml(staffTotals[s], { bold: true, size: 16, bg: '#DBEAFE', width: dayColW[6 + si] })),
  ]
  dayRows.push(totalCells.join(''))
  xmlParts.push(tableXml(dayRows, dayColW))

  // ── Error × Device matrix ──
  xmlParts.push(paraXml(''))
  const { errors, devices, matrix, totalByError, totalByDevice } = errMatrix
  const ERR_BGS: Record<string, string> = {
    'No Connect': 'FFE0E0', 'RFID': 'EDE9FE', 'ACC': 'FEF9C3',
    'PW': 'DBEAFE', 'Support': 'E0F2FE', 'GPS': 'DCFCE7',
    'GSM': 'CFFAFE', 'Power': 'DBEAFE', 'SD Card': 'FEF9C3',
  }
  const mxCols = ['Lỗi', ...devices, 'Tổng']
  const mxColW = [1400, ...devices.map(() => 900), 800]

  const mxHdrRow = mxCols.map((h, i) => headerCell(h, '1E3A5F', mxColW[i])).join('')
  const mxRows: string[] = [mxHdrRow]

  errors.forEach(err => {
    const bg = '#' + (ERR_BGS[err] ?? 'FFFFFF')
    const cells = [
      cellXml(err, { bold: true, align: 'left', size: 16, bg, width: mxColW[0] }),
      ...devices.map((dev, di) => cellXml(matrix[err]?.[dev] ?? 0, { size: 16, bg, width: mxColW[1 + di] })),
      cellXml(totalByError[err] ?? 0, { bold: true, size: 16, bg, width: mxColW[mxColW.length - 1] }),
    ]
    mxRows.push(cells.join(''))
  })

  // Total row
  const mxTotalCells = [
    cellXml('Tổng', { bold: true, align: 'left', size: 16, bg: '#E2E8F0', width: mxColW[0] }),
    ...devices.map((dev, di) => cellXml(totalByDevice[dev] ?? 0, { bold: true, size: 16, bg: '#E2E8F0', width: mxColW[1 + di] })),
    cellXml(Object.values(totalByError).reduce((s, v) => s + v, 0), { bold: true, size: 16, bg: '#E2E8F0', width: mxColW[mxColW.length - 1] }),
  ]
  mxRows.push(mxTotalCells.join(''))
  xmlParts.push(tableXml(mxRows, mxColW))

  // ── Chart images ──
  for (const img of chartImages) {
    xmlParts.push(`__IMG_PLACEHOLDER_${img.id}__`)
  }

  return xmlParts.join('\n')
}

function buildSectionVII(body: ReportBody): string {
  const { repair } = body
  const { summary, byProduct, errorMatrix, chartImages } = repair

  const xmlParts: string[] = []

  // Outcome summary table (1 big row)
  const outcomes = [
    { label: 'Repaired',  count: summary.repaired, pct: summary.repairedPct, color: '22c55e' },
    { label: 'Warranty',  count: summary.warranty, pct: summary.warrantyPct, color: 'f59e0b' },
    { label: 'No Fault',  count: summary.noFault,  pct: summary.noFaultPct,  color: '3b82f6' },
    { label: 'Broken',    count: summary.broken,   pct: summary.brokenPct,   color: 'ef4444' },
  ]
  const outColW = 2250 // 9000 / 4
  const outRows = [
    outcomes.map(o => cellXml(o.count, { bold: true, size: 52, color: `#${o.color}`, bg: `#${o.color}22`, align: 'center', width: outColW })).join(''),
    outcomes.map(o => cellXml(`${o.label}  ${o.pct}%`, { bold: true, size: 20, color: `#${o.color}`, bg: `#${o.color}11`, align: 'center', width: outColW })).join(''),
  ]
  xmlParts.push(paraXml(`Tổng hoàn thành: ${summary.total}`, { size: 18, color: '444444' }))
  xmlParts.push(tableXml(outRows, [outColW, outColW, outColW, outColW]))

  // By product table
  xmlParts.push(paraXml(''))
  const prodCols = ['Thiết bị','Đã nhận','Đã sửa','Bảo hành','Không lỗi','Báo phế']
  const prodBgs  = ['E2E8F0','E2E8F0','DCFCE7','FEF9C3','DBEAFE','FFE4E6']
  const prodColW = [1200,1000,1000,1200,1200,1000]
  const prodColors = [undefined, undefined, '#15803d','#b45309','#1d4ed8','#dc2626']

  const prodHdrRow = prodCols.map((h, i) => cellXml(h, { bold: true, size: 18, bg: `#${prodBgs[i]}`, align: 'center', width: prodColW[i] })).join('')
  const prodRows: string[] = [prodHdrRow]

  byProduct.forEach((p, ri) => {
    const bg = ri % 2 ? '#F8FAFC' : '#FFFFFF'
    const vals = [p.product, p.delivered, p.repaired, p.warranty, p.noFault, p.broken]
    prodRows.push(vals.map((v, ci) => cellXml(v, {
      bold: ci === 0, align: ci === 0 ? 'left' : 'center',
      size: 18, color: prodColors[ci], bg, width: prodColW[ci]
    })).join(''))
  })

  const prodTotals = [
    'Tổng', summary.total, summary.repaired, summary.warranty, summary.noFault, summary.broken
  ]
  prodRows.push(prodTotals.map((v, ci) => cellXml(v, {
    bold: true, align: ci === 0 ? 'left' : 'center',
    size: 18, color: prodColors[ci], bg: '#E2E8F0', width: prodColW[ci]
  })).join(''))
  xmlParts.push(tableXml(prodRows, prodColW))

  // ── Error × Device hashtag matrix ──
  if (errorMatrix.errors.length > 0) {
    xmlParts.push(paraXml(''))
    xmlParts.push(paraXml('Phân tích lỗi theo thiết bị (từ ghi chú #hashtag):', { bold: true, size: 18 }))

    const { errors, devices, matrix, totalByError, totalByDevice } = errorMatrix
    const emCols = ['Lỗi', ...devices, 'Tổng']
    const emColW = [1400, ...devices.map(() => 900), 800]
    const ERR_BGS: Record<string, string> = {
      'No Connect': 'FFE0E0', 'RFID': 'EDE9FE', 'ACC': 'FEF9C3',
      'PW': 'DBEAFE', 'Support': 'E0F2FE', 'GPS': 'DCFCE7',
      'GSM': 'CFFAFE', 'Power': 'DBEAFE', 'SD Card': 'FEF9C3',
    }

    const emHdrRow = emCols.map((h, i) => headerCell(h, '1E3A5F', emColW[i])).join('')
    const emRows: string[] = [emHdrRow]

    errors.forEach(err => {
      const bg = '#' + (ERR_BGS[err] ?? 'FFFFFF')
      emRows.push([
        cellXml(err, { bold: true, align: 'left', size: 16, bg, width: emColW[0] }),
        ...devices.map((dev, di) => cellXml(matrix[err]?.[dev] ?? 0, { size: 16, bg, width: emColW[1 + di] })),
        cellXml(totalByError[err] ?? 0, { bold: true, size: 16, bg, width: emColW[emColW.length - 1] }),
      ].join(''))
    })

    emRows.push([
      cellXml('Tổng', { bold: true, align: 'left', size: 16, bg: '#E2E8F0', width: emColW[0] }),
      ...devices.map((dev, di) => cellXml(totalByDevice[dev] ?? 0, { bold: true, size: 16, bg: '#E2E8F0', width: emColW[1 + di] })),
      cellXml(Object.values(totalByError).reduce((s, v) => s + v, 0), { bold: true, size: 16, bg: '#E2E8F0', width: emColW[emColW.length - 1] }),
    ].join(''))

    xmlParts.push(tableXml(emRows, emColW))
  }

  // Charts
  for (const img of chartImages) {
    xmlParts.push(`__IMG_PLACEHOLDER_${img.id}__`)
  }

  return xmlParts.join('\n')
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body: ReportBody = await req.json()

  // Đọc Word template
  const templatePath = path.join(process.cwd(), 'public', 'templates', 'weekly_report_template.docx')
  if (!fs.existsSync(templatePath)) {
    return NextResponse.json({ error: 'Template not found' }, { status: 500 })
  }
  const templateBuf = fs.readFileSync(templatePath)

  const zip = await JSZip.loadAsync(templateBuf)
  const docXml = await zip.file('word/document.xml')!.async('string')

  // ── Tìm anchor paragraphs ──
  // Anchor VI: "errors happen in week"
  // Anchor VII: "device repaired by week"
  const VI_ANCHOR  = /errors happen in week/i
  const VII_ANCHOR = /device repaired by week/i

  // Build content XML
  const sectionVIContent   = buildSectionVI(body)
  const sectionVIIContent  = buildSectionVII(body)

  // ── Xử lý ảnh: đăng ký relationships + thay placeholder ──
  const allImages = [
    ...body.hotro.chartImages,
    ...body.repair.chartImages,
  ]

  // Đọc relationships file
  const relsPath = 'word/_rels/document.xml.rels'
  const relsXml  = await zip.file(relsPath)!.async('string')

  // Tìm max rId hiện có
  const existingRIds = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map(m => parseInt(m[1]))
  let nextRId = Math.max(0, ...existingRIds) + 1

  const rIdMap: Record<string, string> = {}  // imageId → rId
  let newRelsXml = relsXml.replace('</Relationships>', '')

  for (const img of allImages) {
    const rId      = `rId${nextRId++}`
    const imgName  = `media/report_img_${img.id}.png`
    rIdMap[img.id] = rId

    // Lưu ảnh vào zip
    const base64Data = img.base64.replace(/^data:image\/png;base64,/, '')
    const imgBuf = Buffer.from(base64Data, 'base64')
    zip.file(`word/${imgName}`, imgBuf)

    // Thêm relationship
    newRelsXml += `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${imgName}"/>\n`
  }
  newRelsXml += '</Relationships>'
  zip.file(relsPath, newRelsXml)

  // Thay image placeholder bằng XML thật
  // Width: 6 inches = 6 * 914400 emu = 5486400; height ~3 inches = 2743200
  const IMAGE_W = 5486400
  const IMAGE_H = 2400000

  function resolveImgPlaceholders(xml: string): string {
    return xml.replace(/__IMG_PLACEHOLDER_([^_]+)__/g, (_match, imgId) => {
      const rId = rIdMap[imgId]
      if (!rId) return ''
      return imageXml(rId, IMAGE_W, IMAGE_H)
    })
  }

  // ── Inject content vào document XML ──
  // Tách document XML thành các paragraphs
  // Tìm paragraph chứa anchor text → chèn content sau paragraph đó
  let newDocXml = docXml

  // Helper: tìm vị trí kết thúc của paragraph chứa pattern
  function injectAfterParagraph(xml: string, pattern: RegExp, inject: string): string {
    const paras = xml.split(/(?=<w:p[ >])/g)
    const idx = paras.findIndex(p => pattern.test(p))
    if (idx < 0) return xml + inject  // fallback: append at end
    paras.splice(idx + 1, 0, inject)
    return paras.join('')
  }

  const viContent  = resolveImgPlaceholders(sectionVIContent)
  const viiContent = resolveImgPlaceholders(sectionVIIContent)

  newDocXml = injectAfterParagraph(newDocXml, VI_ANCHOR,  viContent)
  newDocXml = injectAfterParagraph(newDocXml, VII_ANCHOR, viiContent)

  zip.file('word/document.xml', newDocXml)

  // Trả về file
  const outBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

  const weekSlug = body.weekLabel.replace(/[^0-9]/g, '_').replace(/_+/g, '_')
  const filename = `Bao_cao_tuan_${weekSlug}.docx`

  return new Response(outBuf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
