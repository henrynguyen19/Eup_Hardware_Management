import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

async function requireAdmin(): Promise<{ ok: boolean; error?: NextResponse }> {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 }) }

  const { data } = await sb()
    .from('user_permissions_view')
    .select('permissions')
    .eq('user_id', user.id)
    .single()

  if (!(data?.permissions ?? []).includes('admin:users')) {
    return { ok: false, error: NextResponse.json({ error: 'Không có quyền' }, { status: 403 }) }
  }
  return { ok: true }
}

// GET /api/admin/groups — danh sách groups kèm số thành viên + email
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error!

  const { data, error } = await sb()
    .from('user_groups_view')
    .select('*')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ groups: data ?? [] })
}

// POST /api/admin/groups — tạo group mới
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error!

  const { name, description, permissions, color } = await req.json()
  if (!name?.trim()) {
    return NextResponse.json({ error: 'Thiếu tên nhóm' }, { status: 400 })
  }

  const { data, error } = await sb()
    .from('user_groups')
    .insert({ name: name.trim(), description, permissions: permissions ?? [], color })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ group: data })
}
