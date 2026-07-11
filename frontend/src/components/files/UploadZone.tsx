'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, AlertTriangle, CheckCircle, Loader2, ShieldAlert } from 'lucide-react';
import { filesApi, scanApi, CredentialFinding } from '@/lib/api';
import { formatBytes, uploadToS3, getSeverityClass } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface UploadState {
  file: File;
  status: 'scanning' | 'scan_warning' | 'uploading' | 'done' | 'error';
  progress?: number;
  scanFindings?: CredentialFinding[];
  scanRiskScore?: number;
  error?: string;
}

interface Props {
  onUploadComplete?: () => void;
}

export function UploadZone({ onUploadComplete }: Props) {
  const [uploads, setUploads] = useState<UploadState[]>([]);

  const updateUpload = (file: File, patch: Partial<UploadState>) => {
    setUploads((prev) =>
      prev.map((u) => (u.file === file ? { ...u, ...patch } : u))
    );
  };

  const processFile = useCallback(async (file: File) => {
    setUploads((prev) => [...prev, { file, status: 'scanning' }]);

    // ── Step 1: Pre-upload credential scan ──────────────────────────────
    const isTextFile = file.type.startsWith('text/') ||
      ['application/json', 'application/xml', 'application/javascript'].includes(file.type) ||
      /\.(env|yaml|yml|toml|cfg|ini|config|log|md|sh|py|js|ts|rb|go|java|php)$/i.test(file.name);

    if (isTextFile && file.size < 5 * 1024 * 1024) {
      try {
        const text = await file.text();
        const result = await scanApi.scanCredentials(text, file.name);

        if (result.findings.length > 0) {
          updateUpload(file, {
            status: 'scan_warning',
            scanFindings: result.findings,
            scanRiskScore: result.riskScore,
          });
          return; // Wait for user to acknowledge
        }
      } catch {
        // Scan failure should not block the upload
      }
    }

    await doUpload(file);
  }, []);

  async function doUpload(file: File) {
    updateUpload(file, { status: 'uploading', progress: 0 });

    try {
      // ── Step 2: Get presigned URL ────────────────────────────────────
      const { fileId, s3Key, uploadUrl } = await filesApi.initiateUpload({
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      });

      // ── Step 3: Upload to S3 ─────────────────────────────────────────
      const ok = await uploadToS3(uploadUrl, file);
      if (!ok) throw new Error('S3 upload failed');

      // ── Step 4: Confirm with backend ─────────────────────────────────
      await filesApi.confirmUpload(fileId, s3Key);

      updateUpload(file, { status: 'done', progress: 100 });
      onUploadComplete?.();

      // Auto-remove after 3s
      setTimeout(() => {
        setUploads((prev) => prev.filter((u) => u.file !== file));
      }, 3000);
    } catch (err: any) {
      updateUpload(file, { status: 'error', error: err.message });
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => files.forEach(processFile),
    multiple: true,
  });

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border px-6 py-10 text-center transition-all',
          isDragActive && 'drop-zone-active'
        )}
      >
        <input {...getInputProps()} />
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Upload className="h-5 w-5 text-primary" />
        </div>
        <p className="text-sm font-medium">
          {isDragActive ? 'Drop files here' : 'Drag files here or click to upload'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          All file types supported · Up to 5 GB per file
        </p>
      </div>

      {/* Upload queue */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((u, i) => (
            <UploadCard
              key={i}
              upload={u}
              onAcknowledge={() => doUpload(u.file)}
              onCancel={() => setUploads((prev) => prev.filter((x) => x.file !== u.file))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UploadCard({
  upload,
  onAcknowledge,
  onCancel,
}: {
  upload: UploadState;
  onAcknowledge: () => void;
  onCancel: () => void;
}) {
  const { file, status, scanFindings = [], scanRiskScore = 0, error } = upload;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {status === 'scanning' && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning…
            </span>
          )}
          {status === 'uploading' && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
            </span>
          )}
          {status === 'done' && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="h-3.5 w-3.5" /> Done
            </span>
          )}
          {status === 'error' && (
            <span className="text-xs text-destructive">{error}</span>
          )}
          {(status === 'scan_warning' || status === 'error') && (
            <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Scan warning panel */}
      {status === 'scan_warning' && (
        <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-900 dark:bg-orange-950/40">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <span className="text-sm font-semibold text-orange-700 dark:text-orange-300">
                {scanFindings.length} credential pattern{scanFindings.length !== 1 ? 's' : ''} detected
              </span>
            </div>
            <span className="rounded-full bg-orange-200 px-2 py-0.5 text-xs font-semibold text-orange-800 dark:bg-orange-900 dark:text-orange-300">
              Risk {scanRiskScore}/100
            </span>
          </div>

          <div className="mb-3 space-y-1.5">
            {(expanded ? scanFindings : scanFindings.slice(0, 3)).map((f, i) => (
              <div key={i} className="rounded-md bg-white/50 px-3 py-2 dark:bg-black/20">
                <div className="flex items-center gap-2">
                  <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase', getSeverityClass(f.severity))}>
                    {f.severity}
                  </span>
                  <span className="text-xs font-medium">{f.patternName}</span>
                  <span className="ml-auto text-xs text-muted-foreground">line {f.lineNumber}</span>
                </div>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground truncate">{f.linePreview}</p>
              </div>
            ))}
            {scanFindings.length > 3 && !expanded && (
              <button onClick={() => setExpanded(true)} className="text-xs text-orange-600 hover:underline dark:text-orange-400">
                +{scanFindings.length - 3} more findings
              </button>
            )}
          </div>

          <p className="mb-3 text-xs text-orange-700 dark:text-orange-400">
            Review the detected patterns above. If these are real credentials, revoke them immediately before proceeding.
          </p>

          <div className="flex gap-2">
            <button
              onClick={onAcknowledge}
              className="flex-1 rounded-md border border-orange-300 bg-white px-3 py-1.5 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-50 dark:border-orange-700 dark:bg-transparent dark:text-orange-400 dark:hover:bg-orange-950"
            >
              I understand — upload anyway
            </button>
            <button
              onClick={onCancel}
              className="rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-orange-700"
            >
              Cancel upload
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
