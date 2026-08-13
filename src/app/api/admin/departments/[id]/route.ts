import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isAdminUser } from '@/lib/auth-helpers'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAdmin() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!(await isAdminUser(user.id)))
    return { ok: false, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { ok: true }
}

type Params = { params: { id: string } }

// PATCH /api/admin/departments/[id] — update name/color
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error!

  const body = await req.json()

  // Whitelist — chỉ cho phép update các field cụ thể
  const allowed: Record<string, unknown> = {}
  if (body.name        !== undefined) allowed.name        = String(body.name).trim()
  if (body.color       !== undefined) allowed.color       = String(body.color).trim()
  if (body.description !== undefined) allowed.description = String(body.description).trim()
  if (body.sort_order  !== undefined) allowed.sort_order  = Number(body.sort_order)

  if (Object.keys(allowed).length === 0)
    return NextResponse.json({ error: 'Không có field hợp lệ để update' }, { status: 400 })

  const { error } = await sb().from('departments').update(allowed).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/admin/departments/[id] — delete department
export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error!

  const { error } = await sb().from('departments').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
