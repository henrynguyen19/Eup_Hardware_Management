import { createSupabaseServerClient } from '@/lib/supabase-server'
import { buildAppShellPerms, isAdminUser } from '@/lib/auth-helpers'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import JiraBugsDashboard from '@/components/jira/JiraBugsDashboard'

export default async function JiraBugsPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [permissions, isAdmin] = await Promise.all([
    buildAppShellPerms(user.id),
    isAdminUser(user.id),
  ])

  return (
    <AppShell userEmail={user.email ?? ''} permissions={permissions}>
      <JiraBugsDashboard userEmail={user.email ?? ''} isAdmin={isAdmin} />
    </AppShell>
  )
}
