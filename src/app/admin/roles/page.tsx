import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isAdminUser } from '@/lib/auth-helpers'
import RoleManagement from '@/components/admin/RoleManagement'

async function getRolesWithPermissions() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data } = await supabase
    .from('roles')
    .select('*, role_permissions(permission_key)')
    .order('name')
  return (data ?? []).map((r: { id: string; name: string; is_system: boolean; role_permissions: { permission_key: string }[] }) => ({
    ...r,
    permissions: r.role_permissions.map((p) => p.permission_key).filter(Boolean),
  }))
}

export default async function RolesPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!(await isAdminUser(user.id))) redirect('/')

  const roles = await getRolesWithPermissions()

  return (
    <main className="min-h-screen bg-[#f8fafc]">
      <RoleManagement roles={roles} currentUserEmail={user.email ?? ''} />
    </main>
  )
}
