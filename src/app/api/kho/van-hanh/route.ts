/**
 * POST /api/kho/van-hanh
 * Các thao tác vận hành kho: thu hồi, gửi thẻ RFID, tra cứu TB, báo cáo SIM,
 * tồn kho, gửi đi SC.
 *
 * Body: { action, imeis?: string[], warehouseIds?: string[], stockupKind?: string }
 *
 * Write actions (admin only): thu-hoi, the-rfid, gui-sc
 * Read actions (all auth users): sim-card, tra-cuu, ton-kho
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getCRMSessionForUser } from '@/lib/crm-session'
import { isAdminUser, getUserPermKeys } from '@/lib/auth-helpers'

export const runtime     = 'nodejs'
export const maxDuration = 120

const MAX_ITEMS = 200 // giới hạn tối đa mỗi request

const WRITE_ACTIONS = new Set(['thu-hoi', 'the-rfid', 'gui-sc'])

function crmUrl() { return process.env.CRM_SOAP_URL ?? '' }

async function crmCall(
  methodName: string,
  param: Record<string, unknown>,
  sessionId: string,
  identity: string,
  timeoutMs = 15_000
): Promise<{ ok: boolean; result: unknown; error?: string }> {
  const url = crmUrl()
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

async function processBatch<T>(
  items: string[],
  chunkSize: number,
  handler: (item: string) => Promise<T>
): Promise<T[]> {
  const results: T[] = []
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)
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
    warehouseIds?: string[]
    stockupKind?: string
  }

  const { action } = body
  if (!action) return NextResponse.json({ error: 'Thiếu action' }, { status: 400 })

  // ── Quyền cho write operations: Admin HOẶC kho_daily:write ──────────────
  if (WRITE_ACTIONS.has(action)) {
    const [admin, permKeys] = await Promise.all([
      isAdminUser(user.id),
      getUserPermKeys(user.id),
    ])
    const canWrite = admin || permKeys.has('kho_daily:write')
    if (!canWrite) {
      return NextResponse.json(
        { error: `Thao tác '${action}' yêu cầu quyền kho_daily:write hoặc Admin` },
        { status: 403 }
      )
    }
  }

  const imeis = (body.imeis ?? []).slice(0, MAX_ITEMS)
  const warehouseIds = (body.warehouseIds ?? []).slice(0, MAX_ITEMS)

  const { sessionId, identity } = await getCRMSessionForUser(user.id)

  // ══════════════════════════════════════════════════════════════════════════
  // 1. THU HỒI THIẾT BỊ — UpdateBackFactory (TransStock: 303)
  // ══════════════════════════════════════════════════════════════════════════
  if (action === 'thu-hoi') {
    if (!imeis.length) return NextResponse.json({ error: 'Cần ít nhất 1 IMEI' }, { status: 400 })
    const results = await processBatch(imeis, 5, async (imei) => {
      const r = await crmCall('UpdateBackFactory', {
        BF_BackManID: identity,
        TransStock: '303',
        BF_DeviceCode: imei,
      }, sessionId, identity, 15_000)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = Array.isArray(r.result) && r.result.length > 0 ? (r.result[0] as any) : null
      return { imei, ok: r.ok && !!item, status: item?.Status ?? null, error: r.ok ? (item ? undefined : 'Không tìm thấy thiết bị') : r.error }
    })
    const success = results.filter(r => r.ok).length
    return NextResponse.json({ ok: true, action, results, success, fail: results.length - success })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. GỬI THẺ RFID — TransferWareHouse (WH_ID: 267)
  // ══════════════════════════════════════════════════════════════════════════
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = Array.isArray(r.result) && r.result.length > 0 ? (r.result[0] as any) : null
      const updateResult: string = item?.UpdateResult ?? ''
      const ok = r.ok && updateResult !== 'ThisBarcodeNotExist' && !!item
      return { imei, ok, updateResult: updateResult || null, error: ok ? undefined : (r.error ?? updateResult ?? 'Không thành công') }
    })
    const success = results.filter(r => r.ok).length
    return NextResponse.json({ ok: true, action, results, success, fail: results.length - success })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. BÁO CÁO SIM — GetSimCard
  // ══════════════════════════════════════════════════════════════════════════
  if (action === 'sim-card') {
    if (!imeis.length) return NextResponse.json({ error: 'Cần ít nhất 1 IMEI' }, { status: 400 })
    const results = await processBatch(imeis, 10, async (imei) => {
      const r = await crmCall('GetSimCard', { SimBarcode: imei }, sessionId, identity, 12_000)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = Array.isArray(r.result) && r.result.length > 0 ? (r.result[0] as any) : null
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

  // ══════════════════════════════════════════════════════════════════════════
  // 4. TRA CỨU THIẾT BỊ — GetStockupDetail (kind 0 → 2 → 3) + GetCarList
  // ══════════════════════════════════════════════════════════════════════════
  if (action === 'tra-cuu') {
    if (!imeis.length) return NextResponse.json({ error: 'Cần ít nhất 1 IMEI' }, { status: 400 })
    const results = await processBatch(imeis, 10, async (imei) => {
      // Thử lần lượt kind 0 → 2 → 3
      let item: Record<string, unknown> | null = null
      for (const kind of ['0', '2', '3']) {
        const r = await crmCall('GetStockupDetail', { Barcode: imei, StockupKind: kind }, sessionId, identity, 12_000)
        if (r.ok && Array.isArray(r.result) && r.result.length > 0) {
          item = r.result[0] as Record<string, unknown>
          break
        }
      }

      if (!item) {
        return { imei, ok: false, error: 'Không tìm thấy thiết bị ở cả 3 loại kho' }
      }

      const carUnicode = String(item.CarUnicode ?? '').trim()

      // Lấy SIM + HDD từ GetCarList nếu có CarUnicode
      let simBarcode: string | null = null
      let hddBarcode: string | null = null
      let hddTypeName: string | null = null

      if (carUnicode) {
        const carR = await crmCall('GetCarList', { Unicode: carUnicode, Used: 'null' }, sessionId, identity, 12_000)
        if (carR.ok && Array.isArray(carR.result) && carR.result.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const devices: any[] = (carR.result[0] as any).Devices ?? []
          const simDev = devices.find((d: Record<string, unknown>) => d.QP_ProductKindName === 'Sim Card')
          const hddDev = devices.find((d: Record<string, unknown>) => d.QP_ProductKindName === 'Hard Disk')
          simBarcode  = simDev ? String(simDev.Device_Code ?? '') || null : null
          hddBarcode  = hddDev ? String(hddDev.Device_Code ?? '') || null : null
          hddTypeName = hddDev ? String(hddDev.Device_TypeName ?? '') || null : null
        }
      }

      return {
        imei,
        ok: true,
        productName:    String(item.ProductName    ?? ''),
        productBarcode: String(item.ProductBarcode ?? ''),
        sourceStock:    String(item.SourceStock    ?? ''),
        destStock:      String(item.DestStock      ?? ''),
        status:         String(item.Status         ?? ''),
        updateTime:     String(item.UpdateTime     ?? ''),
        updateMan:      String(item.UpdateMan      ?? ''),
        updateAction:   String(item.UpdateAction   ?? ''),
        carUnicode:     carUnicode || null,
        simBarcode,
        hddBarcode,
        hddTypeName,
      }
    })
    return NextResponse.json({ ok: true, action, results })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. TỒN KHO — GetStockupList (input: warehouse IDs, trả về by product)
  // ══════════════════════════════════════════════════════════════════════════
  if (action === 'ton-kho') {
    if (!warehouseIds.length) return NextResponse.json({ error: 'Cần ít nhất 1 Warehouse ID' }, { status: 400 })
    const stockupKind = body.stockupKind ?? '' // '' = all, '0' = loại 0, '2' = loại 2, '-1' = loại -1

    const results = await processBatch(warehouseIds, 5, async (whId) => {
      const param: Record<string, unknown> = { WH_ID: whId }
      if (stockupKind !== '') param.StockupKind = stockupKind

      const r = await crmCall('GetStockupList', param, sessionId, identity, 20_000)
      if (!r.ok || !Array.isArray(r.result)) {
        return { whId, ok: false, whName: null, products: [], error: r.error }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const products = r.result as any[]
      const whName: string = products[0]?.WH_Name ?? whId

      // Gom nhóm theo ProductNumber
      const totals: Record<string, { wait: number; use: number; notUse: number; productName: string }> = {}
      for (const p of products) {
        const code = String(p.ProductNumber ?? '')
        if (!code) continue
        if (!totals[code]) totals[code] = { wait: 0, use: 0, notUse: 0, productName: String(p.ProductName ?? '') }
        totals[code].wait   += Number(p.WaitCount   ?? 0)
        totals[code].use    += Number(p.CanUseCount  ?? 0)
        totals[code].notUse += Number(p.NotUseCount  ?? 0)
      }

      return {
        whId, ok: true, whName,
        products: Object.entries(totals).map(([code, v]) => ({ code, ...v })),
        total: products.length,
      }
    })

    return NextResponse.json({ ok: true, action, results })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6. GỬI ĐI SỬA CHỮA — GetDeviceRepair → UpdateDeviceRepair
  //    WH_ID: "3" (kho sửa chữa), RepairType: "Repairing"
  // ══════════════════════════════════════════════════════════════════════════
  if (action === 'gui-sc') {
    if (!imeis.length) return NextResponse.json({ error: 'Cần ít nhất 1 IMEI' }, { status: 400 })
    const results = await processBatch(imeis, 5, async (imei) => {
      // Bước 1: Lấy Repair_ID lớn nhất
      const r1 = await crmCall('GetDeviceRepair', { Device_Code: imei }, sessionId, identity, 15_000)
      if (!r1.ok || !Array.isArray(r1.result) || r1.result.length === 0) {
        return { imei, ok: false, repairId: null, deviceId: null, updateResult: null, error: r1.error ?? 'Không tìm thấy ticket sửa chữa' }
      }

      // Lấy ticket có Repair_ID lớn nhất (mới nhất)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ticket = (r1.result as any[]).reduce((max, cur) =>
        Number(cur.Repair_ID) > Number(max.Repair_ID) ? cur : max
      )
      const repairId = ticket.Repair_ID
      const deviceId = ticket.Device_ID

      // Bước 2: UpdateDeviceRepair
      const r2 = await crmCall('UpdateDeviceRepair', {
        Repair_ID:             repairId,
        Description:           null,
        Technician:            identity,
        WH_ID:                 '3',
        RepairType:            'Repairing',
        Device_ID:             deviceId,
        Repair_FinishReasonID: null,
      }, sessionId, identity, 15_000)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = Array.isArray(r2.result) && r2.result.length > 0 ? (r2.result[0] as any) : null
      const updateResult: string = item?.UpdateResult ?? ''
      const ok = r2.ok && !!item

      return {
        imei,
        ok,
        repairId: String(repairId),
        deviceId: String(deviceId),
        updateResult: updateResult || null,
        error: ok ? undefined : (r2.error ?? 'Cập nhật thất bại'),
      }
    })
    const success = results.filter(r => r.ok).length
    return NextResponse.json({ ok: true, action, results, success, fail: results.length - success })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 7. DANH SÁCH KHO — GetWarehouse (phân nhóm theo WH_WHCID)
  // Raw fetch để xem toàn bộ response từ CRM (tránh crmCall chỉ lấy json.result)
  // ══════════════════════════════════════════════════════════════════════════
  if (action === 'ds-kho') {
    const url = crmUrl()
    if (!url) return NextResponse.json({ ok: false, error: 'Thiếu CRM_SOAP_URL' }, { status: 500 })

    const form = new URLSearchParams()
    form.append('MethodName', 'GetWarehouseList')
    form.append('Param', JSON.stringify({}))
    form.append('SESSION_ID', sessionId)
    form.append('IDENTITY', identity)

    let crmJson: Record<string, unknown> = {}
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(process.env.PROXY_SECRET ? { 'x-proxy-secret': process.env.PROXY_SECRET } : {}),
        },
        body: form.toString(),
        signal: AbortSignal.timeout(20_000),
      })
      crmJson = await resp.json() as Record<string, unknown>
    } catch (e) {
      return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
    }

    if (!crmJson.status || crmJson.status === 0) {
      return NextResponse.json({
        ok: false,
        error: String(crmJson.error ?? crmJson.message ?? 'CRM trả status=0'),
        _debug: crmJson,
      }, { status: 500 })
    }

    // CRM có thể trả list ở nhiều field khác nhau — tìm field nào là array
    let warehouses: unknown[] | null = null
    for (const [key, val] of Object.entries(crmJson)) {
      if (Array.isArray(val) && val.length > 0) {
        warehouses = val
        break
      }
    }
    // Fallback nếu result là array rỗng hoặc null
    if (!warehouses && Array.isArray(crmJson.result)) warehouses = crmJson.result

    return NextResponse.json({
      ok: true,
      action,
      warehouses,
      _debug_keys: Object.keys(crmJson), // debug: xem CRM trả fields nào
    })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 8. BÁO CÁO TỒN KHO CUỐI THÁNG — GetStockupList × WH_WHCID × StockupKind
  //    Gọi với WH_WHCID (nhóm kho) thay vì WH_ID đơn lẻ
  //    StockupKind: -1 (thành phẩm), 0 (mã IMEI), 2 (phụ kiện đi kèm)
  // ══════════════════════════════════════════════════════════════════════════
  if (action === 'ton-kho-bao-cao') {
    const { khoList } = body as {
      khoList?: Array<{ whcId: string; label: string }>
    }
    if (!khoList?.length) return NextResponse.json({ error: 'Cần ít nhất 1 kho' }, { status: 400 })

    const STOCKUP_KINDS = ['-1', '0', '2']
    const KIND_LABEL: Record<string, string> = { '-1': 'Thành phẩm', '0': 'IMEI', '2': 'Phụ kiện' }

    // Map: whcId → productNumber → { name, wait, use, notUse }
    const data: Record<string, Record<string, { name: string; wait: number; use: number; notUse: number }>> = {}
    // Collect all product codes seen across all kho
    const allProducts = new Set<string>()

    for (const kho of khoList) {
      data[kho.whcId] = {}

      for (const kind of STOCKUP_KINDS) {
        const r = await crmCall('GetStockupList', {
          WH_WHCID: kho.whcId,
          WH_ID: 'null',
          StockupKind: kind,
        }, sessionId, identity, 30_000)

        if (!r.ok || !Array.isArray(r.result)) continue

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const p of r.result as any[]) {
          const code = String(p.ProductNumber ?? '').trim()
          if (!code) continue
          allProducts.add(code)
          if (!data[kho.whcId][code]) {
            data[kho.whcId][code] = { name: String(p.ProductName ?? ''), wait: 0, use: 0, notUse: 0 }
          }
          data[kho.whcId][code].wait    += Number(p.WaitCount    ?? 0)
          data[kho.whcId][code].use     += Number(p.CanUseCount  ?? 0)
          data[kho.whcId][code].notUse  += Number(p.NotUseCount  ?? 0)
        }
      }
    }

    // Build sorted product list (by first occurrence name)
    const productNames: Record<string, string> = {}
    for (const khoId of Object.keys(data)) {
      for (const [code, v] of Object.entries(data[khoId])) {
        if (!productNames[code] && v.name) productNames[code] = v.name
      }
    }

    return NextResponse.json({
      ok: true,
      action,
      products: Array.from(allProducts).sort(),
      productNames,
      kindLabel: KIND_LABEL,
      khoList,
      data,
    })
  }

  return NextResponse.json({ error: `Action không hợp lệ: ${action}` }, { status: 400 })
}
