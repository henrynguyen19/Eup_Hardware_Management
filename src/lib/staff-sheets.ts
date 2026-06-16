// ============================================================
// Cấu hình Google Sheets cho đội Hỗ trợ kỹ thuật
// ============================================================

export interface StaffConfig {
  name: string
  email: string
  sheetId: string
  color: string
  bgClass: string
  textClass: string
}

export const STAFF_SHEETS: StaffConfig[] = [
  {
    name: 'Kane',
    email: 'kane@eup.net.vn',
    sheetId: '1DhBpqKJbmOTMDGt0oAkERmMOVJ5xgNu7K_yr0H3Gj1U',
    color: 'blue',
    bgClass: 'bg-blue-100 text-blue-700',
    textClass: 'text-blue-600',
  },
  {
    name: 'Stefan',
    email: 'stefan@eup.net.vn',
    sheetId: '1mIpyQAxstjiIk8DJ7dTGMEsKQWw1_luMgIv6NmJ04NI',
    color: 'purple',
    bgClass: 'bg-purple-100 text-purple-700',
    textClass: 'text-purple-600',
  },
  {
    name: 'Shiro',
    email: 'shiro@eup.net.vn',
    sheetId: '1D0PVhwBrpzt0HgOTRmsUu_bb_7_P0-b9frDDwz7G1j0',
    color: 'green',
    bgClass: 'bg-green-100 text-green-700',
    textClass: 'text-green-600',
  },
  {
    name: 'Irene',
    email: 'irene@eup.net.vn',
    sheetId: '1voBqUqcenCdmxctyS9TNI8uoCZxqh8d3t-NSGrVpeN0',
    color: 'pink',
    bgClass: 'bg-pink-100 text-pink-700',
    textClass: 'text-pink-600',
  },
  {
    name: 'Blue',
    email: 'blue@eup.net.vn',
    sheetId: '1DwWDd8O5lRyqgjavfTGLPgxGvw3m9wXHXkHDStUNBVg',
    color: 'orange',
    bgClass: 'bg-orange-100 text-orange-700',
    textClass: 'text-orange-600',
  },
]

export const SUMMARY_SHEET_ID = '1NoYiwiIVjoJNBt-mqWthbcBZg2X3ToDf5WCoCPdiNsw'

export function getStaffByEmail(email: string): StaffConfig | undefined {
  return STAFF_SHEETS.find(s => s.email.toLowerCase() === email.toLowerCase())
}

export function getStaffBySheetId(sheetId: string): StaffConfig | undefined {
  return STAFF_SHEETS.find(s => s.sheetId === sheetId)
}

// Tạo danh sách tháng (24 tháng gần nhất)
export function getAvailableMonths(): { label: string; month: number; year: number; yearShort: string }[] {
  const result = []
  const now = new Date()
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const month = d.getMonth() + 1
    const year = d.getFullYear()
    const yearShort = String(year).slice(2)
    result.push({ label: `Tháng ${month}/${yearShort}`, month, year, yearShort })
  }
  return result
}
