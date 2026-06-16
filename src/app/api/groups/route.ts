import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const adminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = adminClient()

  // truy vấn現有Nhóm
  let { data: groups } = await admin
    .from('user_groups')
    .select('*, group_items(equipment_id, added_at)')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('sort_order')

  // 懶遷移：若完全沒有Nhóm，從 user_bookmarks 遷移
  if (!groups || groups.length === 0) {
    const { data: bookmarks } = await admin
      .from('user_bookmarks')
      .select('equipment_id, created_at')
      .eq('user_id', user.id)

    const { data: newGroup } = await admin
      .from('user_groups')
      .insert({ user_id: user.id, name: 'Theo dõi', is_default: true })
      .select()
      .single()

    if (newGroup && bookmarks && bookmarks.length > 0) {
      await admin.from('group_items').insert(
        bookmarks.map((b: { equipment_id: string; created_at: string }) => ({
          group_id: newGroup.id,
          equipment_id: b.equipment_id,
          added_at: b.created_at,
        }))
      )
    }

    const { data: fresh } = await admin
      .from('user_groups')
      .select('*, group_items(equipment_id, added_at)')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('sort_order')
    groups = fresh
  }

  return NextResponse.json(groups ?? [])
}

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const admin = adminClient()
  const { data, error } = await admin
    .from('user_groups')
    .insert({ user_id: user.id, name: name.trim() })
    .select('*, group_items(equipment_id, added_at)')
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Tên nhóm đã tồn tại' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
