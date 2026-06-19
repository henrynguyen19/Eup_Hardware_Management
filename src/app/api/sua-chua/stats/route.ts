import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
      .select('id, year, week_number, week_label, date_start')
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
  const { week_id, stats, totals } = await req.json()
  if (!week_id) return NextResponse.json({ error: 'Thiếu week_id' }, { status: 400 })

  const client = sb()
  const errors: string[] = []

  // Upsert stats
  if (stats && stats.length > 0) {
    const rows = stats
      .filter((s: { quantity: number }) => s.quantity > 0)
      .map((s: { status_type: string; fault_type: string; device_type: string; quantity: number }) => ({
        week_id, ...s
      }))

    if (rows.length > 0) {
      const { error } = await client.from('repair_stats')
        .upsert(rows, { onConflict: 'week_id,status_type,fault_type,device_type' })
      if (error) errors.push(error.message)
    }

    // Xóa rows có quantity=0 (cleanup)
    const zeroRows = stats.filter((s: { quantity: number }) => s.quantity === 0)
    for (const z of zeroRows) {
      await client.from('repair_stats').delete()
        .eq('week_id', week_id)
        .eq('status_type', z.status_type)
        .eq('fault_type', z.fault_type)
        .eq('device_type', z.device_type)
    }
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
  return NextResponse.json({ ok: true })
}
