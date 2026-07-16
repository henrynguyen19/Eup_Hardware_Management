'use client'

import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'

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
  const { t } = useLanguage()
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
            >{t.chungNhan.download}</a>
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
              <p className="text-sm">{t.chungNhan.noPreview}</p>
              <a href={src} target="_blank" rel="noopener noreferrer"
                className="px-4 py-2 text-sm font-medium text-white rounded-lg transition"
                style={{ background: '#A70A0A' }}
              >{t.chungNhan.downloadToView}</a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function CertificatesPage({
  rootFolderId: rootFolderIdProp,
  title: titleProp,
  isAdmin = false,
}: {
  rootFolderId?: string
  title?: string
  isAdmin?: boolean
} = {}) {
  const { t } = useLanguage()
  const effectiveRootId = rootFolderIdProp ?? ROOT_FOLDER_ID
  const effectiveTitle  = titleProp ?? t.chungNhan.title
  const [result, setResult]         = useState<BrowseResult | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbEntry[]>([
    { id: effectiveRootId, name: effectiveTitle }
  ])
  const [preview, setPreview]       = useState<DriveItem | null>(null)

  // Admin actions
  const [showNewFolder, setShowNewFolder]   = useState(false)
  const [newFolderName, setNewFolderName]   = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [uploading, setUploading]           = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>('')
  const fileInputRef                        = useRef<HTMLInputElement>(null)

  const currentFolderId = breadcrumb[breadcrumb.length - 1].id

  // Reset khi đổi root folder (đổi subtab)
  useEffect(() => {
    setBreadcrumb([{ id: effectiveRootId, name: effectiveTitle }])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRootId])

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

  async function createFolder() {
    if (!newFolderName.trim()) return
    setCreatingFolder(true)
    try {
      const res = await fetch('/api/certificates/browse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: currentFolderId, folderName: newFolderName.trim() }),
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setNewFolderName('')
      setShowNewFolder(false)
      // Reload current folder
      setLoading(true)
      fetch(`/api/certificates/browse?folderId=${currentFolderId}`)
        .then(r => r.json()).then(d => setResult(d)).finally(() => setLoading(false))
    } catch (e) {
      alert('Lỗi tạo thư mục: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setCreatingFolder(false)
    }
  }

  async function uploadFiles(files: FileList) {
    setUploading(true)
    const total = files.length
    for (let i = 0; i < total; i++) {
      const file = files[i]
      setUploadProgress(`Đang tải lên ${i + 1}/${total}: ${file.name}`)
      const fd = new FormData()
      fd.append('file', file)
      fd.append('parentId', currentFolderId)
      const res = await fetch('/api/certificates/file', { method: 'POST', body: fd })
      const d = await res.json()
      if (!d.ok) {
        alert(`Lỗi upload ${file.name}: ${d.error}`)
        break
      }
    }
    setUploadProgress('')
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    // Reload
    setLoading(true)
    fetch(`/api/certificates/browse?folderId=${currentFolderId}`)
      .then(r => r.json()).then(d => setResult(d)).finally(() => setLoading(false))
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
            <h1 className="text-xl font-bold text-gray-900">📜 {t.chungNhan.title}</h1>
            <p className="text-xs text-gray-400 mt-0.5">{t.chungNhan.subtitle}</p>
          </div>
          {!loading && result && (
            <span className="text-xs text-gray-400">
              {folders.length > 0 && `${folders.length} thư mục`}
              {folders.length > 0 && files.length > 0 && ' · '}
              {files.length > 0 && `${files.length} file`}
            </span>
          )}
        </div>

        {/* Back button + Admin actions */}
        <div className="flex items-center justify-between mt-3">
          {breadcrumb.length > 1 ? (
            <button
              onClick={() => navigateTo(breadcrumb.length - 2)}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 transition"
            >
              {t.chungNhan.back}
            </button>
          ) : <div />}

          {isAdmin && (
            <div className="flex items-center gap-2">
              {uploadProgress && (
                <span className="text-xs text-blue-600 animate-pulse">{uploadProgress}</span>
              )}
              <button
                onClick={() => setShowNewFolder(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
              >
                📁 Tạo thư mục
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-white transition disabled:opacity-50"
                style={{ background: '#A70A0A' }}
              >
                {uploading ? '⏳ Đang tải…' : '⬆️ Upload file'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => e.target.files && uploadFiles(e.target.files)}
              />
            </div>
          )}
        </div>

        {/* New folder modal */}
        {showNewFolder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowNewFolder(false)}>
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
              <h3 className="font-semibold text-gray-800 mb-3">📁 Tạo thư mục mới</h3>
              <input
                autoFocus
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 mb-3"
                placeholder="Tên thư mục…"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createFolder()}
              />
              <div className="flex gap-2">
                <button
                  onClick={createFolder}
                  disabled={creatingFolder || !newFolderName.trim()}
                  className="flex-1 py-2 text-sm font-medium text-white rounded-xl disabled:opacity-50 transition"
                  style={{ background: '#A70A0A' }}
                >
                  {creatingFolder ? 'Đang tạo…' : 'Tạo'}
                </button>
                <button onClick={() => setShowNewFolder(false)}
                  className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50">
                  Hủy
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-6 py-5">
        {loading && (
          <div className="flex items-center justify-center h-48 text-gray-400 gap-2">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-red-600 rounded-full animate-spin" />
            <span className="text-sm">{t.common.loading}</span>
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
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{t.chungNhan.folders}</p>
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
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{t.chungNhan.files}</p>
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
                <p className="text-sm">{t.chungNhan.emptyFolder}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preview modal */}
      {preview && (
        <FilePreviewModal file={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  )
}
