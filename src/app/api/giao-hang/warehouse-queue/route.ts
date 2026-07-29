import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getCRMSessionForUser } from '@/lib/crm-session'

const CRM_SOAP_URL = process.env.CRM_SOAP_URL ?? ''

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
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(15_000),
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

// StockupKind values
const STOCKUP_KINDS = [
  { kind: -1, label: 'Tracker/GPS',   labelEn: 'Tracker/GPS' },
  { kind:  0, label: 'Thiết bị',      labelEn: 'Device barcode' },
  { kind:  2, label: 'Phụ kiện',      labelEn: 'Accessories' },
  { kind:  3, label: 'Sim Card',      labelEn: 'SIM Card' },
]

export interface WaitingProduct {
  productName:   string
  productNumber: string
  stockupKind:   number
  kindLabel:     string
  kindLabelEn:   string
  waitCount:     number
  transCount:    number
  canUseCount:   number
  notUseCount:   number
  whId:          number
  whName:        string
}

export interface WaitingDevice {
  barcode:      string
  productName:  string
  carUnicode:   string
  sourceStock:  string
  destStock:    string
  status:       string   // 'HAVE' | 'TRANS'
  updateMan:    string
  updateTime:   string
  stockupKind:  number
  productNumber: string
}

export interface WarehouseQueueResult {
  whcId:    number
  whId:     number
  products: WaitingProduct[]
  devices:  WaitingDevice[]
}

/**
 * GET /api/giao-hang/warehouse-queue?whc_id=2&wh_id=64
 *
 * Lấy danh sách thiết bị đang chờ nhận tại một kho kỹ thuật.
 * 1. Gọi GetStockupList cho từng StockupKind (-1, 0, 2, 3)
 * 2. Với mỗi product có WaitCount > 0, gọi GetStockupListDetail (StockupType=1)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const sp     = req.nextUrl.searchParams
    const whcId  = parseInt(sp.get('whc_id') ?? '')
    const whId   = parseInt(sp.get('wh_id')  ?? '')
    if (isNaN(whcId) || isNaN(whId)) {
      return NextResponse.json({ error: 'Cần whc_id và wh_id' }, { status: 400 })
    }

    const { sessionId, identity } = await getCRMSessionForUser(user.id)

    // ── Bước 1: GetStockupList cho từng kind ─────────────────────────────────
    const allProducts: WaitingProduct[] = []

    await Promise.all(STOCKUP_KINDS.map(async ({ kind, label, labelEn }) => {
      const res = await crmCall(
        'GetStockupList',
        { WH_WHCID: String(whcId), WH_ID: String(whId), StockupKind: String(kind) },
        sessionId, identity,
      )
      if (!res.ok || !Array.isArray(res.result)) return
      for (const row of res.result as Record<string, unknown>[]) {
        const waitCount = Number(row.WaitCount ?? 0)
        if (waitCount <= 0) continue
        allProducts.push({
          productName:   String(row.ProductName   ?? ''),
          productNumber: String(row.ProductNumber ?? ''),
          stockupKind:   kind,
          kindLabel:     label,
          kindLabelEn:   labelEn,
          waitCount,
          transCount:    Number(row.TransCount   ?? 0),
          canUseCount:   Number(row.CanUseCount  ?? 0),
          notUseCount:   Number(row.NotUseCount  ?? 0),
          whId:          Number(row.WH_ID        ?? whId),
          whName:        String(row.WH_Name      ?? ''),
        })
      }
    }))

    // ── Bước 2: GetStockupListDetail cho từng product có WaitCount > 0 ───────
    const allDevices: WaitingDevice[] = []
    const BATCH = 4

    for (let i = 0; i < allProducts.length; i += BATCH) {
      const chunk = allProducts.slice(i, i + BATCH)
      const chunkDevices = await Promise.all(chunk.map(async (product) => {
        const res = await crmCall(
          'GetStockupListDetail',
          {
            WH_ID:         String(product.whId),
            StockupKind:   String(product.stockupKind),
            StockupType:   '1',   // 1 = Chờ nhận (Wait)
            ProductNumber: product.productNumber,
          },
          sessionId, identity,
        )
        if (!res.ok || !Array.isArray(res.result)) return []
        return (res.result as Record<string, unknown>[]).map(d => ({
          barcode:       String(d.ProductBarcode ?? ''),
          productName:   String(d.ProductName   ?? product.productName),
          carUnicode:    String(d.CarUnicode     ?? ''),
          sourceStock:   String(d.SourceStock    ?? ''),
          destStock:     String(d.DestStock      ?? ''),
          status:        String(d.Status         ?? '').toUpperCase(),
          updateMan:     String(d.UpdateMan      ?? ''),
          updateTime:    String(d.UpdateTime     ?? ''),
          stockupKind:   product.stockupKind,
          productNumber: product.productNumber,
        } as WaitingDevice))
      }))
      allDevices.push(...chunkDevices.flat())
    }

    return NextResponse.json({
      ok: true,
      whcId,
      whId,
      products: allProducts,
      devices:  allDevices,
    } as { ok: boolean } & WarehouseQueueResult)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
