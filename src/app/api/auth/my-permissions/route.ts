import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isAdminUser, buildAppShellPerms } from '@/lib/auth-helpers'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    global: {
      fetch: (url: RequestInfo | URL, init?: RequestInit) =>
        fetch(url, { ...init, cache: 'no-store' }),
    },
  }
)

// GET /api/auth/my-permissions
// Returns full debug info for the current user's permissions
export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = await isAdminUser(user.id)

  // New system: user_dept_permissions (raw keys)
  const { data: deptPerms, error: deptPermsErr } = await sb()
    .from('user_dept_permissions')
    .select('department_id, permission_key')
    .eq('user_id', user.id)

  // Old system: user_effective_permissions view
  const { data: effPerms } = await sb()
    .from('user_effective_permissions')
    .select('sub_page_code, can_read, can_create, can_update, can_delete')
    .eq('user_id', user.id)

  // Departments
  const { data: deptRows } = await sb()
    .from('user_departments')
    .select('departments(*)')
    .eq('user_id', user.id)
  const departments = (deptRows ?? []).map((r: { departments: unknown }) => r.departments).filter(Boolean)

  // Final resolved permissions used by AppShell
  const appShellPerms = await buildAppShellPerms(user.id)

  const effectivePermissions: Record<string, { can_read: boolean; can_create: boolean; can_update: boolean; can_delete: boolean }> = {}
  for (const row of effPerms ?? []) {
    effectivePermissions[row.sub_page_code] = {
      can_read:   row.can_read,
      can_create: row.can_create,
      can_update: row.can_update,
      can_delete: row.can_delete,
    }
  }

  return NextResponse.json({
    userId: user.id,
    email: user.email,
    isAdmin,
    departments,
    // New system
    user_dept_permissions: deptPerms ?? [],
    user_dept_permissions_error: deptPermsErr?.message ?? null,
    // Old system
    user_effective_permissions: effectivePermissions,
    // Final result used by sidebar
    appShellPerms,
  })
}
