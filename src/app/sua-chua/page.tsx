import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import AppShell from '@/components/AppShell'
import RepairDashboard from '@/components/sua-chua/RepairDashboard'

export const metadata = { title: 'Thống kê Sửa chữa | EUP Hardware' }

async function getUserPermissions(userId: string): Promise<string[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data } = await supabase
    .from('user_permissions_view')
    .select('permissions')
    .eq('user_id', userId)
    .single()
  return data?.permissions ?? []
}

export default async function SuaChuaPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const permissions = await getUserPermissions(user.id)

  return (
    <AppShell userEmail={user.email ?? ''} permissions={permissions}>
      <RepairDashboard userEmail={user.email ?? ''} permissions={permissions} />
    </AppShell>
  )
}
