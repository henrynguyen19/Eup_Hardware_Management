import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { isAdminUser, hasSubPagePerm } from '@/lib/auth-helpers'
import { rebuildWeeklyStats, formatWeeklyStatsForChart, WeeklyStatsRow } from '@/lib/hotro-weekly-stats'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// GET /api/ho-tro/weekly-stats
// Đọc từ bảng hotro_weekly_stats (nhanh, đã pre-aggregate).
// Nếu bảng rỗng (lần đầu), tự rebuild rồi trả kết quả.
// Query param ?rebuild=1 → force rebuild (dành cho admin).
export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [isAdmin, hasPerm] = await Promise.all([
    isAdminUser(user.id),
    hasSubPagePerm(user.id, 'hotro_bang_thong_ke', 'can_read'),
  ])
  if (!isAdmin && !hasPerm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db          = adminClient()
  const year        = new Date().getFullYear()
  const forceRebuild = new URL(req.url).searchParams.get('rebuild') === '1'

  // ── Force rebuild nếu được yêu cầu ──
  if (forceRebuild && isAdmin) {
    const result = await rebuildWeeklyStats(db, { year })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  }

  // ── Đọc từ bảng cache ──
  const { data, error } = await db
    .from('hotro_weekly_stats')
    .select('*')
    .eq('year', year)
    .order('week_num', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Nếu bảng rỗng (chưa từng rebuild) → tự rebuild lần đầu
  if (!data || data.length === 0) {
    const result = await rebuildWeeklyStats(db, { year })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })

    // Đọc lại sau rebuild
    const { data: data2, error: err2 } = await db
      .from('hotro_weekly_stats')
      .select('*')
      .eq('year', year)
      .order('week_num', { ascending: true })
    if (err2) return NextResponse.json({ error: err2.message }, { status: 500 })

    const { weekTotalData, weekErrData } = formatWeeklyStatsForChart((data2 ?? []) as WeeklyStatsRow[])
    const res = NextResponse.json({ weekTotalData, weekErrData, source: 'fresh_rebuild', totalWeeks: data2?.length ?? 0 })
    res.headers.set('Cache-Control', 'private, max-age=3600, stale-while-revalidate=7200')
    return res
  }

  const { weekTotalData, weekErrData } = formatWeeklyStatsForChart(data as WeeklyStatsRow[])
  const res = NextResponse.json({
    weekTotalData,
    weekErrData,
    source: 'cache',
    totalWeeks: data.length,
    updatedAt: (data[data.length - 1] as WeeklyStatsRow & { updated_at?: string }).updated_at,
  })
  res.headers.set('Cache-Control', 'private, max-age=3600, stale-while-revalidate=7200')
  return res
}
