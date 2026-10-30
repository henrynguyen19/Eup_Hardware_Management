/**
 * POST /api/ho-tro/weekly-export
 * Xuất báo cáo tuần Hỗ trợ kỹ thuật ra Excel.
 * Nhận JSON body chứa dữ liệu đã tổng hợp từ client (chart data + matrix).
 * Trả về .xlsx với 2 sheet: "Chi tiết theo ngày" + "Lỗi × Thiết bị"
 */
import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import * as XLSX from 'xlsx'

export const runtime = 'nodejs'

interface ExportBody {
  periodLabel:   string
  chartTotal:    Record<string, string | number>[]     // { date, 'Tổng YC', '#f Nhanh', 'Cần XĐ' }
  chartResolution: Record<string, string | number>[]  // { date, '#f Nhanh', '#n Thường', '#l Thấp', 'Hẹn', 'MBL' }
  chartStaff:    Record<string, string | number>[]    // { date, Kane, Stefan, ... }
  staffNames:    string[]
  errDevMatrix:  Record<string, Record<string, number>>
  matrixDevices: string[]
  byStaffTotal:  Record<string, number>
  byDeviceTotal: Record<string, number>
  byLocTotal:    Record<string, number>
  totalReq:      number
  fastPct:       number
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body: ExportBody = await req.json()
  const { periodLabel, chartTotal, chartResolution, chartStaff, staffNames, errDevMatrix, matrixDevices, byStaffTotal, byDeviceTotal, byLocTotal, totalReq, fastPct } = body

  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Chi tiết theo ngày ─────────────────────────────────────────────
  // Build a merged daily table: date | total | nhanh | thường | thấp | hẹn | MBL | staff1 | staff2...
  const resMap   = new Map(chartResolution.map(r => [r.date, r]))
  const staffMap = new Map(chartStaff.map(r => [r.date, r]))

  const dailyRows = chartTotal.map(row => {
    const date    = row.date as string
    const res     = resMap.get(date) ?? {}
    const staff   = staffMap.get(date) ?? {}
    const staffCols: Record<string, string | number> = {}
    for (const s of staffNames) {
      staffCols[s] = (staff[s] as number) || ''
    }
    return {
      'Ngày':          date,
      'Tổng':          row['Tổng YC']  ?? '',
      '#f Nhanh':      res['#f Nhanh'] ?? '',
      '#n Thường':     res['#n Thường'] ?? '',
      '#l Thấp':       res['#l Thấp']  ?? '',
      'Hẹn':           res['Hẹn']      ?? '',
      'MBL':           res['MBL']       ?? '',
      'Cần XĐ':        row['Cần XĐ']   ?? '',
      ...staffCols,
    }
  })

  // Total row
  function sumNum(arr: Record<string, string | number>[], key: string) {
    return arr.reduce((s, r) => s + (typeof r[key] === 'number' ? r[key] : 0), 0)
  }
  const staffTotals: Record<string, string | number> = {}
  for (const s of staffNames) staffTotals[s] = byStaffTotal[s] ?? ''

  dailyRows.push({
    'Ngày':      'Tổng cộng',
    'Tổng':      totalReq,
    '#f Nhanh':  sumNum(chartResolution, '#f Nhanh'),
    '#n Thường': sumNum(chartResolution, '#n Thường'),
    '#l Thấp':   sumNum(chartResolution, '#l Thấp'),
    'Hẹn':       sumNum(chartResolution, 'Hẹn'),
    'MBL':       sumNum(chartResolution, 'MBL'),
    'Cần XĐ':    sumNum(chartTotal, 'Cần XĐ'),
    ...staffTotals,
  })

  const ws1 = XLSX.utils.json_to_sheet(dailyRows)
  const staffColW = staffNames.map(() => ({ wch: 10 }))
  ws1['!cols'] = [
    { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 10 },
    ...staffColW,
  ]
  XLSX.utils.book_append_sheet(wb, ws1, 'Chi tiết theo ngày')

  // ── Sheet 2: Lỗi × Thiết bị matrix ─────────────────────────────────────────
  const errNames = Object.keys(errDevMatrix)
  if (errNames.length > 0 && matrixDevices.length > 0) {
    const matrixRows = errNames.map(err => {
      const devCounts = errDevMatrix[err] ?? {}
      const row: Record<string, string | number> = { 'Lỗi': err }
      let total = 0
      for (const dev of matrixDevices) {
        const cnt = devCounts[dev] ?? 0
        row[dev] = cnt || ''
        total += cnt
      }
      row['Tổng'] = total || ''
      return row
    })

    // Total row
    const totalRow: Record<string, string | number> = { 'Lỗi': 'Tổng' }
    for (const dev of matrixDevices) {
      let t = 0
      for (const err of errNames) t += errDevMatrix[err]?.[dev] ?? 0
      totalRow[dev] = t || ''
    }
    totalRow['Tổng'] = errNames.reduce((s, err) => {
      const d = errDevMatrix[err] ?? {}
      return s + Object.values(d).reduce((a, b) => a + b, 0)
    }, 0)
    matrixRows.push(totalRow)

    const ws2 = XLSX.utils.json_to_sheet(matrixRows)
    const devColW = matrixDevices.map(() => ({ wch: 12 }))
    ws2['!cols'] = [{ wch: 14 }, ...devColW, { wch: 8 }]
    XLSX.utils.book_append_sheet(wb, ws2, 'Lỗi × Thiết bị')
  }

  // ── Sheet 3: Tổng hợp ───────────────────────────────────────────────────────
  const summaryRows = [
    { 'Mục': 'Kỳ báo cáo', 'Giá trị': periodLabel },
    { 'Mục': 'Tổng yêu cầu', 'Giá trị': totalReq },
    { 'Mục': 'Tỉ lệ nhanh', 'Giá trị': `${fastPct}%` },
    { 'Mục': '', 'Giá trị': '' },
    { 'Mục': '--- THEO NHÂN VIÊN ---', 'Giá trị': '' },
    ...Object.entries(byStaffTotal).sort((a,b)=>b[1]-a[1]).map(([k,v]) => ({ 'Mục': k, 'Giá trị': v })),
    { 'Mục': '', 'Giá trị': '' },
    { 'Mục': '--- THEO THIẾT BỊ ---', 'Giá trị': '' },
    ...Object.entries(byDeviceTotal).sort((a,b)=>b[1]-a[1]).map(([k,v]) => ({ 'Mục': k, 'Giá trị': v })),
    { 'Mục': '', 'Giá trị': '' },
    { 'Mục': '--- THEO VĂN PHÒNG ---', 'Giá trị': '' },
    ...Object.entries(byLocTotal).sort((a,b)=>b[1]-a[1]).map(([k,v]) => ({ 'Mục': k, 'Giá trị': v })),
  ]
  const ws3 = XLSX.utils.json_to_sheet(summaryRows)
  ws3['!cols'] = [{ wch: 24 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, ws3, 'Tổng hợp')

  const buf      = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const date     = new Date().toISOString().split('T')[0]
  const filename = `hotro-weekly-${date}.xlsx`

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
