import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import AppShell from '@/components/AppShell'
import KhoDailyDashboard from '@/components/kho-daily/KhoDailyDashboard'

export const metadata = { title: 'Công việc Kho | EUP Hardware' }

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

export default async function KhoDailyPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const permissions = await getUserPermissions(user.id)

  return (
    <AppShell userEmail={user.email ?? ''} permissions={permissions}>
      <KhoDailyDashboard userEmail={user.email ?? ''} permissions={permissions} />
    </AppShell>
  )
}
