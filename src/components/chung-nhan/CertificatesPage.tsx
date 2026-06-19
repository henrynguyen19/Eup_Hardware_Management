'use client'

import { useEffect, useState } from 'react'

interface Certificate {
  id: string
  name: string
  category: string
  description: string | null
  issuer: string | null
  issued_date: string | null
  expires_date: string | null
  drive_file_id: string
  sort_order: number
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'ISO':        { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: '#164d81' },
  'TCVN':       { bg: 'bg-green-50',  text: 'text-green-700',  dot: '#00AF50' },
  'Giấy phép':  { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: '#d97706' },
  'Thành viên': { bg: 'bg-purple-50', text: 'text-purple-700', dot: '#7c3aed' },
  'Khác':       { bg: 'bg-gray-50',   text: 'text-gray-600',   dot: '#6b7280' },
}

function categoryStyle(cat: string) {
  return CATEGORY_COLORS[cat] ?? CATEGORY_COLORS['Khác']
}

function formatDate(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function isExpiringSoon(expiresDate: string | null): boolean {
  if (!expiresDate) return false
  const diff = new Date(expiresDate).getTime() - Date.now()
  return diff > 0 && diff < 90 * 24 * 60 * 60 * 1000 // < 90 ngày
}

function isExpired(expiresDate: string | null): boolean {
  if (!expiresDate) return false
  return new Date(expiresDate).getTime() < Date.now()
}

// File được proxy qua API — không cần Drive public
function fileProxyUrl(driveFileId: string) {
  return `/api/certificates/file?id=${driveFileId}`
}

// ── Modal embed ──────────────────────────────────────────────
function CertModal({ cert, onClose }: { cert: Certificate; onClose: () => void }) {
  const embedUrl = fileProxyUrl(cert.drive_file_id)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">
              {cert.category}
            </p>
            <h3 className="text-base font-bold text-gray-900">{cert.name}</h3>
            {cert.issuer && (
              <p className="text-xs text-gray-500 mt-0.5">Cấp bởi: {cert.issuer}</p>
            )}
          </div>
          <div className="flex items-center gap-2 ml-4 flex-shrink-0">
            <a
              href={fileProxyUrl(cert.drive_file_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition flex items-center gap-1"
            >
              🔗 Mở Drive
            </a>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Embed iframe */}
        <div className="flex-1 bg-gray-50" style={{ minHeight: 500 }}>
          <iframe
            src={embedUrl}
            className="w-full h-full"
            style={{ minHeight: 500, border: 'none' }}
            allow="autoplay"
            title={cert.name}
          />
        </div>

        {/* Footer info */}
        <div className="flex items-center gap-6 px-5 py-3 border-t border-gray-100 text-xs text-gray-500">
          <span>📅 Ngày cấp: <strong className="text-gray-700">{formatDate(cert.issued_date)}</strong></span>
          <span>⏳ Hết hạn: <strong className={`${isExpired(cert.expires_date) ? 'text-red-600' : isExpiringSoon(cert.expires_date) ? 'text-amber-600' : 'text-gray-700'}`}>
            {cert.expires_date ? formatDate(cert.expires_date) : 'Không hết hạn'}
          </strong></span>
        </div>
      </div>
    </div>
  )
}

// ── Certificate Card ─────────────────────────────────────────
function CertCard({ cert, onClick }: { cert: Certificate; onClick: () => void }) {
  const style = categoryStyle(cert.category)
  const expired = isExpired(cert.expires_date)
  const expiring = isExpiringSoon(cert.expires_date)

  return (
    <button
      onClick={onClick}
      className="text-left bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all duration-150 overflow-hidden group flex flex-col"
    >
      {/* Top color bar */}
      <div className="h-1.5 w-full" style={{ background: style.dot }} />

      {/* Thumbnail area */}
      <div className="w-full bg-gray-50 flex items-center justify-center" style={{ height: 160 }}>
        <iframe
          src={fileProxyUrl(cert.drive_file_id)}
          className="w-full h-full pointer-events-none"
          style={{ border: 'none' }}
          title={cert.name}
          loading="lazy"
        />
        {/* Overlay to capture clicks on the card (iframe swallows events) */}
        <div className="absolute inset-0" />
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-center gap-2 mb-2">
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${style.bg} ${style.text}`}>
            {cert.category}
          </span>
          {expired && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-600">
              Hết hạn
            </span>
          )}
          {!expired && expiring && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-600">
              Sắp hết hạn
            </span>
          )}
        </div>

        <h4 className="text-sm font-semibold text-gray-900 leading-snug group-hover:text-[#A70A0A] transition-colors line-clamp-2">
          {cert.name}
        </h4>

        {cert.description && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{cert.description}</p>
        )}

        <div className="mt-auto pt-3 flex items-center justify-between text-xs text-gray-400">
          {cert.issuer && <span className="truncate mr-2">{cert.issuer}</span>}
          <span className="flex-shrink-0">
            {cert.expires_date
              ? `HH: ${formatDate(cert.expires_date)}`
              : cert.issued_date
              ? formatDate(cert.issued_date)
              : ''}
          </span>
        </div>
      </div>
    </button>
  )
}

// ── Main page ────────────────────────────────────────────────
export default function CertificatesPage() {
  const [certs, setCerts] = useState<Certificate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Certificate | null>(null)
  const [filterCat, setFilterCat] = useState<string>('Tất cả')

  useEffect(() => {
    fetch('/api/certificates')
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setCerts(d.certificates ?? [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const categories = ['Tất cả', ...Array.from(new Set(certs.map(c => c.category)))]
  const visible = filterCat === 'Tất cả' ? certs : certs.filter(c => c.category === filterCat)

  const expiredCount  = certs.filter(c => isExpired(c.expires_date)).length
  const expiringCount = certs.filter(c => isExpiringSoon(c.expires_date)).length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
          <span>EUP</span><span>/</span>
          <span className="text-gray-600 font-medium">Giấy chứng nhận</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">📜 Giấy chứng nhận</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Chứng nhận & giấy phép của công ty EUP
            </p>
          </div>
          {/* Summary badges */}
          {!loading && certs.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                {certs.length} chứng nhận
              </span>
              {expiringCount > 0 && (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                  ⚠️ {expiringCount} sắp hết hạn
                </span>
              )}
              {expiredCount > 0 && (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700">
                  ❌ {expiredCount} hết hạn
                </span>
              )}
            </div>
          )}
        </div>

        {/* Category filter tabs */}
        {!loading && categories.length > 1 && (
          <div className="flex items-center gap-1 mt-4 overflow-x-auto pb-0.5">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCat(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  filterCat === cat
                    ? 'text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={filterCat === cat ? { background: '#A70A0A' } : {}}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-6 py-6">
        {loading && (
          <div className="flex items-center justify-center h-48 text-gray-400">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-red-600 rounded-full animate-spin" />
              <span className="text-sm">Đang tải...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            ❌ {error}
          </div>
        )}

        {!loading && !error && certs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <div className="text-5xl mb-4">📜</div>
            <p className="text-base font-medium text-gray-500">Chưa có chứng nhận nào</p>
            <p className="text-sm mt-1">Chạy SQL migration và thêm dữ liệu vào bảng <code className="bg-gray-100 px-1 rounded">certificates</code></p>
          </div>
        )}

        {!loading && !error && visible.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visible.map(cert => (
              <div key={cert.id} className="relative">
                <CertCard cert={cert} onClick={() => setSelected(cert)} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {selected && (
        <CertModal cert={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
