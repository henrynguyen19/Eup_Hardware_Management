import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import FirmwareList from '@/components/kho/FirmwareList'
import type { FirmwareVersion } from '@/types/kho'
import type { EquipmentCard } from '@/types/equipment'

async function getFirmwareWithDevices(): Promise<{
  firmware: FirmwareVersion[]
  devices: Record<string, EquipmentCard>
}> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const [fwResult, devResult] = await Promise.all([
    supabase.from('firmware_versions').select('*').order('equipment_id').order('release_date', { ascending: false }),
    supabase.from('equipment_cards').select('equipment_id, name, category, main_photo'),
  ])

  const devices: Record<string, EquipmentCard> = {}
  ;(devResult.data ?? []).forEach((d: EquipmentCard) => {
    devices[d.equipment_id] = d
  })

  return {
    firmware: fwResult.data ?? [],
    devices,
  }
}

export default async function FirmwarePage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { firmware, devices } = await getFirmwareWithDevices()

  return (
    <main className="min-h-screen bg-[#f8fafc]">
      <FirmwareList
        firmware={firmware}
        devices={devices}
        userEmail={user.email ?? ''}
      />
    </main>
  )
}
