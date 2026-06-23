import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/auth/my-permissions
// Returns:
//   isAdmin: boolean
//   departments: { id, name, code, color }[]
//   permissions: { [sub_page_code]: { can_read, can_create, can_update, can_delete } }
export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check admin
  const { data: permData } = await sb()
    .from('user_permissions_view')
    .select('permissions')
    .eq('user_id', user.id)
    .single()
  const isAdmin = (permData?.permissions ?? []).includes('admin:users')

  // Get departments
  const { data: deptRows } = await sb()
    .from('user_departments')
    .select('departments(*)')
    .eq('user_id', user.id)
  const departments = (deptRows ?? []).map((r: { departments: unknown }) => r.departments).filter(Boolean)

  // Get effective permissions
  const { data: effPerms } = await sb()
    .from('user_effective_permissions')
    .select('sub_page_code, can_read, can_create, can_update, can_delete')
    .eq('user_id', user.id)

  const permissions: Record<string, { can_read: boolean; can_create: boolean; can_update: boolean; can_delete: boolean }> = {}
  for (const row of effPerms ?? []) {
    permissions[row.sub_page_code] = {
      can_read:   row.can_read,
      can_create: row.can_create,
      can_update: row.can_update,
      can_delete: row.can_delete,
    }
  }

  return NextResponse.json({ isAdmin, departments, permissions })
}
