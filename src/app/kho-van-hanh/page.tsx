import { createSupabaseServerClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import KhoVanHanhDashboard from '@/components/kho/KhoVanHanhDashboard'

export default async function KhoVanHanhPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <KhoVanHanhDashboard />
}
