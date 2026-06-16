export interface BookmarkRecord {
  id: string
  equipment_id: string
  notes: string | null
  created_at: string
}

export interface Document {
  name: string
  url: string
  type: string
}

export interface DetailPhoto {
  public_id: string
  url: string
  caption?: string
}

// ── Device Types ──────────────────────────────────────────────
export type DeviceType = 'GPS Tracker' | 'MDVR' | 'Camera' | 'Accessory' | 'Sensor' | 'Simcard' | 'Storage'

export const DEVICE_TYPES: DeviceType[] = ['GPS Tracker', 'MDVR', 'Camera', 'Accessory', 'Sensor', 'Simcard', 'Storage']

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  'GPS Tracker': 'GPS Tracker',
  'MDVR':        'MDVR',
  'Camera':      'Camera',
  'Accessory':   'Phụ kiện',
  'Sensor':      'Cảm biến',
  'Simcard':     'Sim card',
  'Storage':     'Bộ nhớ',
}

export const DEVICE_TYPE_COLORS: Record<DeviceType, { bg: string; text: string; border: string }> = {
  'GPS Tracker': { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-300'   },
  'MDVR':        { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
  'Camera':      { bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-300'  },
  'Accessory':   { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
  'Sensor':      { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  'Simcard':     { bg: 'bg-pink-100',   text: 'text-pink-700',   border: 'border-pink-300'   },
  'Storage':     { bg: 'bg-cyan-100',   text: 'text-cyan-700',   border: 'border-cyan-300'   },
}

export const DEVICE_TYPE_ICONS: Record<DeviceType, string> = {
  'GPS Tracker': '📡',
  'MDVR':        '🎥',
  'Camera':      '📷',
  'Accessory':   '🔌',
  'Sensor':      '🌡️',
  'Simcard':     '📶',
  'Storage':     '💾',
}

// ── Equipment Card ────────────────────────────────────────────
export interface EquipmentCard {
  equipment_id: string
  name: string
  device_type: DeviceType | null
  category: string | null
  vendor: string | null
  status: string
  tags: string[]
  notes: string | null
  main_photo: string | null
  main_photo_public_id: string | null
  detail_photos: DetailPhoto[]
  net_weight: number | null
  weight_photos: DetailPhoto[] | null
  weight_photo: string | null
  weight_photo_public_id: string | null
  documents: Document[]
  is_new: boolean
  created_at: string
  updated_at: string
  updated_by: string | null
  updated_fields?: string[] | null
}

export interface AppSettings {
  categories: string[]
  statuses: string[]
  documentTypes: string[]
  issueTypes: string[]
  issueTags: string[]
  device_types?: string[]
}

export const DEFAULT_SETTINGS: AppSettings = {
  categories: ['Máy chủ', 'Camera', 'Màn hình', 'Ăng-ten', 'Thiết bị lưu trữ', 'Cáp', 'Phụ kiện', 'Cảm biến', 'Vật tư', 'Công cụ'],
  statuses: ['Hiện hành', 'Ngừng SX'],
  documentTypes: ['Datasheet', 'Hợp đồng', 'Khác'],
  issueTypes: ['Thiếu hàng', 'Firmware', 'Sửa chữa', 'Phản hồi khách hàng', 'Khác'],
  issueTags: [],
  device_types: ['GPS Tracker', 'MDVR', 'Camera', 'Accessory', 'Sensor', 'Simcard', 'Storage'],
}

export interface GroupItem {
  equipment_id: string
  added_at: string
}

export interface UserGroup {
  id: string
  name: string
  is_default: boolean
  sort_order: number
  created_at: string
  group_items: GroupItem[]
}

export interface Role {
  id: string
  name: string
  is_system: boolean
  created_at: string
  permissions: string[]
}
