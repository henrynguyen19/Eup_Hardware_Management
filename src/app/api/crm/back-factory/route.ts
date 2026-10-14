import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getCRMSessionForUser, invalidateCRMSession } from '@/lib/crm-session'
import { callCrmSoap } from '@/lib/crm-utils'

export const runtime     = 'nodejs'
export const maxDuration = 120   // nhiều IMEI → cần thêm thời gian

// ── CRM: GetBackFactoryByParam ───────────────────────────────────────────────
interface BackFactoryItem {
  BF_ID:                  string
  BF_DeviceCode:          string   // IMEI
  BF_DeviceType:          number
  BF_Memo:                string
  BF_BackManID:           string
  BF_BackManType:         string
  BF_BackTime:            string
  BF_NowCarNumber:        string
  BF_SourceCarNumber:     string
  BF_SourceCustID:        string
  CustomerAssistantName:  string
  ProductName:            string
  TakeDownManName:        string
  WHName:                 string
  ZoneName:               string
}

// ── CRM: GetDeviceRepair ─────────────────────────────────────────────────────
interface RepairRecord {
  Repair_ID:             number
  Device_Code:           string
  ProductName:           string
  Repair_Description:    string
  RepairMan:             string
  RepairFinishMan:       string
  Repair_FinishReasonID: string
  Repair_Status:         number
  Repair_Status_String:  string
  Repair_InDate:         string
  Repair_OutDate:        string
  WareHouseName:         string
}

// ── Concurrency-limited parallel fetch ───────────────────────────────────────
async function pLimit<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<(T | null)[]> {
  const results: (T | null)[] = new Array(tasks.length).fill(null)
  let idx = 0
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++
      try { results[i] = await tasks[i]() } catch { results[i] = null }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}

/**
 * GET /api/crm/back-factory
 *   custCode   — mã khách hàng CRM (bắt buộc)
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
  const startTime = `${startDate} 00:00:00`
  const endTime   = `${endDate} 23:59:59`

  // StartTime cho GetDeviceRepair: lấy toàn bộ lịch sử (từ 2000)
  const repairStartTime = '2000-01-01 00:00:00'
  const repairEndTime   = `${endDate} 23:59:59`

  try {
    const { sessionId, identity } = await getCRMSessionForUser(user.id)

    // ── Bước 1: Lấy danh sách thiết bị về kho theo mã KH ────────────────────
    const crmItems = await callCrmSoap<BackFactoryItem>(
      'GetBackFactoryByParam',
      {
        StartTime:             startTime,
        EndTime:               endTime,
        TakeDownTimeOrBackTime: '0',
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
      return Response.json({ items: [], productNames: [], total: 0, custCode, startDate, endDate })
    }

    // Lấy danh sách IMEI duy nhất
    const uniqueImeis = [...new Set(crmItems.map(i => i.BF_DeviceCode).filter(Boolean))]

    // ── Bước 2: Gọi GetDeviceRepair cho từng IMEI (parallel, concurrency=5) ──
    const repairTasks = uniqueImeis.map(imei => async () => {
      try {
        const records = await callCrmSoap<RepairRecord>(
          'GetDeviceRepair',
          {
            StartTime:   repairStartTime,
            EndTime:     repairEndTime,
            searchType:  '0',
            Device_Code: imei,
          },
          sessionId,
          identity,
          30_000
        )
        return { imei, records }
      } catch {
        return { imei, records: [] as RepairRecord[] }
      }
    })

    const repairResults = await pLimit(repairTasks, 5)

    // Build map: IMEI → mảng records (sắp xếp mới nhất trước)
    const repairMap = new Map<string, RepairRecord[]>()
    for (const r of repairResults) {
      if (!r) continue
      const sorted = [...r.records].sort((a, b) => {
        const ta = a.Repair_InDate ? new Date(a.Repair_InDate).getTime() : 0
        const tb = b.Repair_InDate ? new Date(b.Repair_InDate).getTime() : 0
        return tb - ta
      })
      repairMap.set(r.imei, sorted)
    }

    // ── Bước 3: Merge ────────────────────────────────────────────────────────
    const items = crmItems.map(c => {
      const repairs = repairMap.get(c.BF_DeviceCode) ?? []
      const latest  = repairs[0] ?? null
      return {
        bf_id:        c.BF_ID,
        imei:         c.BF_DeviceCode,
        product_name: c.ProductName || latest?.ProductName || '',
        car_number:   c.BF_SourceCarNumber || c.BF_NowCarNumber || '',
        zone:         c.ZoneName || '',
        wh_name:      c.WHName || '',
        // Latest repair record
        repair_status:       latest?.Repair_Status_String ?? null,
        repair_description:  latest?.Repair_Description ?? null,
        repair_man:          latest?.RepairMan ?? null,
        repair_finish_man:   latest?.RepairFinishMan ?? null,
        repair_in_date:      latest?.Repair_InDate ?? null,
        repair_out_date:     latest?.Repair_OutDate ?? null,
        repair_warehouse:    latest?.WareHouseName ?? null,
        repair_count:        repairs.length,
        // All repair history for this device
        repair_history:      repairs.map(r => ({
          repair_id:          r.Repair_ID,
          status:             r.Repair_Status_String,
          description:        r.Repair_Description,
          repair_man:         r.RepairMan,
          finish_man:         r.RepairFinishMan,
          in_date:            r.Repair_InDate,
          out_date:           r.Repair_OutDate,
          warehouse:          r.WareHouseName,
        })),
        has_repair_record: repairs.length > 0,
      }
    })

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
