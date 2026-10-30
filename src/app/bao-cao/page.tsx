import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { buildAppShellPerms, isAdminUser } from '@/lib/auth-helpers'
import AppShell from '@/components/AppShell'
import WeeklyReportTab from '@/components/bao-cao/WeeklyReportTab'

export const metadata = { title: 'Báo cáo tuần | EUP Hardware' }

export default async function BaoCaoPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const permissions = await buildAppShellPerms(user.id)
  const admin = await isAdminUser(user.id)

  // Only users who can see SuaChua or HoTro (or admin) can access
  const canAccess = admin
    || permissions.includes('sua_chua:read')
    || permissions.includes('ho_tro:read')
  if (!canAccess) redirect('/')

  return (
    <AppShell userEmail={user.email ?? ''} permissions={permissions}>
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <WeeklyReportTab />
      </div>
    </AppShell>
  )
}
