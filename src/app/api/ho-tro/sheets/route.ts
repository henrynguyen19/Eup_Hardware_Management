import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import type { DailyRecord } from '@/types/ho-tro'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// ── Helpers ─────────────────────────────────────────────────
function parseGviz(text: string) {
  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]+?)\);\s*$/)
  if (!match) throw new Error('Invalid gviz response')
  return JSON.parse(match[1])
}

function num(cell: unknown): number {
  if (!cell || typeof cell !== 'object') return 0
  const c = cell as { v?: unknown }
  if (c.v === null || c.v === undefined) return 0
  return typeof c.v === 'number' ? c.v : parseFloat(String(c.v)) || 0
}

function dateInfo(cell: unknown): { display: string; sortKey: string } | null {
  if (!cell || typeof cell !== 'object') return null
  const c = cell as { v?: unknown; f?: string }
  if (c.v === null || c.v === undefined) return null

  let sortKey = ''
  let display = c.f ?? ''

  if (typeof c.v === 'string' && c.v.startsWith('Date(')) {
    const m = c.v.match(/Date\((\d+),(\d+),(\d+)\)/)
    if (m) {
      const y = parseInt(m[1])
      const mo = parseInt(m[2]) + 1 // 0-indexed → 1-indexed
      const d = parseInt(m[3])
      sortKey = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      if (!display) display = `${d}/${mo}/${y}`
    }
  }
  return sortKey ? { display, sortKey } : null
}

function parseRows(rows: unknown[]): DailyRecord[] {
  const result: DailyRecord[] = []
  for (const row of rows) {
    const r = row as { c: unknown[] }
    const c = r.c ?? []

    // col index 1 = date cell
    const di = dateInfo(c[1])
    if (!di) continue

    // Skip summary/total rows (no date value)
    const totalRequests = num(c[2])

    result.push({
      date: di.display,
      sortKey: di.sortKey,
      total_requests: totalRequests,
      avg_time: num(c[3]),
      max_time: num(c[4]),
      devices: {
        'VN88 2G':   num(c[5]),
        'VN88 4G':   num(c[6]),
        'VN88 4GH':  num(c[7]),
        'S168':      num(c[8]),
        'DVR':       num(c[9]),
        'FUEL':      num(c[10]),
        'Go168':     num(c[11]),
        'MT99':      num(c[12]),
        'C43&H5':    num(c[13]),
        'BW':        num(c[14]),
        'Phần mềm':  num(c[15]),
      },
      resolution: {
        'Chưa xử lý': num(c[16]),
        'Hẹn xử lý':  num(c[17]),
        'Ngày 1':     num(c[18]),
        'Ngày 2':     num(c[19]),
        'Ngày 3':     num(c[20]),
        'Ngày 4':     num(c[21]),
        'Ngày 5':     num(c[22]),
        'Tổng':       num(c[23]),
      },
      locations: {
        'Hà Nội':     num(c[24]),
        'Hải Phòng':  num(c[25]),
        'Đà Nẵng':    num(c[26]),
        'HCM':        num(c[27]),
        'Bình Dương': num(c[28]),
      },
      channels: {
        'Zalo':      num(c[29]),
        'Hotline':   num(c[30]),
        'Ngày nghỉ': num(c[31]),
      },
      errors: {
        'ACC':  num(c[32]),
        'RFID': num(c[33]),
        'PW':   num(c[34]),
        'GPS':  num(c[35]),
        'GSM':  num(c[36]),
        'IO':   num(c[37]),
        'SS':   num(c[38]),
        'DMS':  num(c[39]),
        'ADAS': num(c[40]),
        'NC':   num(c[41]),
        'SP':   num(c[42]),
        'FS100':num(c[43]),
        'SOJI': num(c[44]),
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
  const month = sp.get('month')
  const year = sp.get('year') // short (e.g. "25") or full (e.g. "2025")

  if (!sheetId || !month || !year) {
    return NextResponse.json({ error: 'Missing sheetId, month, year' }, { status: 400 })
  }

  const yearShort = year.length === 4 ? year.slice(2) : year
  const sheetName = `báo cáo tháng ${month}/${yearShort}`

  try {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`
    const res = await fetch(url, {
      headers: { 'Accept': 'text/html,application/xhtml+xml' },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const text = await res.text()
    const data = parseGviz(text)
    const rows = parseRows(data?.table?.rows ?? [])

    return NextResponse.json({ rows, sheetName, month, year: yearShort })
  } catch (err) {
    console.error('[ho-tro/sheets]', err)
    return NextResponse.json({ error: String(err), rows: [], sheetName }, { status: 200 })
  }
}
