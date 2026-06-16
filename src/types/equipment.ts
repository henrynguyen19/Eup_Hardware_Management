export interface BookmarkRecord {
  id: string
  equipment_id: string
  notes: string | null
  created_at: string
}

export interface Document {
  name: string
  url: string
  type: string  // 改為 string（原本是 'spec' | 'contract' | 'other'）
}

export interface DetailPhoto {
  public_id: string
  url: string
  caption?: string
}

export interface EquipmentCard {
  equipment_id: string
  name: string
  category: string | null
  vendor: string | null
  status: string
  tags: string[]
  notes: string | null
  main_photo: string | null
  main_photo_public_id: string | null
  detail_photos: DetailPhoto[]
  net_weight: number | null
  weight_photos: DetailPhoto[] | null  // 多ảnhẢnh khối lượng；SQL migration 執行前舊dữ liệu為 null，程式碼一律用 `?? []`
  weight_photo: string | null         // 保留：DB 舊欄位向下相容
  weight_photo_public_id: string | null  // 保留：DB 舊欄位向下相容
  documents: Document[]
  is_new: boolean
  created_at: string
  updated_at: string
  updated_by: string | null
  updated_fields?: string[] | null
}

export interface AppSettings {
  categories: string[]
  statuses: string[]        // 第一個為預設「現役」Trạng thái
  documentTypes: string[]   // Liên kết tài liệuLoại清單
  issueTypes: string[]      // 追蹤板Vấn đềLoại
  issueTags: string[]       // 追蹤板Vấn đềTags
}

export const DEFAULT_SETTINGS: AppSettings = {
  categories: ['主機', '鏡頭', '螢幕', '天線', 'Lưu媒體', '線材', '配件', '耗材', '工具', '國外設備'],
  statuses: ['Hiện hành', 'Ngừng SX'],
  documentTypes: ['Datasheet', 'Hợp đồng', 'Khác'],
  issueTypes: ['設備異常', '維修需求', '庫存問題', 'Khác'],
  issueTags: [],
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
  permissions: string[]  // 由 API JOIN 填入
}
