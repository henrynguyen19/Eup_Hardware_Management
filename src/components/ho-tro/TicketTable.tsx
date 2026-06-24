'use client'

import { useState, useEffect, useCallback } from 'react'

interface Ticket {
  id: string
  staff_name: string
  ticket_date: string
  code: string | null
  company: string | null
  content: string | null
  reply: string | null
  status: string | null
  assistant: string | null
  location: string | null
  direction: string | null
  ticket_type: string | null
  created_at: string
}

interface Props {
  staffName: string
  month: number
  year: string   // "26" or "2026"
  isAdmin?: boolean
}

const LOC_LABEL: Record<string, string> = {
  'Ha Noi': 'Hà Nội', 'HCM': 'HCM', 'Hai Phong': 'Hải Phòng',
  'Binh Duong': 'Bình Dương', 'Da Nang': 'Đà Nẵng',
}

const STATUS_COLOR: Record<string, string> = {
  '#f': 'bg-green-100 text-green-700',
  '#n': 'bg-red-100 text-red-700',
  '#h': 'bg-yellow-100 text-yellow-700',
}

export default function TicketTable({ staffName, month, year, isAdmin }: Props) {
  const [tickets, setTickets]   = useState<Ticket[]>([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(false)
  const [search, setSearch]     = useState('')
  const [page, setPage]         = useState(1)
  const [editing, setEditing]   = useState<{ id: string; field: string; value: string } | null>(null)
  const [saving, setSaving]     = useState<string | null>(null)

  const fullYear = year.length === 2 ? `20${year}` : year
  const limit = 100

  const fetchTickets = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({
      staffName,
      month: String(month),
      year: fullYear,
      search,
      page: String(page),
      limit: String(limit),
    })
    const res = await fetch(`/api/ho-tro/tickets?${params}`)
    const data = await res.json()
    setTickets(data.tickets ?? [])
    setTotal(data.total ?? 0)
    setLoading(false)
  }, [staffName, month, fullYear, search, page])

  useEffect(() => { fetchTickets() }, [fetchTickets])

  // Debounce search
  useEffect(() => {
    setPage(1)
  }, [search])

  async function saveEdit() {
    if (!editing) return
    setSaving(editing.id)
    await fetch('/api/ho-tro/tickets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editing.id, [editing.field]: editing.value }),
    })
    setSaving(null)
    setEditing(null)
    fetchTickets()
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Tìm mã KH, công ty, nội dung..."
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-400">{total} yêu cầu</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1 ml-auto">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-gray-50">←</button>
            <span className="text-xs text-gray-500">{page}/{totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-gray-50">→</button>
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-blue-600">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Đang tải...</span>
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">
          <p className="text-3xl mb-2">📋</p>
          <p className="text-sm">Chưa có yêu cầu nào được lưu trong tháng này</p>
          <p className="text-xs text-gray-300 mt-1">Dữ liệu từ form nhập liệu sẽ xuất hiện ở đây</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 font-medium">
                  <th className="text-left px-3 py-3 w-24">Ngày</th>
                  <th className="text-left px-3 py-3 w-28">Mã KH</th>
                  <th className="text-left px-3 py-3 w-32">Công ty</th>
                  <th className="text-left px-3 py-3">Yêu cầu (colI)</th>
                  <th className="text-left px-3 py-3">Trả lời (colJ)</th>
                  <th className="text-left px-3 py-3 w-24">Trợ lý</th>
                  <th className="text-left px-3 py-3 w-24">Khu vực</th>
                  <th className="text-left px-3 py-3 w-20">Trạng thái</th>
                  {isAdmin && <th className="text-left px-3 py-3 w-20">NV xử lý</th>}
                </tr>
              </thead>
              <tbody>
                {tickets.map((t, i) => {
                  const isEditing = (field: string) =>
                    editing?.id === t.id && editing?.field === field
                  const statusKey = (t.status ?? '').toLowerCase().trim()
                  const statusColor = STATUS_COLOR[statusKey] ?? 'bg-gray-100 text-gray-600'

                  return (
                    <tr key={t.id}
                      className={`border-b border-gray-50 last:border-0 hover:bg-blue-50/30 transition-colors ${
                        i % 2 === 1 ? 'bg-gray-50/20' : ''
                      }`}>

                      {/* Ngày — editable */}
                      <td className="px-3 py-2.5">
                        {isEditing('ticket_date') ? (
                          <div className="flex items-center gap-1">
                            <input type="date"
                              value={editing!.value}
                              onChange={e => setEditing(prev => prev ? { ...prev, value: e.target.value } : null)}
                              className="border border-blue-400 rounded px-1 py-0.5 text-xs w-28 focus:outline-none" />
                            <button onClick={saveEdit} disabled={saving === t.id}
                              className="text-green-600 hover:text-green-800 text-xs font-bold">✓</button>
                            <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditing({ id: t.id, field: 'ticket_date', value: t.ticket_date })}
                            className="text-xs text-gray-700 hover:text-blue-600 hover:underline text-left group flex items-center gap-1">
                            {t.ticket_date}
                            <span className="opacity-0 group-hover:opacity-100 text-gray-300">✎</span>
                          </button>
                        )}
                      </td>

                      {/* Mã KH */}
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-xs text-gray-600">{t.code ?? '—'}</span>
                      </td>

                      {/* Công ty */}
                      <td className="px-3 py-2.5">
                        <span className="text-xs text-gray-700 line-clamp-2">{t.company ?? '—'}</span>
                      </td>

                      {/* Nội dung yêu cầu (colI) — editable */}
                      <td className="px-3 py-2.5 max-w-xs">
                        {isEditing('content') ? (
                          <div className="flex flex-col gap-1">
                            <textarea
                              value={editing!.value}
                              onChange={e => setEditing(prev => prev ? { ...prev, value: e.target.value } : null)}
                              rows={3}
                              className="border border-blue-400 rounded px-2 py-1 text-xs w-full focus:outline-none resize-none" />
                            <div className="flex gap-1">
                              <button onClick={saveEdit} disabled={saving === t.id}
                                className="text-xs px-2 py-0.5 bg-green-600 text-white rounded hover:bg-green-700">Lưu</button>
                              <button onClick={() => setEditing(null)}
                                className="text-xs px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-50">Hủy</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditing({ id: t.id, field: 'content', value: t.content ?? '' })}
                            className="text-xs text-gray-700 hover:text-blue-600 text-left line-clamp-3 w-full group">
                            {t.content
                              ? <span>{t.content}<span className="opacity-0 group-hover:opacity-100 text-gray-300 ml-1">✎</span></span>
                              : <span className="text-gray-300 italic">Trống — click để thêm</span>
                            }
                          </button>
                        )}
                      </td>

                      {/* Trả lời (colJ) — editable */}
                      <td className="px-3 py-2.5 max-w-xs">
                        {isEditing('reply') ? (
                          <div className="flex flex-col gap-1">
                            <textarea
                              value={editing!.value}
                              onChange={e => setEditing(prev => prev ? { ...prev, value: e.target.value } : null)}
                              rows={3}
                              className="border border-blue-400 rounded px-2 py-1 text-xs w-full focus:outline-none resize-none" />
                            <div className="flex gap-1">
                              <button onClick={saveEdit} disabled={saving === t.id}
                                className="text-xs px-2 py-0.5 bg-green-600 text-white rounded hover:bg-green-700">Lưu</button>
                              <button onClick={() => setEditing(null)}
                                className="text-xs px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-50">Hủy</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditing({ id: t.id, field: 'reply', value: t.reply ?? '' })}
                            className="text-xs text-gray-700 hover:text-blue-600 text-left line-clamp-3 w-full group">
                            {t.reply
                              ? <span>{t.reply}<span className="opacity-0 group-hover:opacity-100 text-gray-300 ml-1">✎</span></span>
                              : <span className="text-gray-300 italic">Trống — click để thêm</span>
                            }
                          </button>
                        )}
                      </td>

                      {/* Trợ lý */}
                      <td className="px-3 py-2.5">
                        <span className="text-xs text-gray-600">{t.assistant ?? '—'}</span>
                      </td>

                      {/* Khu vực */}
                      <td className="px-3 py-2.5">
                        {t.location ? (
                          <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                            {LOC_LABEL[t.location] ?? t.location}
                          </span>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>

                      {/* Trạng thái */}
                      <td className="px-3 py-2.5">
                        {t.status ? (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${statusColor}`}>
                            {t.status}
                          </span>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>

                      {/* NV xử lý (admin only) */}
                      {isAdmin && (
                        <td className="px-3 py-2.5">
                          <span className="text-xs text-gray-600">{t.staff_name}</span>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
