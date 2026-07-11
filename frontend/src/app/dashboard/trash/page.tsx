'use client';

import { useEffect, useState } from 'react';
import { Loader2, Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import { FileRecord, filesApi } from '@/lib/api';
import { formatBytes, formatRelative } from '@/lib/utils';

export default function TrashPage() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await filesApi.trash();
      setFiles(r.files);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleRestore(file: FileRecord) {
    setRestoring(file.id);
    try {
      await filesApi.restore(file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Trash</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Files are permanently deleted after 7 days in trash.
        </p>
      </div>

      {files.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Files in trash will be permanently deleted 7 days after deletion. Restore them to keep them.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Trash2 className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">Trash is empty</p>
          <p className="mt-1 text-xs text-muted-foreground">Deleted files will appear here for 7 days</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="py-2.5 pl-4 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Size</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Deleted</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Expires</th>
                <th className="pr-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {files.map((file) => {
                const deletedAt = new Date(file.deleted_at!);
                const expiresAt = new Date(deletedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
                const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

                return (
                  <tr key={file.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="py-3 pl-4">
                      <p className="text-sm font-medium truncate max-w-xs">{file.file_name}</p>
                      <p className="text-xs text-muted-foreground">{file.mime_type}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{formatBytes(file.size_bytes)}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{formatRelative(file.deleted_at!)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${daysLeft <= 1 ? 'text-destructive' : daysLeft <= 3 ? 'text-orange-500' : 'text-muted-foreground'}`}>
                        {daysLeft <= 0 ? 'Expiring soon' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`}
                      </span>
                    </td>
                    <td className="pr-4 py-3">
                      <button
                        onClick={() => handleRestore(file)}
                        disabled={restoring === file.id}
                        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                      >
                        {restoring === file.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        Restore
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
