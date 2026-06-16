import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const adminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const admin = adminClient()
  const { data: group } = await admin
    .from('user_groups')
    .select('user_id, is_default')
    .eq('id', params.id)
    .single()

  if (!group || group.user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (group.is_default) return NextResponse.json({ error: 'Không thể đổi tên nhóm mặc định' }, { status: 400 })

  const { data, error } = await admin
    .from('user_groups')
    .update({ name: name.trim() })
    .eq('id', params.id)
    .select('*, group_items(equipment_id, added_at)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = adminClient()
  const { data: group } = await admin
    .from('user_groups')
    .select('user_id, is_default')
    .eq('id', params.id)
    .single()

  if (!group || group.user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (group.is_default) return NextResponse.json({ error: '預設Nhóm不可Xóa' }, { status: 400 })

  await admin.from('user_groups').delete().eq('id', params.id)
  return new NextResponse(null, { status: 204 })
}
