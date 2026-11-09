'use client'
import { useState } from 'react'

interface AssignRecord {
  [key: string]: unknown
}

export default function AiCRMTestPage() {
  const [account, setAccount]     = useState('')
  const [password, setPassword]   = useState('')
  const [days, setDays]           = useState(6)
  const [loading, setLoading]     = useState(false)
  const [result, setResult]       = useState<{ total: number; data: AssignRecord[]; startTime: string; endTime: string; _rawShape?: string } | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [expandedIdx, setExpanded] = useState<number | null>(null)

  async function handleFetch() {
    if (!account || !password) { setError('Nhập account và password'); return }
    setLoading(true); setError(null); setResult(null); setExpanded(null)
    try {
      const res = await fetch('/api/aicrm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'service-assign', account, password, days }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) { setError(json.error ?? 'Lỗi không xác định'); return }
      setResult(json)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  // Lấy tất cả keys từ data để làm header bảng
  const allKeys = result?.data.length
    ? Array.from(new Set(result.data.flatMap(r => Object.keys(r))))
    : []

  return (
    <div style={{ padding: '24px', fontFamily: 'monospace', maxWidth: '100%' }}>
      <h2 style={{ marginBottom: 16 }}>🧪 AiCRM service-assign Test</h2>
      <p style={{ color: '#666', marginBottom: 20, fontSize: 13 }}>
        Test trực tiếp <code>aicrm-vn.eupfin.com/AiCRM_CRM_SOAP/service-assign/search</code> không qua tunnel.
      </p>

      {/* Form */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Account CRM</label>
          <input
            value={account} onChange={e => setAccount(e.target.value)}
            placeholder="nvhung"
            style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, width: 140 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Password</label>
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, width: 160 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Số ngày gần nhất</label>
          <input
            type="number" value={days} onChange={e => setDays(Number(e.target.value))}
            min={1} max={90}
            style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, width: 80 }}
          />
        </div>
        <button
          onClick={handleFetch} disabled={loading}
          style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: loading ? 'wait' : 'pointer', fontWeight: 600 }}
        >
          {loading ? '⏳ Đang lấy...' : '🔍 Lấy dữ liệu'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#fee2e2', borderRadius: 6, color: '#b91c1c', marginBottom: 16, fontSize: 13 }}>
          ❌ {error}
        </div>
      )}

      {result && (
        <>
          <div style={{ padding: '10px 14px', background: '#dcfce7', borderRadius: 6, color: '#166534', marginBottom: 16, fontSize: 13 }}>
            ✅ Tìm thấy <strong>{result.total}</strong> records &nbsp;|&nbsp;
            {result.startTime} → {result.endTime}
          </div>

          {result._rawShape && (
            <div style={{ marginBottom: 12, padding: 12, background: '#fef3c7', borderRadius: 6, fontSize: 12 }}>
              <strong>⚠ data = [] — raw shape:</strong>
              <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{result._rawShape}</pre>
            </div>
          )}

          {result.data.length > 0 && (
            <>
              {/* Keys summary */}
              <details style={{ marginBottom: 12, fontSize: 12, background: '#f1f5f9', padding: '8px 12px', borderRadius: 6 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>📋 Tất cả field names ({allKeys.length})</summary>
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {allKeys.map(k => (
                    <code key={k} style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: 3 }}>{k}</code>
                  ))}
                </div>
              </details>

              {/* Table */}
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>#</th>
                      {allKeys.map(k => (
                        <th key={k} style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>{k}</th>
                      ))}
                      <th style={{ padding: '8px 10px' }}>JSON</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.map((row, i) => (
                      <>
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ padding: '6px 10px', color: '#94a3b8' }}>{i + 1}</td>
                          {allKeys.map(k => (
                            <td key={k} style={{ padding: '6px 10px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {String(row[k] ?? '')}
                            </td>
                          ))}
                          <td style={{ padding: '6px 10px' }}>
                            <button
                              onClick={() => setExpanded(expandedIdx === i ? null : i)}
                              style={{ padding: '2px 8px', fontSize: 11, cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: 3, background: '#f8fafc' }}
                            >
                              {expandedIdx === i ? '▲ ẩn' : '▼ xem'}
                            </button>
                          </td>
                        </tr>
                        {expandedIdx === i && (
                          <tr key={`${i}-json`}>
                            <td colSpan={allKeys.length + 2} style={{ padding: '10px 20px', background: '#f8fafc' }}>
                              <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 400, overflow: 'auto' }}>
                                {JSON.stringify(row, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
