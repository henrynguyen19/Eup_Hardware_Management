import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// PATCH /api/bookmarks - upsert 個人Ghi chú（by equipment_id，不需 bookmark id）
export async function PATCH(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { equipment_id, notes } = await req.json()
  if (!equipment_id) return NextResponse.json({ error: 'equipment_id required' }, { status: 400 })

  const { error } = await supabase
    .from('user_bookmarks')
    .upsert(
      { user_id: user.id, equipment_id, notes: notes ?? null },
      { onConflict: 'user_id,equipment_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// GET /api/bookmarks - 取得當前người dùng的所有 bookmarks
export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('user_bookmarks')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/bookmarks - Thêm mới bookmark
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { equipment_id, notes } = await req.json()
  if (!equipment_id) return NextResponse.json({ error: 'equipment_id 必填' }, { status: 400 })

  const { data, error } = await supabase
    .from('user_bookmarks')
    .insert({ user_id: user.id, equipment_id, notes: notes ?? null })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Đã theo dõi' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
