'use client'

import { useState, useMemo } from 'react'
import type { StaffConfig } from '@/lib/staff-sheets'

// CRM has 19 columns (A=0 … S=18)
// A=Code, B=SOS, C=Customer Name, D=Service Date, E=Contact Person,
// F=Service Category, G=Contact Person(alias), H=Visits(In/Out),
// I=Contact Details, J=Remarks(hashtag), K=Assigned Progress(status),
// L=Assignee, M=SalesMan, N=Assistant,
// O=Starting Point, P=Ending Point, Q=License Plate, R=?, S=Attachment
interface ParsedRow {
  code:         string   // A [0]
  sos:          string   // B [1]
  company:      string   // C [2]
  date:         string   // D [3]
  contact:      string   // E [4]
  type:         string   // F [5]
  salesAlias:   string   // G [6]
  direction:    string   // H [7]
  content:      string   // I [8]
  reply:        string   // J [9]
  status:       string   // K [10]
  assignee:     string   // L [11]
  salesMan:     string   // M [12]
  assistant:    string   // N [13]
  startPoint:   string   // O [14]
  endPoint:     string   // P [15]
  licensePlate: string   // Q [16]
  col17:        string   // R [17]
  attachment:   string   // S [18]
  raw:          string[]
  error?:       string
}

const KNOWN_ASSIGNEES = ['Kane', 'Stefan', 'Shiro', 'Irene', 'Blue']

// RFC 4180 TSV parser — handles cells with embedded newlines wrapped in "..."
// (same format Google Sheets uses when copying to clipboard)
function parseTSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const n = text.length

  while (i < n) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < n && text[i + 1] === '"') {
          field += '"'; i += 2   // escaped quote ""
        } else {
          inQuotes = false; i++  // closing quote
        }
      } else {
        field += ch; i++         // content inside quotes (may include \n)
      }
    } else {
      if (ch === '"') {
        inQuotes = true; i++
      } else if (ch === '\t') {
        row.push(field); field = ''; i++
      } else if (ch === '\n') {
        row.push(field); field = ''
        if (row.some(f => f.trim())) rows.push(row)
        row = []; i++
      } else if (ch === '\r') {
        i++  // ignore CR
      } else {
        field += ch; i++
      }
    }
  }
  // flush last row
  row.push(field)
  if (row.some(f => f.trim())) rows.push(row)

  return rows
}

function colVal(cols: string[], idx: number) {
  return cols[idx]?.trim() ?? ''
}

