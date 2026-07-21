import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { buildAppShellPerms, isAdminUser } from '@/lib/auth-helpers'
import AppShell from '@/components/AppShell'
import KhoDailyDashboard from '@/components/kho-daily/KhoDailyDashboard'

export const metadata = { title: 'Công việc Kho | EUP Hardware' }


export default async function KhoDailyPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const permissions = await buildAppShellPerms(user.id)

  return (
    <AppShell userEmail={user.email ?? ''} permissions={permissions}>
      <KhoDailyDashboard userEmail={user.email ?? ''} permissions={permissions} />
    </AppShell>
  )
}
