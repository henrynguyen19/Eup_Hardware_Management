import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getCRMSessionForUser } from '@/lib/crm-session'

const CRM_SOAP_URL = process.env.CRM_SOAP_URL ?? ''

/** Gọi một method CRM SOAP với session đã có */
async function crmCall(
  methodName: string,
  param: Record<string, unknown>,
  sessionId: string,
  identity: string,
): Promise<{ ok: boolean; result: unknown; error?: string }> {
  if (!CRM_SOAP_URL) return { ok: false, result: null, error: 'Thiếu CRM_SOAP_URL' }

  const form = new URLSearchParams()
  form.append('MethodName', methodName)
  form.append('Param',      JSON.stringify(param))
  form.append('SESSION_ID', sessionId)
  form.append('IDENTITY',   identity)

  try {
    const resp = await fetch(CRM_SOAP_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    form.toString(),
      signal:  AbortSignal.timeout(15_000),
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

// ─── Component item shape từ GetCarList ──────────────────────────────────────
interface CRMComponent {
  Device_ID:         number
  Device_Type:       number
  Device_TypeName:   string
  Device_Code:       string
  QP_ProductKind:    number
  QP_ProductKindName: string
}

// ─── GET /api/giao-hang/crm-check?unicode=30052739 ───────────────────────────
export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const unicode = req.nextUrl.searchParams.get('unicode')?.trim()
    if (!unicode) return NextResponse.json({ error: 'Thiếu unicode' }, { status: 400 })

    // Lấy session CRM của user hiện tại
    const { sessionId, identity } = await getCRMSessionForUser(user.id)

    // Gọi song song 2 API
    const [stockRes, carRes] = await Promise.all([
      crmCall('GetStockupDetail', { Barcode: unicode, StockupKind: '-1' }, sessionId, identity),
      crmCall('GetCarList',       { Unicode: unicode, Used: null },         sessionId, identity),
    ])

    // Parse GetStockupDetail
    let stockInfo: {
      status: string; productName: string; productBarcode: string
      sourceStock: string; destStock: string; updateTime: string; updateMan: string; updateAction: string
    } | null = null

    if (stockRes.ok && Array.isArray(stockRes.result) && stockRes.result.length > 0) {
      const s = stockRes.result[0] as Record<string, unknown>
      stockInfo = {
        status:        String(s.Status       ?? ''),
        productName:   String(s.ProductName  ?? ''),
        productBarcode: String(s.ProductBarcode ?? ''),
        sourceStock:   String(s.SourceStock  ?? ''),
        destStock:     String(s.DestStock    ?? ''),
        updateTime:    String(s.UpdateTime   ?? ''),
        updateMan:     String(s.UpdateMan    ?? ''),
        updateAction:  String(s.UpdateAction ?? ''),
      }
    }

    // Parse GetCarList — lấy components từ result[0].Devices
    let components: CRMComponent[] = []
    if (carRes.ok && Array.isArray(carRes.result) && carRes.result.length > 0) {
      const car = carRes.result[0] as Record<string, unknown>
      if (Array.isArray(car.Devices)) {
        components = (car.Devices as Record<string, unknown>[]).map(d => ({
          Device_ID:          Number(d.Device_ID   ?? 0),
          Device_Type:        Number(d.Device_Type ?? 0),
          Device_TypeName:    String(d.Device_TypeName    ?? ''),
          Device_Code:        String(d.Device_Code        ?? ''),
          QP_ProductKind:     Number(d.QP_ProductKind     ?? 0),
          QP_ProductKindName: String(d.QP_ProductKindName ?? ''),
        }))
      }
    }

    // Nhóm components theo loại cho dễ đọc
    const grouped = components.reduce<Record<string, CRMComponent[]>>((acc, c) => {
      const key = c.QP_ProductKindName || 'Other'
      if (!acc[key]) acc[key] = []
      acc[key].push(c)
      return acc
    }, {})

    return NextResponse.json({
      ok:         true,
      unicode,
      stock:      stockInfo,
      components,
      grouped,
      stock_error: stockRes.ok ? undefined : stockRes.error,
      car_error:   carRes.ok   ? undefined : carRes.error,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
