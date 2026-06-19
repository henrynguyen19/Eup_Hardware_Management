'use client'

import { useEffect, useState } from 'react'

interface DriveItem {
  id: string
  name: string
  mimeType: string
  isFolder: boolean
  size: number | null
  modifiedTime: string | null
}

interface BrowseResult {
  folderId: string
  folderName: string
  items: DriveItem[]
}

interface BreadcrumbEntry {
  id: string
  name: string
}

const ROOT_FOLDER_ID = '1wmuGM092uFqujUj_UUVDW0MZxRe15TZd'

// Detect file type from mimeType
function fileIcon(mimeType: string): string {
  if (mimeType.includes('pdf'))                     return '📄'
  if (mimeType.includes('image'))                   return '🖼️'
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝'
  if (mimeType.includes('sheet') || mimeType.includes('excel'))   return '📊'
  if (mimeType.includes('presentation'))             return '📊'
  return '📎'
}

function isPdf(mimeType: string)   { return mimeType.includes('pdf') }
function isImage(mimeType: string) { return mimeType.startsWith('image/') }
function canPreview(mimeType: string) { return isPdf(mimeType) || isImage(mimeType) }

function formatDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── File Preview Modal ────────────────────────────────────────
function FilePreviewModal({ file, onClose }: { file: DriveItem; onClose: () => void }) {
  const src = `/api/certificates/file?id=${file.id}`
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden" style={{ maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl flex-shrink-0">{fileIcon(file.mimeType)}</span>
            <h3 className="text-sm font-semibold text-gray-900 truncate">{file.name}</h3>
          </div>
          <div className="flex items-center gap-2 ml-3 flex-shrink-0">
            <a href={src} target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
            >⬇ Tải về</a>
            <button onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition text-lg"
            >✕</button>
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 bg-gray-50" style={{ minHeight: 500 }}>
          {canPreview(file.mimeType) ? (
            <iframe src={src} className="w-full h-full" style={{ minHeight: 500, border: 'none' }} title={file.name} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
              <span className="text-5xl">{fileIcon(file.mimeType)}</span>
              <p className="text-sm">Không thể xem trước loại file này</p>
              <a href={src} target="_blank" rel="noopener noreferrer"
                className="px-4 py-2 text-sm font-medium text-white rounded-lg transition"
                style={{ background: '#A70A0A' }}
              >⬇ Tải về để xem</a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function CertificatesPage() {
  const [result, setResult]         = useState<BrowseResult | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbEntry[]>([
    { id: ROOT_FOLDER_ID, name: 'Giấy chứng nhận' }
  ])
  const [preview, setPreview]       = useState<DriveItem | null>(null)

  const currentFolderId = breadcrumb[breadcrumb.length - 1].id

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/certificates/browse?folderId=${currentFolderId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setResult(d)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [currentFolderId])

  function navigateInto(folder: DriveItem) {
    setBreadcrumb(prev => [...prev, { id: folder.id, name: folder.name }])
  }

  function navigateTo(idx: number) {
    setBreadcrumb(prev => prev.slice(0, idx + 1))
  }

  const folders = result?.items.filter(i => i.isFolder)  ?? []
  const files   = result?.items.filter(i => !i.isFolder) ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs text-gray-400 mb-2 flex-wrap">
          <span>EUP</span>
          <span>/</span>
          {breadcrumb.map((crumb, idx) => (
            <span key={crumb.id} className="flex items-center gap-1">
              {idx < breadcrumb.length - 1 ? (
                <>
                  <button onClick={() => navigateTo(idx)} className="hover:text-gray-700 transition">{crumb.name}</button>
                  <span>/</span>
                </>
              ) : (
                <span className="text-gray-700 font-medium">{crumb.name}</span>
              )}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">📜 Giấy chứng nhận</h1>
            <p className="text-xs text-gray-400 mt-0.5">Chứng nhận & giấy phép của công ty EUP</p>
          </div>
          {!loading && result && (
            <span className="text-xs text-gray-400">
              {folders.length > 0 && `${folders.length} thư mục`}
              {folders.length > 0 && files.length > 0 && ' · '}
              {files.length > 0 && `${files.length} file`}
            </span>
          )}
        </div>

        {/* Back button */}
        {breadcrumb.length > 1 && (
          <button
            onClick={() => navigateTo(breadcrumb.length - 2)}
            className="mt-3 flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 transition"
          >
            ← Quay lại
          </button>
        )}
      </div>

      {/* Content */}
      <div className="px-6 py-5">
        {loading && (
          <div className="flex items-center justify-center h-48 text-gray-400 gap-2">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-red-600 rounded-full animate-spin" />
            <span className="text-sm">Đang tải...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">❌ {error}</div>
        )}

        {!loading && !error && result && (
          <div className="space-y-5">
            {/* Folders */}
            {folders.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Thư mục</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {folders.map(folder => (
                    <button
                      key={folder.id}
                      onClick={() => navigateInto(folder)}
                      className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all p-4 text-left group"
                    >
                      <span className="text-3xl flex-shrink-0">📁</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 group-hover:text-blue-700 transition leading-snug line-clamp-2">{folder.name}</p>
                        {folder.modifiedTime && (
                          <p className="text-[11px] text-gray-400 mt-0.5">{formatDate(folder.modifiedTime)}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Files */}
            {files.length > 0 && (
              <div>
                {folders.length > 0 && (
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">File</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {files.map(file => (
                    <button
                      key={file.id}
                      onClick={() => setPreview(file)}
                      className="flex flex-col bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all overflow-hidden text-left group"
                    >
                      {/* Top color bar */}
                      <div className="h-1" style={{ background: isPdf(file.mimeType) ? '#A70A0A' : isImage(file.mimeType) ? '#00AF50' : '#164d81' }} />

                      {/* Preview area */}
                      <div className="w-full bg-gray-50 flex items-center justify-center" style={{ height: 140, position: 'relative', overflow: 'hidden' }}>
                        {canPreview(file.mimeType) ? (
                          <iframe
                            src={`/api/certificates/file?id=${file.id}`}
                            className="w-full h-full pointer-events-none"
                            style={{ border: 'none', transform: 'scale(1)', transformOrigin: 'top left' }}
                            title={file.name}
                            loading="lazy"
                          />
                        ) : (
                          <span className="text-5xl opacity-40">{fileIcon(file.mimeType)}</span>
                        )}
                      </div>

                      {/* Info */}
                      <div className="p-3">
                        <p className="text-xs font-semibold text-gray-800 group-hover:text-[#A70A0A] transition leading-snug line-clamp-2">{file.name}</p>
                        <p className="text-[10px] text-gray-400 mt-1">{formatDate(file.modifiedTime)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Empty */}
            {folders.length === 0 && files.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                <span className="text-4xl mb-3">📂</span>
                <p className="text-sm">Thư mục trống</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preview modal */}
      {preview && <FilePreviewModal file={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}
