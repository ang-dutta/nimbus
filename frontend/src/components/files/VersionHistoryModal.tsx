'use client';

import { useEffect, useState } from 'react';
import { X, Clock, Download, RotateCcw, Loader2 } from 'lucide-react';
import { FileRecord, FileVersion, filesApi } from '@/lib/api';
import { formatBytes, formatDateTime } from '@/lib/utils';

interface Props {
  file: FileRecord;
  onClose: () => void;
  onRestored: () => void;
}

export function VersionHistoryModal({ file, onClose, onRestored }: Props) {
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    filesApi.getVersions(file.id)
      .then((r) => setVersions(r.versions))
      .finally(() => setLoading(false));
  }, [file.id]);

  async function handleRestore(version: FileVersion) {
    if (!confirm(`Restore version ${version.version_number}? This will create a new version of the file.`)) return;
    setRestoring(version.id);
    try {
      await filesApi.restoreVersion(file.id, version.id);
      onRestored();
      // Refresh versions
      const r = await filesApi.getVersions(file.id);
      setVersions(r.versions);
    } finally {
      setRestoring(null);
    }
  }

  async function handleDownloadVersion(version: FileVersion) {
    // For versioned downloads, we'd normally generate a presigned URL for the specific s3_key.
    // This would require a dedicated backend endpoint; for now open the latest download.
    const { url } = await filesApi.getDownloadUrl(file.id);
    window.open(url, '_blank');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-50 w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Version history</h2>
            <p className="text-xs text-muted-foreground truncate max-w-xs">{file.file_name}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No versions found</div>
          ) : (
            <div className="divide-y divide-border">
              {versions.map((v, idx) => (
                <div key={v.id} className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-start gap-3">
                    {/* Timeline dot */}
                    <div className="relative mt-1">
                      <div className={`h-2.5 w-2.5 rounded-full border-2 ${idx === 0 ? 'border-primary bg-primary' : 'border-border bg-card'}`} />
                      {idx < versions.length - 1 && (
                        <div className="absolute left-[4px] top-3 h-full w-[1px] bg-border" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">
                          Version {v.version_number}
                        </span>
                        {idx === 0 && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDateTime(v.uploaded_at)}
                        </span>
                        <span>{formatBytes(v.size_bytes)}</span>
                        <span>by {v.uploaded_by_name ?? 'Unknown'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDownloadVersion(v)}
                      className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      title="Download this version"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    {idx !== 0 && (
                      <button
                        onClick={() => handleRestore(v)}
                        disabled={restoring === v.id}
                        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                        title="Restore this version"
                      >
                        {restoring === v.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border px-5 py-3">
          <p className="text-xs text-muted-foreground">
            Versions are retained for 7 days after deletion. Restoring creates a new version.
          </p>
        </div>
      </div>
    </div>
  );
}
