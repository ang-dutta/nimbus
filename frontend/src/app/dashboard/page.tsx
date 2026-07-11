'use client';

import { useCallback, useEffect, useState } from 'react';
import { Grid, List, Search, RefreshCw, Loader2 } from 'lucide-react';
import { FileRecord, filesApi } from '@/lib/api';
import { UploadZone } from '@/components/files/UploadZone';
import { FileCard } from '@/components/files/FileCard';
import { ShareModal } from '@/components/sharing/ShareModal';
import { VersionHistoryModal } from '@/components/files/VersionHistoryModal';
import { formatBytes } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

export default function DashboardPage() {
  const { user } = useAuth();
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<FileRecord | null>(null);
  const [modal, setModal] = useState<'share' | 'versions' | null>(null);
  const [storageUsed, setStorageUsed] = useState(0);
  const [storageQuota, setStorageQuota] = useState(5 * 1024 * 1024 * 1024);

  const loadFiles = useCallback(async () => {
    try {
      setLoading(true);
      if (searchQuery.trim()) {
        const r = await filesApi.search(searchQuery);
        setFiles(r.files);
      } else {
        const r = await filesApi.list();
        setFiles(r.files);
      }
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    const t = setTimeout(loadFiles, searchQuery ? 400 : 0);
    return () => clearTimeout(t);
  }, [loadFiles]);

  const storagePercent = Math.min(100, (storageUsed / storageQuota) * 100);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">My Files</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {files.length} file{files.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Storage usage */}
        <div className="hidden items-center gap-3 sm:flex">
          <div className="text-right">
            <p className="text-xs font-medium">{formatBytes(storageUsed)} used</p>
            <p className="text-xs text-muted-foreground">of {formatBytes(storageQuota)}</p>
          </div>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${storagePercent > 90 ? 'bg-destructive' : storagePercent > 70 ? 'bg-orange-500' : 'bg-primary'}`}
              style={{ width: `${storagePercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Upload zone */}
      <UploadZone onUploadComplete={loadFiles} />

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search files by name, type…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-4 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center rounded-lg border border-border">
          <button
            onClick={() => setView('grid')}
            className={`flex h-9 w-9 items-center justify-center rounded-l-lg transition-colors ${view === 'grid' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Grid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView('list')}
            className={`flex h-9 w-9 items-center justify-center rounded-r-lg transition-colors ${view === 'list' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={loadFiles}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* File list / grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium">{searchQuery ? 'No files match your search' : 'No files yet'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {searchQuery ? 'Try a different search term' : 'Upload your first file above'}
          </p>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {files.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              view="grid"
              onDeleted={loadFiles}
              onRenamed={loadFiles}
              onShareClick={(f) => { setSelectedFile(f); setModal('share'); }}
              onVersionsClick={(f) => { setSelectedFile(f); setModal('versions'); }}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="py-2.5 pl-4 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Size</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Uploaded</th>
                <th className="pr-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <FileCard
                  key={file.id}
                  file={file}
                  view="list"
                  onDeleted={loadFiles}
                  onRenamed={loadFiles}
                  onShareClick={(f) => { setSelectedFile(f); setModal('share'); }}
                  onVersionsClick={(f) => { setSelectedFile(f); setModal('versions'); }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {modal === 'share' && selectedFile && (
        <ShareModal file={selectedFile} onClose={() => { setModal(null); setSelectedFile(null); loadFiles(); }} />
      )}
      {modal === 'versions' && selectedFile && (
        <VersionHistoryModal
          file={selectedFile}
          onClose={() => { setModal(null); setSelectedFile(null); }}
          onRestored={loadFiles}
        />
      )}
    </div>
  );
}
