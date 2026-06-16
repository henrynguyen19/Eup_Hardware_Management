// ============================================================
// Types cho Module Kho — EUP Hardware Management
// ============================================================

export interface Accessory {
  id: string
  name: string
  code: string | null
  category: string | null
  description: string | null
  photo_url: string | null
  photo_public_id: string | null
  vendor: string | null
  unit: string
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface FirmwareVersion {
  id: string
  equipment_id: string
  version: string
  release_date: string | null
  is_latest: boolean
  changelog: string | null
  download_url: string | null
  release_notes_url: string | null
  created_at: string
  updated_by: string | null
}

export interface DeviceAccessory {
  id: string
  equipment_id: string
  accessory_id: string
  is_standard: boolean
  quantity: number
  notes: string | null
  created_at: string
  // Joined fields
  accessory?: Accessory
}

export interface ShippingStandardItem {
  equipment_id: string
  device_name: string
  device_category: string | null
  device_status: string
  accessory_id: string
  accessory_name: string
  accessory_code: string | null
  unit: string
  quantity: number
  notes: string | null
}

export const ACCESSORY_CATEGORIES = [
  'Cáp',
  'Adapter',
  'Bao bì',
  'Phụ kiện lắp đặt',
  'Tài liệu',
  'Khác',
] as const

export const ACCESSORY_UNITS = ['cái', 'bộ', 'mét', 'cuộn', 'tờ'] as const
