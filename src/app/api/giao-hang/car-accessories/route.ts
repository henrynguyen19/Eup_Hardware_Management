import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getCRMSessionForUser } from '@/lib/crm-session'

const CRM_SOAP_URL = process.env.CRM_SOAP_URL ?? ''

async function crmCall(methodName: string, param: Record<string, unknown>, sessionId: string, identity: string) {
  if (!CRM_SOAP_URL) return { ok: false, result: null }
  const form = new URLSearchParams()
  form.append('MethodName', methodName)
  form.append('Param',      JSON.stringify(param))
  form.append('SESSION_ID', sessionId)
  form.append('IDENTITY',   identity)
  try {
    const resp = await fetch(CRM_SOAP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(12_000),
    })
    const json = await resp.json() as Record<string, unknown>
    if (!json.status || json.status === 0) return { ok: false, result: null }
    return { ok: true, result: json.result }
  } catch { return { ok: false, result: null } }
}

export interface AccessoryEntry { code: string; typeName: string }
export interface CarAccessories {
  /** GPS/MDVR barcode */
  barcode:    string
  carUnicode: string | null
  /** QP_ProductKind → list of Device_Code */
  byKind:     Record<number, AccessoryEntry[]>
}

/**
 * POST /api/giao-hang/car-accessories
 * Body: { barcodes: string[], stockupKind?: string }
 * → Với mỗi barcode:
 *   1. GetStockupDetail → CarUnicode
 *   2. GetCarList(Unicode) → SIM (kind=3), thẻ nhớ/ổ cứng (kind=2)
 * → Trả về CarAccessories[] để client map vào biên bản bàn giao
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const { barcodes, stockupKind = '0' } = await req.json() as { barcodes: string[]; stockupKind?: string }
    if (!Array.isArray(barcodes) || barcodes.length === 0) {
      return NextResponse.json({ error: 'Cần truyền barcodes[]' }, { status: 400 })
    }

    const { sessionId, identity } = await getCRMSessionForUser(user.id)

    const BATCH = 4
    const results: CarAccessories[] = []

    for (let i = 0; i < barcodes.length; i += BATCH) {
      const chunk = barcodes.slice(i, i + BATCH)
      const chunkResults = await Promise.all(chunk.map(async (barcode): Promise<CarAccessories> => {
        // Bước 1: GetStockupDetail → CarUnicode
        const stockRes = await crmCall('GetStockupDetail', { Barcode: barcode, StockupKind: stockupKind }, sessionId, identity)
        let carUnicode: string | null = null
        if (stockRes.ok && Array.isArray(stockRes.result) && stockRes.result.length > 0) {
          const s = stockRes.result[0] as Record<string, unknown>
          carUnicode = String(s.CarUnicode ?? '').trim() || null
        }

        if (!carUnicode) return { barcode, carUnicode: null, byKind: {} }

        // Bước 2: GetCarList → accessories
        const carRes = await crmCall('GetCarList', { Unicode: carUnicode, Used: null }, sessionId, identity)
        const byKind: Record<number, AccessoryEntry[]> = {}
        if (carRes.ok && Array.isArray(carRes.result) && carRes.result.length > 0) {
          const car = carRes.result[0] as Record<string, unknown>
          if (Array.isArray(car.Devices)) {
            for (const d of car.Devices as Record<string, unknown>[]) {
              const kind = Number(d.QP_ProductKind ?? -99)
              const code = String(d.Device_Code ?? '').trim()
              // Bỏ qua device chính (kind=0/-1) và barcodes trùng với input
              if ((kind === 0 || kind === -1) && barcodes.includes(code)) continue
              if (!code) continue
              if (!byKind[kind]) byKind[kind] = []
              byKind[kind].push({ code, typeName: String(d.Device_TypeName ?? '') })
            }
          }
        }

        return { barcode, carUnicode, byKind }
      }))
      results.push(...chunkResults)
    }

    return NextResponse.json({ ok: true, results })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
