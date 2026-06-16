import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import KhoPhotoWall from '@/components/kho/KhoPhotoWall'
import type { EquipmentCard } from '@/types/equipment'
import type { FirmwareVersion } from '@/types/kho'

async function getEquipmentCards(): Promise<EquipmentCard[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data, error } = await supabase
    .from('equipment_cards')
    .select('*')
    .order('equipment_id')
  if (error) {
    console.error('Lỗi Supabase:', error)
    return []
  }
  return data ?? []
}

async function getLatestFirmware(): Promise<Record<string, FirmwareVersion>> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data } = await supabase
    .from('firmware_versions')
    .select('*')
    .eq('is_latest', true)

  const result: Record<string, FirmwareVersion> = {}
  ;(data ?? []).forEach((fw: FirmwareVersion) => {
    result[fw.equipment_id] = fw
  })
  return result
}

export default async function KhoPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [cards, latestFirmware] = await Promise.all([
    getEquipmentCards(),
    getLatestFirmware(),
  ])

  return (
    <main className="min-h-screen bg-[#f8fafc]">
      <KhoPhotoWall
        initialCards={cards}
        latestFirmware={latestFirmware}
        userEmail={user.email ?? ''}
      />
    </main>
  )
}
