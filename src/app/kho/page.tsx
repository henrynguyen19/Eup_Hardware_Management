import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import KhoPhotoWall from '@/components/kho/KhoPhotoWall'
import type { EquipmentCard } from '@/types/equipment'
import type { FirmwareVersion } from '@/types/kho'

const adminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function getEquipmentCards(): Promise<EquipmentCard[]> {
  const { data, error } = await adminClient()
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
  const { data } = await adminClient()
    .from('firmware_versions')
    .select('*')
    .eq('is_latest', true)

  const result: Record<string, FirmwareVersion> = {}
  ;(data ?? []).forEach((fw: FirmwareVersion) => {
    result[fw.equipment_id] = fw
  })
  return result
}

async function getUserPermissions(userId: string): Promise<string[]> {
  const { data } = await adminClient()
    .from('user_permissions_view')
    .select('permissions')
    .eq('user_id', userId)
    .single()
  return data?.permissions ?? []
}

export default async function KhoPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [cards, latestFirmware, permissions] = await Promise.all([
    getEquipmentCards(),
    getLatestFirmware(),
    getUserPermissions(user.id),
  ])

  const isAdmin = permissions.includes('admin:users')
  const canWrite = permissions.includes('kho:write') || isAdmin

  return (
    <main className="min-h-screen bg-[#f8fafc]">
      <KhoPhotoWall
        initialCards={cards}
        latestFirmware={latestFirmware}
        userEmail={user.email ?? ''}
        canWrite={canWrite}
        isAdmin={isAdmin}
      />
    </main>
  )
}
