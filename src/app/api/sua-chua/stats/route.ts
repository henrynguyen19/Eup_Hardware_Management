import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getAuthUser() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

async function checkWritePermission(userId: string): Promise<boolean> {
  const { data } = await sb()
    .from('user_permissions_view')
    .select('permissions')
    .eq('user_id', userId)
    .single()
  const perms: string[] = data?.permissions ?? []
  return perms.includes('sua_chua:write') || perms.includes('admin:users')
}

// GET — lấy stats của 1 tuần hoặc nhiều tuần (cho chart)
// ?week_id=xxx         → chi tiết 1 tuần
// ?year=2026           → tất cả tuần trong năm (kèm totals) cho chart
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const week_id = searchParams.get('week_id')
  const year    = searchParams.get('year')

  const client = sb()

  if (week_id) {
    // Chi tiết 1 tuần: stats + totals
    const [statsRes, totalsRes] = await Promise.all([
      client.from('repair_stats').select('*').eq('week_id', week_id),
      client.from('repair_totals').select('*').eq('week_id', week_id),
    ])
    return NextResponse.json({
      stats:  statsRes.data  ?? [],
      totals: totalsRes.data ?? [],
    })
  }

  if (year) {
    // Tất cả tuần trong năm kèm totals (cho dashboard chart)
    const weeksRes = await client
      .from('repair_weeks')
      .select('id, year, week_number, week_label, date_start, date_end')
      .eq('year', parseInt(year))
      .order('week_number')

    const weekIds = (weeksRes.data ?? []).map(w => w.id)
    if (weekIds.length === 0) return NextResponse.json({ weeks: [], totals: [], stats: [] })

    const [totalsRes, statsRes] = await Promise.all([
      client.from('repair_totals').select('*').in('week_id', weekIds),
      client.from('repair_stats').select('*').in('week_id', weekIds),
    ])

    return NextResponse.json({
      weeks:  weeksRes.data  ?? [],
      totals: totalsRes.data ?? [],
      stats:  statsRes.data  ?? [],
    })
  }

  return NextResponse.json({ error: 'Cần truyền week_id hoặc year' }, { status: 400 })
}

// POST — lưu toàn bộ data 1 tuần (upsert)
// Body: {
//   week_id,
//   stats: [{ status_type, fault_type, device_type, quantity }],
//   totals: [{ device_type, total_received }]
// }
export async function POST(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const canWrite = await checkWritePermission(user.id)
  if (!canWrite) return NextResponse.json({ error: 'Không có quyền nhập liệu sửa chữa' }, { status: 403 })

  const { week_id, stats, totals } = await req.json()
  if (!week_id) return NextResponse.json({ error: 'Thiếu week_id' }, { status: 400 })

  const client = sb()
  const errors: string[] = []

  // Lấy tên hiển thị của người dùng
  const { data: userRow } = await client
    .from('users')
    .select('full_name, username, email')
    .eq('id', user.id)
    .single()
  const submittedBy = userRow?.full_name || userRow?.username || userRow?.email || user.email || user.id

  // Upsert stats — CHỈ upsert ô có giá trị (quantity > 0)
  // Ô bỏ trống (0) KHÔNG ghi đè dữ liệu người khác đã nhập
  if (stats && stats.length > 0) {
    const rows = stats
      .filter((s: { quantity: number }) => s.quantity > 0)
      .map((s: { status_type: string; fault_type: string; device_type: string; quantity: number }) => ({
        week_id,
        ...s,
        submitted_by: submittedBy,
        submitted_at: new Date().toISOString(),
      }))

    if (rows.length > 0) {
      const { error } = await client.from('repair_stats')
        .upsert(rows, { onConflict: 'week_id,status_type,fault_type,device_type' })
      if (error) errors.push(error.message)
    }
    // Ô = 0 từ form: KHÔNG xóa — có thể là ô người kia đã nhập rồi
  }

  // Upsert totals
  if (totals && totals.length > 0) {
    const { error } = await client.from('repair_totals')
      .upsert(
        totals.map((t: { device_type: string; total_received: number }) => ({ week_id, ...t })),
        { onConflict: 'week_id,device_type' }
      )
    if (error) errors.push(error.message)
  }

  if (errors.length > 0) return NextResponse.json({ error: errors.join('; ') }, { status: 500 })

  // Audit log
  await client.from('repair_entry_logs').insert({
    week_id,
    action: 'create',
    entered_by: user.email ?? user.id,
    entered_at: new Date().toISOString(),
  })

  return NextResponse.json({ ok: true })
}
