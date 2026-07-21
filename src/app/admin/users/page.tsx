import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isAdminUser } from '@/lib/auth-helpers'
import AppShell from '@/components/AppShell'
import UserManagement from '@/components/admin/UserManagement'

export default async function UsersPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (!(await isAdminUser(user.id))) redirect('/')
  const perms: string[] = ['admin:users']

  return (
    <AppShell userEmail={user.email ?? ''} permissions={perms}>
      <UserManagement currentUserEmail={user.email ?? ''} />
    </AppShell>
  )
}
