import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { buildAppShellPerms, isAdminUser } from '@/lib/auth-helpers'
import AppShell from '@/components/AppShell'
import GiaoHangDashboard from '@/components/giao-nhan/GiaoHangDashboard'

export default async function GiaoNhanPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const permissions = await buildAppShellPerms(user.id)

  return (
    <AppShell userEmail={user.email ?? ''} permissions={permissions}>
      <GiaoHangDashboard userEmail={user.email ?? ''} isAdmin={permissions.includes('admin')} />
    </AppShell>
  )
}
