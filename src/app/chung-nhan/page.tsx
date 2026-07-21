import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { buildAppShellPerms, isAdminUser } from '@/lib/auth-helpers'
import AppShell from '@/components/AppShell'
import TaiLieuKyThuatPage from '@/components/chung-nhan/TaiLieuKyThuatPage'


export default async function ChungNhanPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const permissions = await buildAppShellPerms(user.id)

  const isAdmin = await isAdminUser(user.id)
  const canWriteCerts = isAdmin || permissions.includes('chung_nhan:write')

  return (
    <AppShell userEmail={user.email ?? ''} permissions={permissions}>
      <TaiLieuKyThuatPage
        isAdmin={isAdmin}
        canWriteCerts={canWriteCerts}
        canTaiLieu={permissions.includes('tai_lieu:read') || permissions.includes('chung_nhan:read') || isAdmin || canWriteCerts}
        canHuongDan={permissions.includes('huong_dan:read') || permissions.includes('chung_nhan:read') || isAdmin}
      />
    </AppShell>
  )
}
