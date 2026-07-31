/**
 * Shared CRM utilities — dùng chung cho sync, sync-all, debug routes.
 */

/**
 * Generic CRM SOAP call — dùng process.env.CRM_SOAP_URL.
 * Tất cả CRM routes nên gọi qua hàm này thay vì tự build form.
 *
 * @param methodName  Tên method CRM (VD: 'GetCustServiceByStaff', 'GetDeviceRepair')
 * @param param       Object params gửi vào Param JSON
 * @param sessionId   SESSION_ID lấy từ getCRMSessionForUser()
 * @param identity    IDENTITY lấy từ getCRMSessionForUser()
 * @param timeoutMs   Timeout mặc định 55 giây
 * @returns           Mảng kết quả json.result (typed theo T)
 */
export async function callCrmSoap<T = Record<string, unknown>>(
  methodName: string,
  param: Record<string, unknown>,
  sessionId: string,
  identity: string,
  timeoutMs = 55_000
): Promise<T[]> {
  const url = process.env.CRM_SOAP_URL
  if (!url) throw new Error('Thiếu CRM_SOAP_URL trong .env')

  const form = new URLSearchParams()
  form.append('MethodName', methodName)
  form.append('Param', JSON.stringify(param))
  form.append('SESSION_ID', sessionId)
  form.append('IDENTITY',   identity)

  const resp = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    form.toString(),
    signal:  AbortSignal.timeout(timeoutMs),
  })
  if (!resp.ok) throw new Error(`CRM HTTP ${resp.status}`)

  const raw = await resp.text()
  if (!raw?.trim()) throw new Error('CRM trả về body rỗng')

  const json = JSON.parse(raw) as { status: number; error: string; result?: T[] }
  if (!json.status) throw new Error(json.error || 'CRM status=0')
  return json.result ?? []
}

export const KNOWN_STAFF       = ['Kane', 'Stefan', 'Shiro', 'Irene', 'Blue'] as const
export const KNOWN_STAFF_LOWER = KNOWN_STAFF.map(n => n.toLowerCase())

export type SpeedTag = 'fast' | 'normal' | 'low' | 'hen' | 'mai_bao_lai'

/**
 * Detect tên nhân viên từ CS_Memo.
 *
 * Quy tắc (theo thứ tự ưu tiên):
 *  1. Tên + ngày  (Kane 12/6, 12/6 Kane) — dấu hiệu chính
 *  2. #report Tên / #sp Tên
 *  3. Tên xuất hiện bất kỳ đâu trong memo (case-insensitive, không cần word boundary)
 *     → "kane", "KANE", "#Kane", "stefan.", v.v. đều được chấp nhận
 *
 * Returns: tên chuẩn (Kane/Stefan/...) hoặc null nếu không tìm thấy.
 */
export function extractHandlerFromMemo(memo: string): string | null {
  if (!memo) return null
  const lower = memo.toLowerCase()

  // Ưu tiên 1: Tên + ngày hoặc ngày + Tên (khoảng trắng tùy ý)
  for (let i = 0; i < KNOWN_STAFF_LOWER.length; i++) {
    const n = KNOWN_STAFF_LOWER[i]
    if (new RegExp(`${n}\\s*\\d{1,2}/\\d{1,2}`, 'i').test(lower)) return KNOWN_STAFF[i]
    if (new RegExp(`\\d{1,2}/\\d{1,2}\\s*${n}`, 'i').test(lower)) return KNOWN_STAFF[i]
  }

  // Ưu tiên 2: #report Tên / #sp Tên
  const reportMatch = lower.match(/#(?:report|sp)\s+(\w+)/)
  if (reportMatch) {
    const found = KNOWN_STAFF_LOWER.findIndex(n => reportMatch[1].toLowerCase().includes(n))
    if (found !== -1) return KNOWN_STAFF[found]
  }

  // Ưu tiên 3: tên xuất hiện bất kỳ đâu — case-insensitive, không cần word boundary
  // "kane", "KANE", "#Kane", "stefan." đều match
  for (let i = 0; i < KNOWN_STAFF_LOWER.length; i++) {
    if (lower.includes(KNOWN_STAFF_LOWER[i])) return KNOWN_STAFF[i]
  }

  return null
}

/**
 * Parse speed tag từ CS_Memo.
 */
export function parseSpeedTag(memo: string): SpeedTag | null {
  const s = (memo ?? '').toLowerCase()
  let tag: SpeedTag | null = null

  // "Cần theo dõi" có ưu tiên cao nhất — ghi đè #f/#n/#l
  if (/mai báo lại/i.test(s) || /mai bao lai/i.test(s) || /#mbl\b/i.test(s)) {
    tag = 'mai_bao_lai'
  } else if (/\bhẹn\b/i.test(s) || /#hen\b/i.test(s)) {
    tag = 'hen'
  } else if (/#f\b/.test(s)) {
    tag = 'fast'
  } else if (/#n\b/.test(s)) {
    tag = 'normal'
  } else if (/#l\b/.test(s)) {
    tag = 'low'
  }

  // #update (hoặc "update:" khi CRM strip dấu #) = đã xử lý → reset về null
  if ((/#update\b/i.test(s) || /\bupdate:/i.test(s)) && (tag === 'hen' || tag === 'mai_bao_lai')) tag = null
  return tag
}

/**
 * Parse CRM timestamp sang ISO string.
 */
export function parseCRMTime(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const d = new Date(raw.replace(' ', 'T'))
    return isNaN(d.getTime()) ? null : d.toISOString()
  } catch {
    return null
  }
}
