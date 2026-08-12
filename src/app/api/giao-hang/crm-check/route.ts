import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getCRMSessionForUser } from '@/lib/crm-session'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Device type matching ──────────────────────────────────────────────
// matchResult: 'match' | 'mismatch' | 'fuzzy' | null (null = không có orderName)
export type MatchResult = 'match' | 'mismatch' | 'fuzzy' | null

async function resolveMatch(orderName: string, crmProductName: string): Promise<MatchResult> {
  if (!orderName || !crmProductName) return null

  const orderLower = orderName.toLowerCase().trim()
  const crmLower   = crmProductName.toLowerCase().trim()

  // 1. Tra bảng device_type_mapping (active)
  const { data: mappings } = await sb()
    .from('device_type_mapping')
    .select('crm_name, crm_device_type_id')
    .eq('is_active', true)
    .ilike('order_name', orderName.trim())

  if (mappings && mappings.length > 0) {
    const hit = mappings.some(m =>
      (m.crm_name as string).toLowerCase() === crmLower
    )
    return hit ? 'match' : 'mismatch'
  }

  // 2. Exact / contains fallback
  if (crmLower === orderLower) return 'match'
  if (crmLower.includes(orderLower) || orderLower.includes(crmLower)) return 'fuzzy'

  // 3. Token overlap: tokenize, bỏ stop-words ngắn, đếm chung
  const tokenize = (s: string) =>
    s.split(/[\s\-_\/\(\)]+/).map(t => t.trim()).filter(t => t.length > 2)
  const oTokens = tokenize(orderLower)
  const cTokens = tokenize(crmLower)
  if (oTokens.length === 0 || cTokens.length === 0) return null
  const overlap = oTokens.filter(t => cTokens.includes(t)).length
  const minLen  = Math.min(oTokens.length, cTokens.length)
  if (overlap >= Math.max(1, Math.ceil(minLen * 0.5))) return 'fuzzy'

  return 'mismatch'
}

const CRM_SOAP_URL = process.env.CRM_SOAP_URL ?? ''

/**
 * Kho công ty (nguồn gửi) — nếu SourceStock khớp = thiết bị chưa được nhận
 * Danh sách đầy đủ từ cột D sheet "Chi tiết xuất kho" (đã đọc toàn bộ dữ liệu):
 *   WareHouse-Admin, Hardware-Machine, Old Device, Return Customer
 * Override qua env var COMPANY_WAREHOUSE_NAMES (comma-separated) nếu cần
 */
function isCompanyWarehouse(sourceStock: string): boolean {
  const src = sourceStock.toLowerCase().trim()
  const env = process.env.COMPANY_WAREHOUSE_NAMES
  const list = env
    ? env.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : ['warehouse-admin', 'hardware-machine', 'old device', 'return customer']
  return list.some(w => src === w)
}

function getCompanyWarehouses(): string[] {
  const env = process.env.COMPANY_WAREHOUSE_NAMES
  if (env) return env.split(',').map(s => s.trim()).filter(Boolean)
  // Tất cả giá trị cột D trong sheet "Chi tiết xuất kho" (đọc toàn bộ 365 hàng)
  return ['WareHouse-Admin', 'Hardware-Machine', 'Old Device', 'Return Customer']
}

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

interface StockInfo {
  carUnicode:    string   // dùng để gọi GetCarList
  productName:   string
  productBarcode: string
  sourceStock:   string   // kho hiện tại
  destStock:     string
  status:        string   // HAVE / ...
  updateTime:    string
  updateMan:     string
  updateAction:  string
  isAtCompany:   boolean  // true = vẫn ở kho công ty, false = đã chuyển đi (đã nhận)
}

interface CRMComponent {
  Device_ID:          number
  Device_Type:        number
  Device_TypeName:    string
  Device_Code:        string
  QP_ProductKind:     number
  QP_ProductKindName: string
}

