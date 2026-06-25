import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// POST /api/ho-tro/mark-read
// body: { ids: number[] }  — id của ho_tro_tickets
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ids } = await req.json().catch(() => ({ ids: [] })) as { ids: number[] }
  if (!Array.isArray(ids) || ids.length === 0)
    return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 })

  const db = adminClient()
  const { error } = await db
    .from('ho_tro_tickets')
    .update({ has_unread_update: false })
    .in('id', ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, marked: ids.length })
}

// GET /api/ho-tro/mark-read?staffName=Kane&limit=50
// Lấy danh sách ticket có cập nhật chưa đọc
export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp        = new URL(req.url).searchParams
  const staffName = sp.get('staffName') ?? undefined
  const limit     = Math.min(200, parseInt(sp.get('limit') ?? '100'))

  const db = adminClient()
  let query = db
    .from('ho_tro_tickets')
    .select('id, code, ticket_date, company, content, reply, staff_name, speed_tag, cs_update_time')
    .eq('has_unread_update', true)
    .order('cs_update_time', { ascending: false })
    .limit(limit)

  if (staffName) query = query.eq('staff_name', staffName)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ tickets: data ?? [], total: data?.length ?? 0 })
}
