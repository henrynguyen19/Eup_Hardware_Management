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

// GET /api/admin/departments/[id]/permissions — get all permissions for dept
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error!

  const { data } = await sb()
    .from('department_permissions')
    .select('sub_page_id, can_read, can_create, can_update, can_delete')
    .eq('department_id', params.id)

  // Return as a map: { [sub_page_id]: { can_read, can_create, can_update, can_delete } }
  const permsMap: Record<string, { can_read: boolean; can_create: boolean; can_update: boolean; can_delete: boolean }> = {}
  for (const row of data ?? []) {
    permsMap[row.sub_page_id] = {
      can_read:   row.can_read,
      can_create: row.can_create,
      can_update: row.can_update,
      can_delete: row.can_delete,
    }
  }
  return NextResponse.json({ permissions: permsMap })
}

// PUT /api/admin/departments/[id]/permissions — replace all permissions for dept
// Body: { permissions: { [sub_page_id]: { can_read, can_create, can_update, can_delete } } }
export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error!

  const { permissions } = await req.json() as {
    permissions: Record<string, { can_read: boolean; can_create: boolean; can_update: boolean; can_delete: boolean }>
  }

  // Delete all existing permissions for this department
  await sb().from('department_permissions').delete().eq('department_id', params.id)

  // Insert new ones (only rows where at least one permission is true)
  const rows = Object.entries(permissions)
    .filter(([, p]) => p.can_read || p.can_create || p.can_update || p.can_delete)
    .map(([sub_page_id, p]) => ({
      department_id: params.id,
      sub_page_id,
      ...p,
    }))

  if (rows.length > 0) {
    const { error } = await sb().from('department_permissions').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, saved: rows.length })
}
