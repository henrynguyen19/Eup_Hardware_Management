import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import AppShell from '@/components/AppShell'
import CertificatesPage from '@/components/chung-nhan/CertificatesPage'

async function getCurrentUserPermissions(userId: string): Promise<string[]> {
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

export default async function ChungNhanPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const permissions = await getCurrentUserPermissions(user.id)

  return (
    <AppShell userEmail={user.email ?? ''} permissions={permissions}>
      <CertificatesPage />
    </AppShell>
  )
}
