'use client'

import { useState, useMemo } from 'react'
import type { StaffConfig } from '@/lib/staff-sheets'

interface ParsedRow {
  code:         string   // col A
  company:      string   // col C
  date:         string   // col D
  contact:      string   // col E
  type:         string   // col F
  salesAlias:   string   // col G
  direction:    string   // col H
  content:      string   // col I
  reply:        string   // col J
  status:       string   // col K
  assignee:     string   // col L
  salesMan:     string   // col M
  assistant:    string   // col N
  raw:          string[] // full row
  error?:       string   // parse warning
}

const KNOWN_ASSIGNEES = ['Kane', 'Stefan', 'Shiro', 'Irene', 'Blue']

function parseRows(text: string): ParsedRow[] {
  return text
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.trim())
    .map(line => {
      const cols = line.split('\t')
      const assignee = cols[11]?.trim() ?? ''
      const known = KNOWN_ASSIGNEES.find(
        n => n.toLowerCase() === assignee.toLowerCase()
      )
      return {
        code:       cols[0]?.trim()  ?? '',
        company:    cols[2]?.trim()  ?? '',
        date:       cols[3]?.trim()  ?? '',
        contact:    cols[4]?.trim()  ?? '',
        type:       cols[5]?.trim()  ?? '',
        salesAlias: cols[6]?.trim()  ?? '',
        direction:  cols[7]?.trim()  ?? '',
        content:    cols[8]?.trim()  ?? '',
        reply:      cols[9]?.trim()  ?? '',
        status:     cols[10]?.trim() ?? '',
        assignee:   known ?? assignee,
        salesMan:   cols[12]?.trim() ?? '',
        assistant:  cols[13]?.trim() ?? '',
        raw:        cols,
        error:      assignee && !known
          ? `Không nhận ra nhân viên: "${assignee}"`
          : undefined,
      }
    })
}

const STATUS_COLOR: Record<string, string> = {
  'Close case':   'bg-green-100 text-green-700',
  'Unprocessing': 'bg-amber-100 text-amber-700',
  'Processing':   'bg-blue-100 text-blue-700',
}
const STAFF_COLOR: Record<string, string> = {
  Kane:   'bg-blue-100 text-blue-700',
  Stefan: 'bg-purple-100 text-purple-700',
  Shiro:  'bg-green-100 text-green-700',
  Irene:  'bg-pink-100 text-pink-700',
  Blue:   'bg-orange-100 text-orange-700',
}

interface Props {
  allStaff: StaffConfig[]
  onClose: () => void
  onSuccess?: (msg: string) => void
}

export default function AddTicketForm({ allStaff, onClose, onSuccess }: Props) {
  const [pasted, setPasted]     = useState('')
  const [submitting, setSubmit] = useState(false)
  const [result, setResult]     = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)

  const rows = useMemo(() => parseRows(pasted), [pasted])
  const validRows   = rows.filter(r => r.company && r.assignee && !r.error)
  const invalidRows = rows.filter(r => r.error || (!r.company && r.raw.length > 1))

  // Group by assignee for preview
  const byAssignee = useMemo(() => {
    const map: Record<string, number> = {}
    for (const r of validRows) map[r.assignee] = (map[r.assignee] ?? 0) + 1
    return map
  }, [validRows])

  async function handleSubmit() {
    if (!validRows.length) return
    setSubmit(true)
    setError(null)
    setResult(null)
    try {
      const res  = await fetch('/api/ho-tro/add-ticket', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rows: validRows }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'Lỗi không xác định')
      setResult(json.message ?? 'Ghi thành công')
      onSuccess?.(json.message ?? `Đã ghi ${validRows.length} dòng`)
      setPasted('')
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setSubmit(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Nhập liệu yêu cầu kỹ thuật</h2>
            <p className="text-xs text-gray-400">
              Copy dữ liệu từ CRM (cột A→N) rồi paste vào ô bên dưới
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl font-bold transition">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Paste area */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Dán dữ liệu từ CRM vào đây:
            </label>
            <textarea
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none bg-gray-50"
              rows={8}
              placeholder={"7112\t\tJ&T Express\t2026-06-17\tanh Tân\tXử lý vấn đề\tAlice\tIn\tnội dung...\t#hardware ...\tClose case\tKane\tVan\tClara"}
              value={pasted}
              onChange={e => { setPasted(e.target.value); setResult(null); setError(null) }}
            />
          </div>

          {/* Parse preview */}
          {rows.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-600">
                  Đọc được <span className="text-teal-700 font-bold">{validRows.length}</span> dòng hợp lệ
                  {invalidRows.length > 0 && (
                    <span className="text-red-600 ml-2">· {invalidRows.length} dòng lỗi</span>
                  )}
                </p>
                {Object.keys(byAssignee).length > 0 && (
                  <div className="flex gap-1.5">
                    {Object.entries(byAssignee).map(([name, count]) => (
                      <span key={name} className={`px-2 py-0.5 rounded-full text-xs font-medium ${STAFF_COLOR[name] ?? 'bg-gray-100 text-gray-600'}`}>
                        {name}: {count}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Row preview table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium whitespace-nowrap">#</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium whitespace-nowrap">Mã</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium whitespace-nowrap">Khách hàng</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium whitespace-nowrap">Ngày</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium whitespace-nowrap">Nội dung</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium whitespace-nowrap">Hashtag</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium whitespace-nowrap">Trạng thái</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium whitespace-nowrap">Người làm</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className={`border-b border-gray-100 last:border-0 ${r.error ? 'bg-red-50' : i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                          <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                          <td className="px-3 py-1.5 text-gray-600">{r.code}</td>
                          <td className="px-3 py-1.5 text-gray-800 max-w-[140px] truncate">{r.company}</td>
                          <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{r.date}</td>
                          <td className="px-3 py-1.5 text-gray-600 max-w-[180px] truncate">{r.content}</td>
                          <td className="px-3 py-1.5 text-blue-600 font-mono max-w-[160px] truncate">{r.reply}</td>
                          <td className="px-3 py-1.5">
                            {r.status && (
                              <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                {r.status}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            {r.error ? (
                              <span className="text-red-600">{r.error}</span>
                            ) : r.assignee ? (
                              <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${STAFF_COLOR[r.assignee] ?? 'bg-gray-100 text-gray-600'}`}>
                                {r.assignee}
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Error / Result */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          {result && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 text-sm text-teal-700">✅ {result}</div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              {validRows.length > 0
                ? `Sẽ ghi vào ${Object.keys(byAssignee).length} sheet: ${Object.keys(byAssignee).join(', ')}`
                : 'Paste dữ liệu để xem preview'}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || validRows.length === 0}
                className="px-6 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-40 transition font-medium flex items-center gap-2"
              >
                {submitting && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {submitting ? 'Đang ghi...' : `Ghi ${validRows.length} dòng lên Google Sheet`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
