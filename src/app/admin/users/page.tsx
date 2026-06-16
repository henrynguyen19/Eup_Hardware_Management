import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import UserManagement from '@/components/admin/UserManagement'

async function getUsers() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const [usersResult, rolesResult] = await Promise.all([
    supabase.from('user_permissions_view').select('*').order('user_email'),
    supabase.from('roles').select('id, name').order('name'),
  ])

  return {
    users: usersResult.data ?? [],
    roles: rolesResult.data ?? [],
  }
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

export default async function UsersPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const permissions = await getCurrentUserPermissions(user.id)
  if (!permissions.includes('admin:users')) redirect('/')

  const { users, roles } = await getUsers()

  return (
    <main className="min-h-screen bg-[#f8fafc]">
      <UserManagement users={users} roles={roles} currentUserEmail={user.email ?? ''} />
    </main>
  )
}
