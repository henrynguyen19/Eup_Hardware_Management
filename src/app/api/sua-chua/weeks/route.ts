import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET — danh sách tuần (có thể kèm tổng)
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const year = searchParams.get('year')

  let query = sb().from('repair_weeks').select('*').order('year', { ascending: false }).order('week_number', { ascending: false })
  if (year) query = query.eq('year', parseInt(year))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ weeks: data ?? [] })
}

// POST — thêm tuần mới
// Body: { year, week_number, week_label, date_start?, date_end?, notes? }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { year, week_number, week_label, date_start, date_end, notes } = body

  if (!year || !week_number || !week_label) {
    return NextResponse.json({ error: 'Thiếu year, week_number hoặc week_label' }, { status: 400 })
  }

  const { data, error } = await sb()
    .from('repair_weeks')
    .upsert({ year, week_number, week_label, date_start, date_end, notes, updated_at: new Date().toISOString() },
      { onConflict: 'year,week_number' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ week: data })
}

// DELETE — xóa tuần (cascade xóa stats + totals)
// Body: { week_id }
export async function DELETE(req: NextRequest) {
  const { week_id } = await req.json()
  if (!week_id) return NextResponse.json({ error: 'Thiếu week_id' }, { status: 400 })

  const { error } = await sb().from('repair_weeks').delete().eq('id', week_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
