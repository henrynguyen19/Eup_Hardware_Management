/**
 * GET /api/crm/cron-sync
 *
 * Được gọi bởi Vercel Cron Job theo lịch trong vercel.json (18:30 VN giờ, T2–T6).
 * Thực hiện Full Sync CRM cho tất cả nhân viên — tương đương bấm "Full Sync" trên dashboard.
 *
 * Bảo vệ bằng header:  Authorization: Bearer <CRON_SECRET>
 * Vercel tự thêm header này nếu bạn set CRON_SECRET trong Environment Variables.
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 phút — đủ để sync 5 staff

export async function GET(req: NextRequest) {
  // ── Xác thực cron secret ──
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization') ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (token !== cronSecret) {
      console.warn('[cron-sync] Unauthorized attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const startedAt = new Date().toISOString()
  console.log(`[cron-sync] Starting full sync at ${startedAt}`)

  try {
    // Gọi nội bộ route /api/crm/sync với mode=full
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      ?? `https://${req.headers.get('host')}`

    const res = await fetch(`${baseUrl}/api/crm/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Truyền cron secret để route sync nhận ra đây là internal call
        'x-cron-secret': cronSecret ?? '',
      },
      body: JSON.stringify({ mode: 'full' }),
    })

    const json = await res.json() as {
      newCount?: number
      updatedCount?: number
      skippedCount?: number
      rejectedCount?: number
      error?: string
    }

    if (!res.ok) {
      console.error('[cron-sync] sync API error:', json)
      return NextResponse.json({
        success: false, error: json.error ?? 'Sync failed', startedAt,
      }, { status: 500 })
    }

    const summary = {
      success:      true,
      startedAt,
      finishedAt:   new Date().toISOString(),
      newCount:     json.newCount      ?? 0,
      updatedCount: json.updatedCount  ?? 0,
      skippedCount: json.skippedCount  ?? 0,
      rejectedCount: json.rejectedCount ?? 0,
    }
    console.log('[cron-sync] Done:', summary)
    return NextResponse.json(summary)

  } catch (err) {
    console.error('[cron-sync] Unexpected error:', err)
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
      startedAt,
    }, { status: 500 })
  }
}
