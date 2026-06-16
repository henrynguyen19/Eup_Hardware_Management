import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import TieuChuanXuatHang from '@/components/kho/TieuChuanXuatHang'
import type { ShippingStandardItem } from '@/types/kho'

async function getShippingStandards(): Promise<ShippingStandardItem[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data, error } = await supabase
    .from('shipping_standards_view')
    .select('*')
  if (error) {
    console.error('Lỗi:', error)
    return []
  }
  return data ?? []
}

export default async function TieuChuanPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const standards = await getShippingStandards()

  return (
    <main className="min-h-screen bg-[#f8fafc]">
      <TieuChuanXuatHang standards={standards} userEmail={user.email ?? ''} />
    </main>
  )
}