// ─── GET /api/giao-hang/crm-check?barcode=003200BE04 ─────────────────────────
// barcode = mã quét từ thiết bị (IMEI hoặc device code)
// unicode = mã unicode (nếu đã biết, bỏ qua bước GetStockupDetail)
export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const sp        = req.nextUrl.searchParams
    const barcode   = sp.get('barcode')?.trim()
    const unicode   = sp.get('unicode')?.trim()
    const orderName = sp.get('orderName')?.trim() ?? ''  // tên thiết bị trong đơn (để match)

    if (!barcode && !unicode) {
      return NextResponse.json({ error: 'Cần barcode hoặc unicode' }, { status: 400 })
    }

    const { sessionId, identity } = await getCRMSessionForUser(user.id)
    const companyWarehouses = getCompanyWarehouses()

    // ── Bước 1: GetStockupDetail (nếu có barcode) ────────────────────────────
    let stockInfo: StockInfo | null = null
    let resolvedUnicode = unicode ?? ''

    if (barcode) {
      const stockRes = await crmCall(
        'GetStockupDetail',
        { Barcode: barcode, StockupKind: '0' },
        sessionId, identity,
      )
      if (stockRes.ok && Array.isArray(stockRes.result) && stockRes.result.length > 0) {
        const s = stockRes.result[0] as Record<string, unknown>
        const src = String(s.SourceStock ?? '')
        resolvedUnicode = resolvedUnicode || String(s.CarUnicode ?? '')
        stockInfo = {
          carUnicode:     resolvedUnicode,
          productName:    String(s.ProductName    ?? ''),
          productBarcode: String(s.ProductBarcode ?? barcode),
          sourceStock:    src,
          destStock:      String(s.DestStock      ?? ''),
          status:         String(s.Status         ?? ''),
          updateTime:     String(s.UpdateTime     ?? ''),
          updateMan:      String(s.UpdateMan      ?? ''),
          updateAction:   String(s.UpdateAction   ?? ''),
          // isAtCompany = true nếu SourceStock khớp với kho công ty (chưa nhận)
          isAtCompany:    isCompanyWarehouse(src),
        }
      } else {
        return NextResponse.json({
          ok: false,
          error: `Không tìm thấy thiết bị với barcode: ${barcode}`,
          crm_error: (stockRes as { error?: string }).error,
        }, { status: 404 })
      }
    }

    // ── Bước 2: GetCarList (nếu có unicode) ──────────────────────────────────
    let components: CRMComponent[] = []
    let grouped: Record<string, CRMComponent[]> = {}

    if (resolvedUnicode) {
      const carRes = await crmCall(
        'GetCarList',
        { Unicode: resolvedUnicode, Used: null },
        sessionId, identity,
      )
      if (carRes.ok && Array.isArray(carRes.result) && carRes.result.length > 0) {
        const car = carRes.result[0] as Record<string, unknown>
        if (Array.isArray(car.Devices)) {
          components = (car.Devices as Record<string, unknown>[]).map(d => ({
            Device_ID:          Number(d.Device_ID          ?? 0),
            Device_Type:        Number(d.Device_Type        ?? 0),
            Device_TypeName:    String(d.Device_TypeName    ?? ''),
            Device_Code:        String(d.Device_Code        ?? ''),
            QP_ProductKind:     Number(d.QP_ProductKind     ?? 0),
            QP_ProductKindName: String(d.QP_ProductKindName ?? ''),
          }))
          grouped = components.reduce<Record<string, CRMComponent[]>>((acc, c) => {
            const key = c.QP_ProductKindName || 'Other'
            if (!acc[key]) acc[key] = []
            acc[key].push(c)
            return acc
          }, {})
        }
      }
    }

    // Match device name trong đơn với productName từ CRM
    const matchResult = stockInfo && orderName
      ? await resolveMatch(orderName, stockInfo.productName)
      : null

    return NextResponse.json({
      ok:          true,
      barcode:     barcode ?? null,
      unicode:     resolvedUnicode || null,
      stock:       stockInfo,
      components,
      grouped,
      // Gợi ý trạng thái tự động
      suggested_status: stockInfo
        ? (stockInfo.isAtCompany ? null : 'da_nhan')  // null = không tự động cập nhật
        : null,
      company_warehouses: companyWarehouses,
      // Kết quả match loại thiết bị đơn vs CRM
      matchResult,   // 'match' | 'mismatch' | 'fuzzy' | null
      orderName:     orderName || null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
