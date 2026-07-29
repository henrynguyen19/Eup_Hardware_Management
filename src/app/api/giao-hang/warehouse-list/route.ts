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

export interface WarehouseItem {
  whId:     number
  whName:   string
  whcId:    number
  whcName:  string
  whSort:   number   // 1=kho chính, 2=kỹ thuật viên, 3=sales/customer
}

/**
 * GET /api/giao-hang/warehouse-list?whc_id=3
 * Gọi GetWareHouse để lấy danh sách kho con theo trung tâm kỹ thuật
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const whcId = req.nextUrl.searchParams.get('whc_id')
    if (!whcId) return NextResponse.json({ error: 'Cần whc_id' }, { status: 400 })

    const { sessionId, identity } = await getCRMSessionForUser(user.id)

    const res = await crmCall(
      'GetWareHouse',
      { WHC_ID: whcId, WHM_ManagerType: null, WHM_Manager: null },
      sessionId, identity,
    )

    if (!res.ok || !Array.isArray(res.result)) {
      return NextResponse.json({ error: res.error ?? 'Không lấy được danh sách kho' }, { status: 500 })
    }

    const warehouses: WarehouseItem[] = (res.result as Record<string, unknown>[]).map(w => ({
      whId:    Number(w.WH_ID      ?? 0),
      whName:  String(w.WH_Name    ?? ''),
      whcId:   Number(w.WH_WHCID   ?? whcId),
      whcName: String(w.WHC_Name   ?? ''),
      whSort:  Number(w.WH_Sort    ?? 0),
    }))

    return NextResponse.json({ ok: true, warehouses })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
