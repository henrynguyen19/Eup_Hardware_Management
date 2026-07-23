import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getCRMSessionForUser } from '@/lib/crm-session'

const CRM_SOAP_URL = process.env.CRM_SOAP_URL ?? ''

const COMPANY_WAREHOUSES = (() => {
  const env = process.env.COMPANY_WAREHOUSE_NAMES
  if (env) return env.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return ['warehouse-admin', 'hardware-machine', 'old device', 'return customer']
})()

function isCompanyWarehouse(src: string) {
  return COMPANY_WAREHOUSES.some(w => src.toLowerCase().trim() === w)
}

async function crmCall(
  methodName: string,
  param: Record<string, unknown>,
  sessionId: string,
  identity: string,
) {
  if (!CRM_SOAP_URL) return { ok: false, result: null, error: 'Thiếu CRM_SOAP_URL' }
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
    if (!json.status || json.status === 0) {
      return { ok: false, result: json, error: String(json.error ?? json.message ?? 'CRM error') }
    }
    return { ok: true, result: json.result }
  } catch (e) {
    return { ok: false, result: null, error: String(e) }
  }
}

export interface SerialCheckResult {
  serial:       string
  ok:           boolean
  productName:  string
  sourceStock:  string
  destStock:    string
  updateTime:   string
  updateMan:    string
  transferred:  boolean   // true = đã chuyển ra khỏi kho công ty
  error?:       string
}

/**
 * POST /api/giao-hang/batch-crm-check
 * Body: { serials: string[] }
 * Kiểm tra từng serial xem đã chuyển kho chưa (song song, tối đa 6 cùng lúc)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const { serials } = await req.json() as { serials: string[] }
    if (!Array.isArray(serials) || serials.length === 0) {
      return NextResponse.json({ error: 'Cần truyền mảng serials' }, { status: 400 })
    }

    const { sessionId, identity } = await getCRMSessionForUser(user.id)

    // StockupKind theo loại thiết bị:
    //   2 = phụ kiện (camera, cảm biến, đầu đọc thẻ, ...) — thử trước
    //   0 = GPS Tracker / MDVR (IMEI thiết bị chính)
    //   3 = SIM card (IMEI sim)
    const STOCKUP_KINDS = ['2', '0', '3']

    async function getStockupDetail(serial: string) {
      for (const kind of STOCKUP_KINDS) {
        const res = await crmCall(
          'GetStockupDetail',
          { Barcode: serial, StockupKind: kind },
          sessionId, identity,
        )
        if (res.ok && Array.isArray(res.result) && res.result.length > 0) {
          return res
        }
      }
      return { ok: false, result: null, error: 'Không tìm thấy' }
    }

    // Check song song, mỗi batch 6 serial
    const BATCH = 6
    const results: SerialCheckResult[] = []

    for (let i = 0; i < serials.length; i += BATCH) {
      const chunk = serials.slice(i, i + BATCH)
      const chunkResults = await Promise.all(chunk.map(async (serial): Promise<SerialCheckResult> => {
        const res = await getStockupDetail(serial)
        if (!res.ok || !Array.isArray(res.result) || res.result.length === 0) {
          return {
            serial, ok: false, productName: '', sourceStock: '', destStock: '',
            updateTime: '', updateMan: '', transferred: false,
            error: (res as { error?: string }).error ?? 'Không tìm thấy',
          }
        }
        const s = res.result[0] as Record<string, unknown>
        const sourceStock = String(s.SourceStock ?? '')
        return {
          serial,
          ok:          true,
          productName: String(s.ProductName    ?? ''),
          sourceStock,
          destStock:   String(s.DestStock      ?? ''),
          updateTime:  String(s.UpdateTime     ?? ''),
          updateMan:   String(s.UpdateMan      ?? ''),
          transferred: !isCompanyWarehouse(sourceStock),
        }
      }))
      results.push(...chunkResults)
    }

    return NextResponse.json({ ok: true, results })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
