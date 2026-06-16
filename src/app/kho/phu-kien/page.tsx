import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import PhuKienList from '@/components/kho/PhuKienList'
import type { Accessory } from '@/types/kho'

async function getAccessories(): Promise<Accessory[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data, error } = await supabase
    .from('accessories')
    .select('*')
    .order('category')
    .order('name')
  if (error) {
    console.error('Lỗi Supabase:', error)
    return []
  }
  return data ?? []
}

export default async function PhuKienPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const accessories = await getAccessories()

  return (
    <main className="min-h-screen bg-[#f8fafc]">
      <PhuKienList initialAccessories={accessories} userEmail={user.email ?? ''} />
    </main>
  )
}
