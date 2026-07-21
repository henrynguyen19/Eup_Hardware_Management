import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { buildAppShellPerms, isAdminUser } from '@/lib/auth-helpers'
import { STAFF_SHEETS, getStaffByEmail } from '@/lib/staff-sheets'
import HoTroDashboard from '@/components/ho-tro/HoTroDashboard'
import AppShell from '@/components/AppShell'

export default async function HoTroPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const permissions = await buildAppShellPerms(user.id)
  // admin:users = full system admin; ho_tro:admin = trưởng nhóm hỗ trợ (xem thống kê tổng)
  const isAdmin = await isAdminUser(user.id)
  const canRead = permissions.includes('ho_tro:read') || isAdmin

  if (!canRead) redirect('/kho')

  const staffConfig = getStaffByEmail(user.email ?? '') ?? null
  const canWrite = permissions.includes('ho_tro:write') || isAdmin

  return (
    <AppShell userEmail={user.email ?? ''} permissions={permissions}>
      <HoTroDashboard
        userEmail={user.email ?? ''}
        isAdmin={isAdmin}
        canWrite={canWrite}
        staffConfig={staffConfig}
        allStaff={STAFF_SHEETS}
      />
    </AppShell>
  )
}
