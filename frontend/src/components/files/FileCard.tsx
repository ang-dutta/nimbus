'use client';

import { useState } from 'react';
import {
  Download, Eye, Share2, Pencil, Trash2, History, MoreHorizontal,
  File, FileImage, FileVideo, FileAudio, FileCode, FileArchive, FileText,
} from 'lucide-react';
import { FileRecord, filesApi } from '@/lib/api';
import { formatBytes, formatRelative, getFileCategory } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface Props {
  file: FileRecord;
  view: 'grid' | 'list';
  onDeleted: () => void;
  onRenamed: () => void;
  onShareClick: (file: FileRecord) => void;
  onVersionsClick: (file: FileRecord) => void;
}

const FILE_ICONS: Record<string, React.ElementType> = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  code: FileCode,
  archive: FileArchive,
  document: FileText,
  other: File,
};

const ICON_COLORS: Record<string, string> = {
  image: 'text-violet-500',
  video: 'text-pink-500',
  audio: 'text-cyan-500',
  code: 'text-emerald-500',
  archive: 'text-amber-500',
  document: 'text-red-500',
  other: 'text-slate-400',
};

export function FileCard({ file, view, onDeleted, onRenamed, onShareClick, onVersionsClick }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(file.file_name);
  const [loading, setLoading] = useState<string | null>(null);

  const category = getFileCategory(file.mime_type);
  const Icon = FILE_ICONS[category] ?? File;
  const iconColor = ICON_COLORS[category] ?? 'text-slate-400';

  async function handleDownload() {
    setLoading('download');
    try {
      const { url, fileName } = await filesApi.getDownloadUrl(file.id);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setLoading(null);
    }
  }

  async function handlePreview() {
    setLoading('preview');
    try {
      const { url } = await filesApi.getPreviewUrl(file.id);
      window.open(url, '_blank', 'noopener');
    } finally {
      setLoading(null);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${file.file_name}"? It will be moved to Trash.`)) return;
    await filesApi.delete(file.id);
    onDeleted();
  }

  async function handleRename() {
    if (!newName.trim() || newName === file.file_name) {
      setRenaming(false);
      return;
    }
    await filesApi.rename(file.id, newName.trim());
    setRenaming(false);
    onRenamed();
  }

  if (view === 'list') {
    return (
      <tr className="group border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
        <td className="py-3 pl-4">
          <div className="flex items-center gap-3">
            <Icon className={cn('h-4 w-4 shrink-0', iconColor)} />
            {renaming ? (
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(false); }}
                className="w-full max-w-xs rounded border border-primary bg-background px-2 py-0.5 text-sm outline-none ring-2 ring-primary"
              />
            ) : (
              <span className="truncate text-sm font-medium max-w-xs">{file.file_name}</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">{formatBytes(file.size_bytes)}</td>
        <td className="px-4 py-3 text-sm text-muted-foreground">{file.mime_type?.split('/')[1] ?? '—'}</td>
        <td className="px-4 py-3 text-sm text-muted-foreground">{formatRelative(file.uploaded_at)}</td>
        <td className="pr-4 py-3">
          <FileActions
            file={file}
            onDownload={handleDownload}
            onPreview={handlePreview}
            onRename={() => setRenaming(true)}
            onDelete={handleDelete}
            onShare={() => onShareClick(file)}
            onVersions={() => onVersionsClick(file)}
            loading={loading}
            menuOpen={menuOpen}
            setMenuOpen={setMenuOpen}
          />
        </td>
      </tr>
    );
  }

  return (
    <div className="group relative rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-sm">
      {/* Icon area */}
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
        <Icon className={cn('h-6 w-6', iconColor)} />
      </div>

      {/* Name */}
      {renaming ? (
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(false); }}
          className="mb-1 w-full rounded border border-primary bg-background px-2 py-0.5 text-sm outline-none ring-2 ring-primary"
        />
      ) : (
        <p className="mb-1 truncate text-sm font-medium" title={file.file_name}>{file.file_name}</p>
      )}

      <p className="text-xs text-muted-foreground">{formatBytes(file.size_bytes)}</p>
      <p className="text-xs text-muted-foreground">{formatRelative(file.uploaded_at)}</p>

      {file.is_shared && (
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          <Share2 className="h-2.5 w-2.5" /> Shared
        </span>
      )}

      {/* Actions */}
      <div className="absolute right-3 top-3">
        <FileActions
          file={file}
          onDownload={handleDownload}
          onPreview={handlePreview}
          onRename={() => setRenaming(true)}
          onDelete={handleDelete}
          onShare={() => onShareClick(file)}
          onVersions={() => onVersionsClick(file)}
          loading={loading}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
        />
      </div>
    </div>
  );
}

function FileActions({ file, onDownload, onPreview, onRename, onDelete, onShare, onVersions, loading, menuOpen, setMenuOpen }: any) {
  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-foreground group-hover:opacity-100"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-8 z-50 w-44 rounded-lg border border-border bg-card shadow-lg animate-slide-in">
            {[
              { label: 'Preview', icon: Eye, action: onPreview },
              { label: 'Download', icon: Download, action: onDownload },
              { label: 'Share', icon: Share2, action: onShare },
              { label: 'Version history', icon: History, action: onVersions },
              { label: 'Rename', icon: Pencil, action: onRename },
            ].map(({ label, icon: Icon, action }) => (
              <button
                key={label}
                onClick={() => { setMenuOpen(false); action(); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
            <div className="mx-2 my-1 border-t border-border" />
            <button
              onClick={() => { setMenuOpen(false); onDelete(); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
