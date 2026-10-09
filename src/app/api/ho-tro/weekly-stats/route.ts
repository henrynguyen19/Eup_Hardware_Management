import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { isAdminUser, hasSubPagePerm } from '@/lib/auth-helpers'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// Các loại lỗi cần theo dõi
const KEY_ERRORS = ['No Connect', 'RFID', 'ACC', 'PW', 'Support', 'GPS', 'GSM']

function parseErrors(memo: string): string[] {
  const t = (memo ?? '').toLowerCase()
  const r: string[] = []
  if (/#nc\b/.test(t))      r.push('No Connect')
  if (/#gsm\b/.test(t))     r.push('GSM')
  if (/#gps\b/.test(t))     r.push('GPS')
  if (/#acc\b/.test(t))     r.push('ACC')
  if (/#rfid\b/.test(t))    r.push('RFID')
  if (/#pw\b/.test(t))      r.push('PW')
  if (/#sp\b/.test(t))      r.push('Support')
  return r
}

function getISOWeekKey(isoDate: string): string {
  const d = new Date(isoDate)
  d.setHours(12, 0, 0, 0)
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const diff = d.getTime() - jan1.getTime()
  const dayOfYear = Math.floor(diff / 86400000)
  // ISO week: week 1 = week containing first Thursday
  const dow = d.getDay() === 0 ? 7 : d.getDay() // 1=Mon..7=Sun
  const corrected = dayOfYear + (4 - dow)
  const week = Math.floor(corrected / 7) + 1
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
}

// GET /api/ho-tro/weekly-stats
// Trả về dữ liệu tổng hợp theo tuần cho toàn bộ năm 2026 (Jan 1 → hôm nay)
// Cache header: 1 giờ phía CDN/browser
export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [isAdmin, hasPerm] = await Promise.all([
    isAdminUser(user.id),
    hasSubPagePerm(user.id, 'hotro_bang_thong_ke', 'can_read'),
  ])
  if (!isAdmin && !hasPerm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = adminClient()
  const today = new Date().toISOString().slice(0, 10)
  const yearStart = `${new Date().getFullYear()}-01-01`

  // Chỉ lấy 2 cột cần thiết để giảm payload: ticket_date + reply (chứa hashtag)
  // Dùng range pagination để vượt giới hạn 1000 rows của Supabase
  const PAGE_SIZE = 1000
  let from = 0
  const allRows: { ticket_date: string; reply: string | null }[] = []

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await db
      .from('ho_tro_tickets')
      .select('ticket_date, reply')
      .like('sheet_row_key', 'crm:%')
      .gte('ticket_date', yearStart)
      .lte('ticket_date', today)
      .order('ticket_date', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error || !data || data.length === 0) break
    allRows.push(...(data as { ticket_date: string; reply: string | null }[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  // ── Aggregate by ISO week ────────────────────────────────────────────
  const weekTotalMap = new Map<string, { weekLabel: string; total: number }>()
  const weekErrMap   = new Map<string, Record<string, number> & { weekLabel: string }>()

  for (const row of allRows) {
    if (!row.ticket_date) continue
    const wk    = getISOWeekKey(row.ticket_date)
    const wNum  = wk.split('-W')[1]
    const label = `W${wNum}`

    // Total
    if (!weekTotalMap.has(wk)) weekTotalMap.set(wk, { weekLabel: label, total: 0 })
    weekTotalMap.get(wk)!.total++

    // Errors
    if (!weekErrMap.has(wk)) weekErrMap.set(wk, { weekLabel: label } as Record<string, number> & { weekLabel: string })
    const errRow = weekErrMap.get(wk)!
    for (const e of parseErrors(row.reply ?? '')) {
      (errRow as Record<string, number>)[e] = ((errRow as Record<string, number>)[e] ?? 0) + 1
    }
  }

  const sort = (a: string, b: string) => a.localeCompare(b)
  const weekTotalData = Array.from(weekTotalMap.entries()).sort(([a], [b]) => sort(a, b)).map(([, v]) => v)
  const weekErrData   = Array.from(weekErrMap.entries()).sort(([a], [b]) => sort(a, b)).map(([, v]) => v)

  const res = NextResponse.json({
    weekTotalData,
    weekErrData,
    keyErrors: KEY_ERRORS,
    totalRows: allRows.length,
    generatedAt: new Date().toISOString(),
  })

  // Cache 1 giờ ở browser, 2 giờ stale-while-revalidate
  res.headers.set('Cache-Control', 'private, max-age=3600, stale-while-revalidate=7200')
  return res
}
