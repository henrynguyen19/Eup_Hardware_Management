/**
 * POST /api/kho/van-hanh
 * Các thao tác vận hành kho: thu hồi, gửi thẻ RFID, tra cứu TB, báo cáo SIM, tồn kho
 * Body: { action, imeis: string[], ... }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getCRMSessionForUser } from '@/lib/crm-session'

export const runtime     = 'nodejs'
export const maxDuration = 120

const CRM_URL = () => process.env.CRM_SOAP_URL ?? ''

async function crmCall(
  methodName: string,
  param: Record<string, unknown>,
  sessionId: string,
  identity: string,
  timeoutMs = 15_000
): Promise<{ ok: boolean; result: unknown; error?: string }> {
  const url = CRM_URL()
  if (!url) return { ok: false, result: null, error: 'Thiếu CRM_SOAP_URL' }
  const form = new URLSearchParams()
  form.append('MethodName', methodName)
  form.append('Param', JSON.stringify(param))
  form.append('SESSION_ID', sessionId)
  form.append('IDENTITY', identity)
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(process.env.PROXY_SECRET ? { 'x-proxy-secret': process.env.PROXY_SECRET } : {}),
      },
      body: form.toString(),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const json = await resp.json() as Record<string, unknown>
    if (!json.status || json.status === 0) {
      return { ok: false, result: json, error: String(json.error ?? json.message ?? 'CRM lỗi') }
    }
    return { ok: true, result: json.result }
  } catch (e) {
    return { ok: false, result: null, error: String(e) }
  }
}

// ── Xử lý batch IMEIs song song theo chunks ──────────────────────────────────
async function processBatch<T>(
  imeis: string[],
  chunkSize: number,
  handler: (imei: string) => Promise<T>
): Promise<T[]> {
  const results: T[] = []
  for (let i = 0; i < imeis.length; i += chunkSize) {
    const chunk = imeis.slice(i, i + chunkSize)
    const chunkResults = await Promise.all(chunk.map(handler))
    results.push(...chunkResults)
  }
  return results
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    action?: string
    imeis?: string[]
    // tồn kho params
    warehouseId?: string
    productNumbers?: string[]
  }

  const { action, imeis = [] } = body
  if (!action) return NextResponse.json({ error: 'Thiếu action' }, { status: 400 })

  const { sessionId, identity } = await getCRMSessionForUser(user.id)

  // ────────────────────────────────────────────────────────────────────────────
  // 1. THU HỒI THIẾT BỊ — UpdateBackFactory
  // ────────────────────────────────────────────────────────────────────────────
  if (action === 'thu-hoi') {
    if (!imeis.length) return NextResponse.json({ error: 'Cần ít nhất 1 IMEI' }, { status: 400 })
    const results = await processBatch(imeis, 5, async (imei) => {
      const r = await crmCall('UpdateBackFactory', {
        BF_BackManID: identity,
        TransStock: '303',
        BF_DeviceCode: imei,
      }, sessionId, identity, 15_000)
      return { imei, ok: r.ok, error: r.error, result: r.result }
    })
    const success = results.filter(r => r.ok).length
    return NextResponse.json({ ok: true, action, results, success, fail: results.length - success })
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 2. GỬI THẺ RFID — TransferWareHouse
  // ────────────────────────────────────────────────────────────────────────────
  if (action === 'the-rfid') {
    if (!imeis.length) return NextResponse.json({ error: 'Cần ít nhất 1 IMEI' }, { status: 400 })
    const results = await processBatch(imeis, 10, async (imei) => {
      const r = await crmCall('TransferWareHouse', {
        TransferManID: identity,
        WH_ID: '267',
        IsTransfer: 'true',
        TransferManType: '1',
        StockupKind: '0',
        TransferCode: imei,
      }, sessionId, identity, 12_000)
      return { imei, ok: r.ok, error: r.error, result: r.result }
    })
    const success = results.filter(r => r.ok).length
    return NextResponse.json({ ok: true, action, results, success, fail: results.length - success })
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 3. BÁO CÁO SIM — GetSimCard
  // ────────────────────────────────────────────────────────────────────────────
  if (action === 'sim-card') {
    if (!imeis.length) return NextResponse.json({ error: 'Cần ít nhất 1 IMEI' }, { status: 400 })
    const results = await processBatch(imeis, 10, async (imei) => {
      const r = await crmCall('GetSimCard', { SimBarcode: imei }, sessionId, identity, 12_000)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = (Array.isArray(r.result) && r.result.length > 0) ? (r.result[0] as any) : null
      return {
        imei,
        ok: r.ok && !!item,
        simKind: item?.SimKindSchemeName ?? null,
        simStatus: item?.SimStatus ?? null,
        phone: item?.SimPhone ?? null,
        carrier: item?.SimCarrierName ?? null,
        dataPackage: item?.DataSchemeName ?? null,
        error: r.ok ? (item ? undefined : 'Không tìm thấy SIM') : r.error,
      }
    })
    return NextResponse.json({ ok: true, action, results })
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 4. TRA CỨU THIẾT BỊ — GetStockupDetail (kind 0, fallback kind 2)
  // ────────────────────────────────────────────────────────────────────────────
  if (action === 'tra-cuu') {
    if (!imeis.length) return NextResponse.json({ error: 'Cần ít nhất 1 IMEI' }, { status: 400 })
    const results = await processBatch(imeis, 10, async (imei) => {
      // Thử kind 0 trước
      let r = await crmCall('GetStockupDetail', { Barcode: imei, StockupKind: '0' }, sessionId, identity, 12_000)
      // Fallback kind 2 nếu không tìm thấy
      if (!r.ok || !Array.isArray(r.result) || r.result.length === 0) {
        r = await crmCall('GetStockupDetail', { Barcode: imei, StockupKind: '2' }, sessionId, identity, 12_000)
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = (Array.isArray(r.result) && r.result.length > 0) ? (r.result[0] as any) : null
      return {
        imei,
        ok: !!item,
        productName: item?.ProductName ?? null,
        productBarcode: item?.ProductBarcode ?? null,
        sourceStock: item?.SourceStock ?? null,
        destStock: item?.DestStock ?? null,
        status: item?.Status ?? null,
        updateTime: item?.UpdateTime ?? null,
        updateMan: item?.UpdateMan ?? null,
        updateAction: item?.UpdateAction ?? null,
        carUnicode: item?.CarUnicode ?? null,
        technicianName: item?.TechnicianName ?? null,
        error: item ? undefined : (r.error ?? 'Không tìm thấy thiết bị'),
      }
    })
    return NextResponse.json({ ok: true, action, results })
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 5. TỒN KHO theo IMEI — GetWarehouseQueue per device
  // ────────────────────────────────────────────────────────────────────────────
  if (action === 'ton-kho') {
    if (!imeis.length) return NextResponse.json({ error: 'Cần ít nhất 1 IMEI' }, { status: 400 })
    const results = await processBatch(imeis, 5, async (imei) => {
      const r = await crmCall('GetWarehouseQueue', {
        Device_Code: imei,
        Staff_ID: identity,
      }, sessionId, identity, 15_000)
      return { imei, ok: r.ok, data: r.result, error: r.error }
    })
    return NextResponse.json({ ok: true, action, results })
  }

  return NextResponse.json({ error: `Action không hợp lệ: ${action}` }, { status: 400 })
}
