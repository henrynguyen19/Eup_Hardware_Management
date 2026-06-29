import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { STAFF_SHEETS, getStaffByEmail } from '@/lib/staff-sheets'
import HoTroDashboard from '@/components/ho-tro/HoTroDashboard'
import AppShell from '@/components/AppShell'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

async function getUserPermissions(userId: string): Promise<string[]> {
  const { data } = await adminClient()
    .from('user_permissions_view')
    .select('permissions')
    .eq('user_id', userId)
    .single()
  return data?.permissions ?? []
}

export default async function HoTroPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const permissions = await getUserPermissions(user.id)
  // admin:users = full system admin; ho_tro:admin = trưởng nhóm hỗ trợ (xem thống kê tổng)
  const isAdmin = permissions.includes('admin:users') || permissions.includes('ho_tro:admin')
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