function parseRows(text: string): ParsedRow[] {
  const grid = parseTSV(text)
  return grid
    .filter(cols => cols.length > 3)  // skip noise rows (< 3 cols = not tabular)
    .map(cols => {
      const assigneeRaw = colVal(cols, 11)
      const known = KNOWN_ASSIGNEES.find(
        n => n.toLowerCase() === assigneeRaw.toLowerCase()
      )
      return {
        code:         colVal(cols, 0),
        sos:          colVal(cols, 1),
        company:      colVal(cols, 2),
        date:         colVal(cols, 3),
        contact:      colVal(cols, 4),
        type:         colVal(cols, 5),
        salesAlias:   colVal(cols, 6),
        direction:    colVal(cols, 7),
        content:      colVal(cols, 8),
        reply:        colVal(cols, 9),
        status:       colVal(cols, 10),
        assignee:     known ?? assigneeRaw,
        salesMan:     colVal(cols, 12),
        assistant:    colVal(cols, 13),
        startPoint:   colVal(cols, 14),
        endPoint:     colVal(cols, 15),
        licensePlate: colVal(cols, 16),
        col17:        colVal(cols, 17),
        attachment:   colVal(cols, 18),
        raw:          cols,
        error:        assigneeRaw && !known
          ? `Không nhận ra: "${assigneeRaw}"`
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

// Spreadsheet-like column definitions — only A, D, G, J, L, M, N shown
const PREVIEW_COLS = [
  { label: 'A - Mã',       width: 70,  get: (r: ParsedRow) => r.code         },
  { label: 'D - Ngày',     width: 90,  get: (r: ParsedRow) => r.date         },
  { label: 'G - Người liên hệ', width: 90, get: (r: ParsedRow) => r.salesAlias },
  { label: 'J - Remarks',  width: 220, get: (r: ParsedRow) => r.reply        },
  { label: 'L - Người làm',width: 90,  get: (r: ParsedRow) => r.assignee,    isAssignee: true },
  { label: 'M - SalesMan', width: 80,  get: (r: ParsedRow) => r.salesMan     },
  { label: 'N - Trợ lý',   width: 80,  get: (r: ParsedRow) => r.assistant    },
] as const

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

  const rows        = useMemo(() => parseRows(pasted), [pasted])
  const validRows   = rows.filter(r => r.company && r.assignee && !r.error)
  const invalidRows = rows.filter(r => r.error)

  // Count by assignee
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

  const totalCols = PREVIEW_COLS.length
  const tableWidth = PREVIEW_COLS.reduce((s, c) => s + c.width, 0) + 40 // +40 for row number

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Nhập liệu yêu cầu kỹ thuật</h2>
            <p className="text-xs text-gray-400">
              Copy toàn bộ dòng từ CRM (cột A→S) rồi dán vào đây
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl font-bold leading-none transition">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Paste textarea */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Dán dữ liệu từ CRM:
            </label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-400 resize-y bg-gray-50 placeholder:text-gray-300"
              rows={5}
              placeholder="Chọn các dòng trong CRM → Ctrl+C → Ctrl+V vào đây"
              value={pasted}
              onChange={e => { setPasted(e.target.value); setResult(null); setError(null) }}
            />
          </div>

          {/* Spreadsheet-style preview */}
          {rows.length > 0 && (
            <div>
              {/* Status bar */}
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-gray-500">
                  <span className="font-semibold text-teal-700">{validRows.length}</span> dòng hợp lệ
                  {invalidRows.length > 0 && (
                    <span className="text-red-600 ml-2">· {invalidRows.length} dòng lỗi</span>
                  )}
                  <span className="text-gray-400 ml-2">· hiển thị cột A, D, G, J, L, M, N</span>
                </p>
                {Object.keys(byAssignee).length > 0 && (
                  <div className="flex gap-1.5 flex-wrap justify-end">
                    {Object.entries(byAssignee).map(([name, count]) => (
                      <span key={name} className={`px-2 py-0.5 rounded-full text-xs font-medium ${STAFF_COLOR[name] ?? 'bg-gray-100 text-gray-600'}`}>
                        {name}: {count}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Table */}
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <div className="overflow-x-auto overflow-y-auto max-h-72">
                  <table style={{ minWidth: tableWidth }} className="text-xs border-collapse w-full">
                    {/* Header row — Google Sheets style */}
                    <thead>
                      <tr className="bg-gray-100 border-b border-gray-300">
                        <th
                          style={{ width: 36, minWidth: 36 }}
                          className="border-r border-gray-300 px-1.5 py-1 text-gray-400 font-normal text-center sticky left-0 bg-gray-100 z-10"
                        >
                          #
                        </th>
                        {PREVIEW_COLS.map(col => (
                          <th
                            key={col.label}
                            style={{ width: col.width, minWidth: col.width }}
                            className="border-r border-gray-300 px-2 py-1 text-gray-600 font-medium text-left whitespace-nowrap overflow-hidden text-ellipsis"
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr
                          key={i}
                          className={`border-b border-gray-200 last:border-0 ${
                            r.error
                              ? 'bg-red-50'
                              : i % 2 === 1
                              ? 'bg-gray-50'
                              : 'bg-white'
                          }`}
                        >
                          {/* Row number */}
                          <td
                            style={{ width: 36, minWidth: 36 }}
                            className="border-r border-gray-200 px-1.5 py-1 text-gray-400 text-center sticky left-0 bg-inherit z-10"
                          >
                            {i + 1}
                          </td>

                          {PREVIEW_COLS.map(col => {
                            const val = col.get(r)
                            const isAssignee = 'isAssignee' in col && col.isAssignee

                            if (r.error && isAssignee) {
                              return (
                                <td
                                  key={col.label}
                                  style={{ width: col.width, maxWidth: col.width }}
                                  className="border-r border-gray-200 px-2 py-1"
                                >
                                  <span className="text-red-600 whitespace-nowrap overflow-hidden text-ellipsis block">{r.error}</span>
                                </td>
                              )
                            }

                            return (
                              <td
                                key={col.label}
                                style={{ width: col.width, maxWidth: col.width }}
                                className="border-r border-gray-200 px-2 py-1"
                              >
                                {isAssignee && val ? (
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STAFF_COLOR[val] ?? 'bg-gray-100 text-gray-600'}`}>
                                    {val}
                                  </span>
                                ) : col.label.startsWith('K') && val ? (
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[val] ?? 'bg-gray-100 text-gray-600'}`}>
                                    {val}
                                  </span>
                                ) : (
                                  <span
                                    className="block whitespace-nowrap overflow-hidden text-ellipsis text-gray-700"
                                    title={val}
                                  >
                                    {val}
                                  </span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Error / Success */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">{error}</div>
          )}
          {result && (
            <div className="bg-teal-50 border border-teal-200 rounded-lg px-4 py-2.5 text-sm text-teal-700">✅ {result}</div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              {validRows.length > 0
                ? `Ghi vào ${Object.keys(byAssignee).length} sheet: ${Object.keys(byAssignee).join(', ')}`
                : 'Paste dữ liệu CRM để xem preview'}
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
                {submitting && (
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {submitting ? 'Đang ghi...' : `Ghi ${validRows.length} dòng lên Google Sheet`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
