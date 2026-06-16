import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import type { DailyRecord } from '@/types/ho-tro'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// ── CSV parser ───────────────────────────────────────────────
// Parse một dòng CSV có dấu ngoặc kép
function parseCSVRow(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; continue } // escaped quote
      inQuote = !inQuote
      continue
    }
    if (c === ',' && !inQuote) { result.push(cur.trim()); cur = ''; continue }
    cur += c
  }
  result.push(cur.trim())
  return result
}

// Parse date "DD/MM/YYYY" → sortKey "YYYY-MM-DD"
function parseDateDMY(str: string): { display: string; sortKey: string } | null {
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const d = m[1].padStart(2, '0')
  const mo = m[2].padStart(2, '0')
  const y = m[3]
  return { display: str, sortKey: `${y}-${mo}-${d}` }
}

function numStr(s: string): number {
  if (!s || s === '') return 0
  return parseFloat(s) || 0
}

// ── Parse CSV text → DailyRecord[] ──────────────────────────
function parseCSV(csvText: string): DailyRecord[] {
  const lines = csvText.split('\n')
  const result: DailyRecord[] = []

  // Skip line 0 (it's the gviz packed header)
  // Data rows start from line 1
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue

    const c = parseCSVRow(line)

    // col[1] must be a date in DD/MM/YYYY format
    const di = parseDateDMY(c[1] ?? '')
    if (!di) continue

    result.push({
      date: di.display,
      sortKey: di.sortKey,
      total_requests: numStr(c[2]),
      avg_time:       numStr(c[3]),
      max_time:       numStr(c[4]),
      devices: {
        'VN88 2G':   numStr(c[5]),
        'VN88 4G':   numStr(c[6]),
        'VN88 4GH':  numStr(c[7]),
        'S168':      numStr(c[8]),
        'DVR':       numStr(c[9]),
        'FUEL':      numStr(c[10]),
        'Go168':     numStr(c[11]),
        'MT99':      numStr(c[12]),
        'C43&H5':    numStr(c[13]),
        'BW':        numStr(c[14]),
        'Phan mem':  numStr(c[15]),
      },
      resolution: {
        'Chua xu ly': numStr(c[16]),
        'Hen xu ly':  numStr(c[17]),
        'Ngay 1':     numStr(c[18]),
        'Ngay 2':     numStr(c[19]),
        'Ngay 3':     numStr(c[20]),
        'Ngay 4':     numStr(c[21]),
        'Ngay 5':     numStr(c[22]),
        'Tong':       numStr(c[23]),
      },
      locations: {
        'Ha Noi':     numStr(c[24]),
        'Hai Phong':  numStr(c[25]),
        'Da Nang':    numStr(c[26]),
        'HCM':        numStr(c[27]),
        'Binh Duong': numStr(c[28]),
      },
      channels: {
        'Zalo':      numStr(c[29]),
        'Hotline':   numStr(c[30]),
        'Ngay nghi': numStr(c[31]),
      },
      errors: {
        'ACC':   numStr(c[32]),
        'RFID':  numStr(c[33]),
        'PW':    numStr(c[34]),
        'GPS':   numStr(c[35]),
        'GSM':   numStr(c[36]),
        'IO':    numStr(c[37]),
        'SS':    numStr(c[38]),
        'DMS':   numStr(c[39]),
        'ADAS':  numStr(c[40]),
        'NC':    numStr(c[41]),
        'SP':    numStr(c[42]),
        'FS100': numStr(c[43]),
        'SOJI':  numStr(c[44]),
      },
    })
  }

  return result.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
}

// ── GET handler ──────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check ho_tro permission
  const { data: permData } = await adminClient()
    .from('user_permissions_view')
    .select('permissions')
    .eq('user_id', user.id)
    .single()
  const perms: string[] = permData?.permissions ?? []
  const hasAccess = perms.includes('ho_tro:read') || perms.includes('admin:users')
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sp = new URL(req.url).searchParams
  const sheetId = sp.get('sheetId')
  const month   = sp.get('month')
  const year    = sp.get('year') // short "26" hoặc full "2026"

  if (!sheetId || !month || !year) {
    return NextResponse.json({ error: 'Missing sheetId, month, year' }, { status: 400 })
  }

  const yearShort = year.length === 4 ? year.slice(2) : year
  const sheetName = `báo cáo tháng ${month}/${yearShort}`

  try {
    // Dùng tqx=out:csv thay vì out:json để tránh lỗi parsedNumHeaders
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const csvText = await res.text()

    // Kiểm tra nếu response là HTML (sheet không tồn tại / không có quyền)
    if (csvText.trimStart().startsWith('<')) {
      return NextResponse.json({
        error: `Sheet "${sheetName}" không tồn tại hoặc chưa public`,
        rows: [],
        sheetName,
      })
    }

    const rows = parseCSV(csvText)

    return NextResponse.json({ rows, sheetName, month, year: yearShort })
  } catch (err) {
    console.error('[ho-tro/sheets]', err)
    return NextResponse.json({ error: String(err), rows: [], sheetName })
  }
}
