import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAdmin() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data } = await sb().from('user_permissions_view').select('permissions').eq('user_id', user.id).single()
  if (!(data?.permissions ?? []).includes('admin:users'))
    return { ok: false, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { ok: true }
}

type Params = { params: { id: string } }

// GET /api/admin/departments/[id]/members — list members
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error!

  const { data } = await sb()
    .from('user_departments')
    .select('user_id')
    .eq('department_id', params.id)

  const userIds = (data ?? []).map(r => r.user_id)
  if (userIds.length === 0) return NextResponse.json({ members: [] })

  // Get emails from Supabase Auth (works for all users, not just those with roles)
  const { data: authData } = await sb().auth.admin.listUsers({ page: 1, perPage: 1000 })
  const authMap = Object.fromEntries(
    (authData?.users ?? []).map(u => [u.id, u.email ?? u.id])
  )

  const members = userIds.map(uid => ({ user_id: uid, user_email: authMap[uid] ?? uid }))
  return NextResponse.json({ members })
}

// POST /api/admin/departments/[id]/members — add user to department
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error!

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: 'Thiếu userId' }, { status: 400 })

  const { error } = await sb()
    .from('user_departments')
    .upsert({ user_id: userId, department_id: params.id }, { onConflict: 'user_id,department_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/admin/departments/[id]/members — remove user from department
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error!

  const { userId } = await req.json()
  const { error } = await sb()
    .from('user_departments')
    .delete()
    .eq('department_id', params.id)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
