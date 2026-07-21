import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isAdminUser } from '@/lib/auth-helpers'
import AppShell from '@/components/AppShell'
import PermissionManager from '@/components/admin/PermissionManager'

export default async function PermissionsPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (!(await isAdminUser(user.id))) redirect('/')
  const perms: string[] = ['admin:users']

  return (
    <AppShell userEmail={user.email ?? ''} permissions={perms}>
      <PermissionManager />
    </AppShell>
  )
}
