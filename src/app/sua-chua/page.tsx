import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { buildAppShellPerms, isAdminUser } from '@/lib/auth-helpers'
import AppShell from '@/components/AppShell'
import RepairDashboard from '@/components/sua-chua/RepairDashboard'

export const metadata = { title: 'Thống kê Sửa chữa | EUP Hardware' }


export default async function SuaChuaPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const permissions = await buildAppShellPerms(user.id)

  return (
    <AppShell userEmail={user.email ?? ''} permissions={permissions}>
      <RepairDashboard userEmail={user.email ?? ''} permissions={permissions} />
    </AppShell>
  )
}
