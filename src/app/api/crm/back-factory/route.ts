import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { getCRMSessionForUser, invalidateCRMSession } from '@/lib/crm-session'
import { callCrmSoap } from '@/lib/crm-utils'

export const runtime     = 'nodejs'
export const maxDuration = 60

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// ── CRM: GetBackFactoryByParam ───────────────────────────────────────────────
interface BackFactoryItem {
  BF_ID:                  string
  BF_DeviceCode:          string   // IMEI
  BF_DeviceType:          number
  BF_Memo:                string
  BF_NowCarNumber:        string
  BF_SourceCarNumber:     string
  BF_SourceCustID:        string
  CustomerAssistantName:  string
  ProductName:            string
  TakeDownManName:        string
  WHName:                 string
  ZoneName:               string
}

// ── Supabase device_repairs row ──────────────────────────────────────────────
interface RepairRow {
  imei:             string
  product_name:     string | null
  status:           string | null
  notes:            string | null
  finish_reason:    string | null
  repair_warehouse: string | null
  received_at:      string | null
  sent_at:          string | null
  completed_at:     string | null
  sender_name:      string | null
  completer_name:   string | null
  crm_repair_id:    string | null
}

const STATUS_LABEL: Record<string, string> = {
  cho_gui:     'Chờ gửi sửa',
  da_gui:      'Đang sửa',
  da_sua_xong: 'Hoàn thành',
  old_device:  'Old Device',
  scrap:       'Báo phế',
  supplier:    'Gửi nhà cung cấp',
}

const STATUS_COLOR: Record<string, string> = {
  cho_gui:     'bg-yellow-100 text-yellow-800',
  da_gui:      'bg-blue-100 text-blue-800',
  da_sua_xong: 'bg-emerald-100 text-emerald-800',
  old_device:  'bg-purple-100 text-purple-800',
  scrap:       'bg-red-100 text-red-800',
  supplier:    'bg-amber-100 text-amber-800',
}

/**
 * GET /api/crm/back-factory
 *   custCode   — mã KH CRM (bắt buộc)
 *   startDate  — YYYY-MM-DD (default: 90 ngày trước)
 *   endDate    — YYYY-MM-DD (default: hôm nay)
 */
export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const sp       = new URL(req.url).searchParams
  const custCode = sp.get('custCode')?.trim()
  if (!custCode) return Response.json({ error: 'Thiếu custCode' }, { status: 400 })

  const now      = new Date()
  const defEnd   = now.toISOString().slice(0, 10)
  const defStart = new Date(now.getTime() - 90 * 86400_000).toISOString().slice(0, 10)
  const startDate = sp.get('startDate') || defStart
  const endDate   = sp.get('endDate')   || defEnd

  try {
    const { sessionId, identity } = await getCRMSessionForUser(user.id)

    // ── Bước 1: Lấy danh sách thiết bị về kho theo mã KH ────────────────────
    const crmItems = await callCrmSoap<BackFactoryItem>(
      'GetBackFactoryByParam',
      {
        StartTime:              `${startDate} 00:00:00`,
        EndTime:                `${endDate} 23:59:59`,
        TakeDownTimeOrBackTime: '0',
        ZoneName:               '',
        CustomerAssistantName:  '',
        BackManID:              '',
        Keyword:                custCode,
        Keyword_type:           'CustCode',
        Status:                 '',
      },
      sessionId,
      identity,
      60_000
    )

    if (!crmItems || crmItems.length === 0) {
      return Response.json({ items: [], productNames: [], total: 0, custCode, startDate, endDate })
    }

    // ── Bước 2: Lấy lịch sử sửa chữa từ Supabase theo IMEI ──────────────────
    const imeis = [...new Set(crmItems.map(i => i.BF_DeviceCode).filter(Boolean))]
    const db    = adminClient()

    // Lấy TẤT CẢ records (nhiều lần SC/IMEI), mới nhất trước
    const { data: repairRows } = await db
      .from('device_repairs')
      .select('imei, product_name, status, notes, finish_reason, repair_warehouse, received_at, sent_at, completed_at, sender_name, completer_name, crm_repair_id')
      .in('imei', imeis)
      .order('received_at', { ascending: false }) as { data: RepairRow[] | null }

    // Build map: IMEI → mảng records (mới nhất trước)
    const repairMap = new Map<string, RepairRow[]>()
    for (const row of (repairRows ?? [])) {
      if (!repairMap.has(row.imei)) repairMap.set(row.imei, [])
      repairMap.get(row.imei)!.push(row)
    }

    // ── Bước 3: Merge ────────────────────────────────────────────────────────
    const items = crmItems.map(c => {
      const history = repairMap.get(c.BF_DeviceCode) ?? []
      const latest  = history[0] ?? null
      return {
        bf_id:        c.BF_ID,
        imei:         c.BF_DeviceCode,
        product_name: c.ProductName || latest?.product_name || '',
        car_number:   c.BF_SourceCarNumber || c.BF_NowCarNumber || '',
        zone:         c.ZoneName || '',
        wh_name:      c.WHName || '',
        // Latest repair
        repair_status:       latest?.status ?? null,
        repair_status_label: latest ? (STATUS_LABEL[latest.status ?? ''] ?? latest.status) : null,
        repair_status_color: latest ? (STATUS_COLOR[latest.status ?? ''] ?? 'bg-gray-100 text-gray-700') : null,
        repair_notes:        latest?.notes ?? null,
        repair_finish:       latest?.finish_reason ?? null,
        repair_warehouse:    latest?.repair_warehouse ?? null,
        received_at:         latest?.received_at ?? null,
        sent_at:             latest?.sent_at ?? null,
        completed_at:        latest?.completed_at ?? null,
        sender_name:         latest?.sender_name ?? null,
        completer_name:      latest?.completer_name ?? null,
        crm_repair_id:       latest?.crm_repair_id ?? null,
        repair_count:        history.length,
        has_repair_record:   history.length > 0,
        // Full history
        repair_history: history.map(r => ({
          status:        r.status,
          status_label:  STATUS_LABEL[r.status ?? ''] ?? r.status,
          status_color:  STATUS_COLOR[r.status ?? ''] ?? 'bg-gray-100 text-gray-700',
          notes:         r.notes,
          finish_reason: r.finish_reason,
          warehouse:     r.repair_warehouse,
          received_at:   r.received_at,
          sent_at:       r.sent_at,
          completed_at:  r.completed_at,
          sender:        r.sender_name,
          completer:     r.completer_name,
          crm_id:        r.crm_repair_id,
        })),
      }
    })

    const productNames = [...new Set(items.map(i => i.product_name).filter(Boolean))].sort()

    return Response.json({ items, productNames, total: items.length, custCode, startDate, endDate })

  } catch (err) {
    const msg = String(err)
    if (msg.toLowerCase().includes('session') || msg.toLowerCase().includes('login')) {
      await invalidateCRMSession(user.id)
    }
    return Response.json({ error: msg }, { status: 500 })
  }
}
