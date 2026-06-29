import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import RoleManagement from '@/components/admin/RoleManagement'

async function getRolesWithPermissions() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data } = await supabase
    .from('roles')
    .select('*, role_permissions(permission)')
    .order('name')
  return (data ?? []).map((r: { id: string; name: string; is_system: boolean; role_permissions: { permission: string }[] }) => ({
    ...r,
    permissions: r.role_permissions.map((p) => p.permission).filter(Boolean),
  }))
}

async function getCurrentUserPermissions(userId: string): Promise<string[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data } = await supabase
    .from('user_permissions_view')
    .select('permissions')
    .eq('user_id', userId)
    .single()
  return data?.permissions ?? []
}

export default async function RolesPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const permissions = await getCurrentUserPermissions(user.id)
  if (!permissions.includes('admin:roles') && !permissions.includes('admin:users')) redirect('/')

  const roles = await getRolesWithPermissions()

  return (
    <main className="min-h-screen bg-[#f8fafc]">
      <RoleManagement roles={roles} currentUserEmail={user.email ?? ''} />
    </main>
  )
}
