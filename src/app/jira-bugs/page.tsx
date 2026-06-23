import { createSupabaseServerClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import JiraBugsDashboard from '@/components/jira/JiraBugsDashboard'
import { createClient } from '@supabase/supabase-js'

const adminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function JiraBugsPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: permData } = await adminClient()
    .from('user_permissions_view')
    .select('permissions')
    .eq('user_id', user.id)
    .single()
  const perms: string[] = permData?.permissions ?? []
  const isAdmin = perms.includes('admin:users')

  return (
    <AppShell userEmail={user.email ?? ''} isAdmin={isAdmin}>
      <JiraBugsDashboard userEmail={user.email ?? ''} isAdmin={isAdmin} />
    </AppShell>
  )
}
