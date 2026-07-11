'use client';

import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, Filter } from 'lucide-react';
import { auditApi, AuditLog } from '@/lib/api';
import { formatDateTime, getSeverityClass } from '@/lib/utils';
import { cn } from '@/lib/utils';

const ACTION_TYPE_OPTIONS = [
  { value: '', label: 'All actions' },
  { value: 'file_upload', label: 'Uploads' },
  { value: 'file_download', label: 'Downloads' },
  { value: 'file_delete', label: 'Deletions' },
  { value: 'file_restore', label: 'Restores' },
  { value: 'share_link_created', label: 'Share links created' },
  { value: 'share_link_accessed', label: 'Share links accessed' },
  { value: 'share_link_revoked', label: 'Share links revoked' },
  { value: 'scan_flagged', label: 'Security scans flagged' },
  { value: 'anomaly_detected', label: 'Anomalies detected' },
  { value: 'version_upload', label: 'Version uploads' },
  { value: 'version_restore', label: 'Version restores' },
];

const ACTION_LABELS: Record<string, string> = {
  file_upload: 'File uploaded',
  file_download: 'File downloaded',
  file_preview: 'File previewed',
  file_rename: 'File renamed',
  file_delete: 'File deleted',
  file_restore: 'File restored',
  file_hard_delete: 'File permanently deleted',
  version_upload: 'Version uploaded',
  version_restore: 'Version restored',
  share_link_created: 'Share link created',
  share_link_revoked: 'Share link revoked',
  share_link_accessed: 'Share link accessed',
  share_link_expired: 'Share link expired',
  share_link_password_fail: 'Share password failed',
  scan_triggered: 'Security scan run',
  scan_flagged: 'Security scan flagged',
  anomaly_detected: 'Anomaly detected',
};

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const limit = 25;

  const [filters, setFilters] = useState({
    actionType: '',
    fileName: '',
    startDate: '',
    endDate: '',
  });

  async function loadLogs() {
    setLoading(true);
    try {
      const r = await auditApi.list({
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')),
        page,
        limit,
      });
      setLogs(r.logs);
      setTotal(r.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadLogs(); }, [page, filters]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Audit Log</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Complete activity timeline for your account
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Filter className="h-4 w-4" /> Filter
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Action type</label>
          <select
            value={filters.actionType}
            onChange={(e) => setFilters((f) => ({ ...f, actionType: e.target.value }))}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          >
            {ACTION_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">File name</label>
          <input
            type="search"
            placeholder="Search file name…"
            value={filters.fileName}
            onChange={(e) => setFilters((f) => ({ ...f, fileName: e.target.value }))}
            className="h-8 w-48 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">From</label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">To</label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <button
          onClick={() => { setFilters({ actionType: '', fileName: '', startDate: '', endDate: '' }); setPage(1); }}
          className="h-8 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Clear
        </button>
        <span className="ml-auto text-xs text-muted-foreground">{total} entries</span>
      </div>

      {/* Log table */}
      <div className="rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No log entries found</div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="py-2.5 pl-4 text-left text-xs font-medium text-muted-foreground">Timestamp</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Action</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">File</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">IP Address</th>
                <th className="pr-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className={cn(
                    'border-b border-border last:border-0 transition-colors',
                    log.is_anomalous ? 'bg-orange-50/50 dark:bg-orange-950/10 hover:bg-orange-50 dark:hover:bg-orange-950/20' : 'hover:bg-muted/20'
                  )}
                >
                  <td className="py-3 pl-4 text-xs text-muted-foreground whitespace-nowrap">
                    {formatDateTime(log.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {log.is_anomalous && <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0" />}
                      <span className="text-sm">{ACTION_LABELS[log.action_type] ?? log.action_type}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground max-w-[200px] truncate">
                    {log.file_name ?? '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {log.ip_address ?? '—'}
                  </td>
                  <td className="pr-4 py-3 text-xs text-muted-foreground max-w-[200px]">
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <span className="truncate block">
                        {Object.entries(log.metadata)
                          .slice(0, 2)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(', ')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-accent"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-accent"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
