import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { getCRMSessionForUser, invalidateCRMSession } from '@/lib/crm-session'
import { callCrmSoap } from '@/lib/crm-utils'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// ── CRM response shape ───────────────────────────────────────────────────────
interface BackFactoryItem {
  BF_ID:                  string
  BF_DeviceCode:          string   // IMEI
  BF_DeviceType:          number
  BF_Memo:                string
  BF_BackManID:           string
  BF_BackManType:         string
  BF_BackTime:            string
  BF_NowCarUnicode:       string
  BF_NowCarNumber:        string   // biển số hiện tại
  BF_SourceCarNumber:     string   // biển số lúc tháo
  BF_SourceCarUnicode:    string
  BF_SourceCustID:        string
  CustomerAssistantID:    string
  CustomerAssistantName:  string
  ProductName:            string
  TakeDownManName:        string
  WHName:                 string
  ZoneID:                 string
  ZoneName:               string
}

// ── Repair tracking row ──────────────────────────────────────────────────────
interface RepairRow {
  imei:         string
  product_name: string | null
  status:       string | null
  notes:        string | null
  received_at:  string | null
  completed_at: string | null
}

// Status label map
const STATUS_LABEL: Record<string, string> = {
  cho_gui:     'Chờ gửi sửa',
  da_gui:      'Đã gửi sửa',
  da_sua_xong: 'Đã sửa xong',
  old_device:  'Thiết bị cũ',
  scrap:       'Báo phế',
  supplier:    'Gửi bảo hành',
}

/**
 * GET /api/crm/back-factory
 * Query params:
 *   custCode   — mã khách hàng (Keyword) — bắt buộc
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

  // Date range defaults: last 90 days
  const now       = new Date()
  const defEnd    = now.toISOString().slice(0, 10)
  const defStart  = new Date(now.getTime() - 90 * 86400_000).toISOString().slice(0, 10)
  const startDate = sp.get('startDate') || defStart
  const endDate   = sp.get('endDate')   || defEnd

  // Format CRM datetime strings
  const startTime = `${startDate} 00:00:00`
  const endTime   = `${endDate} 23:59:59`

  try {
    const { sessionId, identity } = await getCRMSessionForUser(user.id)

    const crmItems = await callCrmSoap<BackFactoryItem>(
      'GetBackFactoryByParam',
      {
        StartTime:             startTime,
        EndTime:               endTime,
        TakeDownTimeOrBackTime:'0',
        ZoneName:              '',
        CustomerAssistantName: '',
        BackManID:             '',
        Keyword:               custCode,
        Keyword_type:          'CustCode',
        Status:                '',
      },
      sessionId,
      identity,
      60_000
    )

    if (!crmItems || crmItems.length === 0) {
      return Response.json({ items: [], productNames: [] })
    }

    // ── Lookup repair tracking by IMEI ──────────────────────────────────────
    const imeis = [...new Set(crmItems.map(i => i.BF_DeviceCode).filter(Boolean))]
    const db    = adminClient()

    // Fetch all repair records for these IMEIs, get latest per IMEI
    const { data: repairRows } = await db
      .from('device_repairs')
      .select('imei, product_name, status, notes, received_at, completed_at')
      .in('imei', imeis)
      .order('received_at', { ascending: false }) as { data: RepairRow[] | null }

    // Build map: IMEI → latest repair row
    const repairMap = new Map<string, RepairRow>()
    for (const row of (repairRows ?? [])) {
      if (!repairMap.has(row.imei)) repairMap.set(row.imei, row)
    }

    // ── Merge & build response ───────────────────────────────────────────────
    const items = crmItems.map(c => {
      const repair = repairMap.get(c.BF_DeviceCode) ?? null
      return {
        bf_id:         c.BF_ID,
        imei:          c.BF_DeviceCode,
        product_name:  c.ProductName || repair?.product_name || '',
        car_number:    c.BF_SourceCarNumber || c.BF_NowCarNumber || '',
        zone:          c.ZoneName || '',
        wh_name:       c.WHName || '',
        memo:          c.BF_Memo || '',
        // Repair tracking data
        repair_status:        repair?.status ?? null,
        repair_status_label:  repair ? (STATUS_LABEL[repair.status ?? ''] ?? repair.status) : null,
        repair_notes:         repair?.notes ?? null,
        repair_received_at:   repair?.received_at ?? null,
        repair_completed_at:  repair?.completed_at ?? null,
        has_repair_record:    repair !== null,
      }
    })

    // Collect unique ProductNames for filter pills
    const productNames = [...new Set(items.map(i => i.product_name).filter(Boolean))].sort()

    return Response.json({
      items,
      productNames,
      total: items.length,
      custCode,
      startDate,
      endDate,
    })

  } catch (err) {
    const msg = String(err)
    if (msg.toLowerCase().includes('session') || msg.toLowerCase().includes('login')) {
      await invalidateCRMSession(user.id)
    }
    return Response.json({ error: msg }, { status: 500 })
  }
}
