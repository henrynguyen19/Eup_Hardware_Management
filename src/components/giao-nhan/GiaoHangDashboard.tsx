"use client"

import { useEffect, useState, useCallback } from 'react'

interface Order {
  id: string
  sheet_row: number
  stt: string
  order_time: string
  office: string
  orderer: string
  device_type: string
  quantity: string
  expected_date: string
  recipient_info: string
  synced_at: string
  updated_at: string
}

const FIELDS: { key: keyof Order; label: string; width?: string }[] = [
  { key: 'stt',           label: 'STT',           width: '60px' },
  { key: 'order_time',    label: 'Thời gian đặt', width: '130px' },
  { key: 'office',        label: 'Office',         width: '100px' },
  { key: 'orderer',       label: 'Người đặt',      width: '120px' },
  { key: 'device_type',   label: 'Loại TB',        width: '180px' },
  { key: 'quantity',      label: 'Số lượng',       width: '90px' },
  { key: 'expected_date', label: 'TG dự kiến',     width: '120px' },
  { key: 'recipient_info',label: 'Thông tin người nhận', width: '200px' },
]

const EDITABLE_FIELDS = FIELDS.filter(f => f.key !== 'stt')

function EditModal({ order, onClose, onSave }: {
  order: Order
  onClose: () => void
  onSave: (updated: Order) => void
}) {
  const [form, setForm] = useState({ ...order })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSave() {
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/giao-hang/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!d.ok) { setErr(d.error ?? 'Lỗi không xác định'); return }
      onSave(form)
    } catch (e) {
      setErr(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Chỉnh sửa đơn hàng — Hàng {order.sheet_row}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>
        <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {EDITABLE_FIELDS.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-gray-500 mb-1">{f.label}</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={(form[f.key] as string) ?? ''}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
              />
            </div>
          ))}
          {err && <p className="text-red-600 text-sm">❌ {err}</p>}
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
            Hủy
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-60"
            style={{ background: saving ? '#9ca3af' : '#1d6fba' }}
          >
            {saving ? 'Đang lưu...' : '💾 Lưu & ghi vào Sheet'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function GiaoHangDashboard() {
  const [orders, setOrders]         = useState<Order[]>([])
  const [total, setTotal]           = useState(0)
  const [loading, setLoading]       = useState(true)
  const [syncing, setSyncing]       = useState(false)
  const [syncMsg, setSyncMsg]       = useState('')
  const [error, setError]           = useState('')
  const [search, setSearch]         = useState('')
  const [officeFilter, setOfficeFilter] = useState('')
  const [page, setPage]             = useState(1)
  const [editOrder, setEditOrder]   = useState<Order | null>(null)

  const LIMIT = 50

  const fetchOrders = useCallback(async (p = page) => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: String(LIMIT),
        ...(search      ? { search }            : {}),
        ...(officeFilter ? { office: officeFilter } : {}),
      })
      const res = await fetch(`/api/giao-hang/orders?${params}`)
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      setOrders(d.orders)
      setTotal(d.total)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [page, search, officeFilter])

  useEffect(() => { fetchOrders(page) }, [page, search, officeFilter]) // eslint-disable-line

  async function handleSync() {
    setSyncing(true); setSyncMsg('')
    try {
      const res = await fetch('/api/giao-hang/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const d = await res.json()
      if (d.error) { setSyncMsg('❌ ' + d.error); return }
      setSyncMsg(`✅ Đã tải ${d.inserted}/${d.total} đơn hàng`)
      setPage(1)
      fetchOrders(1)
    } catch (e) {
      setSyncMsg('❌ ' + String(e))
    } finally {
      setSyncing(false)
    }
  }

  function handleSaved(updated: Order) {
    setOrders(prev => prev.map(o => o.id === updated.id ? updated : o))
    setEditOrder(null)
  }

  // Unique offices for filter dropdown
  const offices = Array.from(new Set(orders.map(o => o.office).filter(Boolean)))

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">🚚 Giám sát gửi hàng</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Đơn hàng từ Google Sheet · Order hàng VP - Kho
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {syncMsg && (
              <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1.5 rounded-lg">{syncMsg}</span>
            )}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
              style={{ background: syncing ? '#9ca3af' : '#16a34a' }}
            >
              {syncing ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />Đang tải...</>
              ) : '🔄 Đồng bộ từ Sheet'}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <input
            type="text"
            placeholder="Tìm kiếm người đặt, loại TB, người nhận..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="flex-1 min-w-48 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={officeFilter}
            onChange={e => { setOfficeFilter(e.target.value); setPage(1) }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Tất cả Office</option>
            {offices.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <span className="text-xs text-gray-400 whitespace-nowrap">
            {total} đơn hàng
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="px-4 py-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 mb-4">
            ❌ {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 gap-2">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
            <span className="text-sm">Đang tải...</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <span className="text-4xl mb-3">📦</span>
            <p className="text-sm">Chưa có đơn hàng. Nhấn "Đồng bộ từ Sheet" để tải dữ liệu.</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {FIELDS.map(f => (
                        <th
                          key={f.key}
                          className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                          style={{ minWidth: f.width }}
                        >
                          {f.label}
                        </th>
                      ))}
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Thao tác
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orders.map(order => (
                      <tr key={order.id} className="hover:bg-gray-50 transition-colors group">
                        {FIELDS.map(f => (
                          <td
                            key={f.key}
                            className="px-3 py-2 text-gray-700 align-top"
                            style={{ minWidth: f.width, maxWidth: '250px' }}
                          >
                            <span className="line-clamp-2 break-words">{(order[f.key] as string) || '—'}</span>
                          </td>
                        ))}
                        <td className="px-3 py-2 align-top">
                          <button
                            onClick={() => setEditOrder(order)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1 text-xs font-medium rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"
                          >
                            ✏️ Sửa
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  ← Trước
                </button>
                <span className="text-sm text-gray-500">
                  Trang {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  Tiếp →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit modal */}
      {editOrder && (
        <EditModal
          order={editOrder}
          onClose={() => setEditOrder(null)}
          onSave={handleSaved}
        />
      )}
    </div>
  )
}
