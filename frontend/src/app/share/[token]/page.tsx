'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Lock, Download, Eye, FileIcon, Loader2, AlertTriangle } from 'lucide-react';
import { shareApi, ShareResolution } from '@/lib/api';
import { formatBytes } from '@/lib/utils';

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<'loading' | 'password' | 'resolved' | 'error'>('loading');
  const [resolution, setResolution] = useState<ShareResolution | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    shareApi.resolve(token).then((r) => {
      if (r.requiresPassword) {
        setResolution(r);
        setState('password');
      } else {
        setResolution(r);
        setState('resolved');
      }
    }).catch((err) => {
      setErrorMsg(err.message);
      setState('error');
    });
  }, [token]);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setPasswordError('');
    try {
      const r = await shareApi.submitPassword(token, password);
      setResolution(r);
      setState('resolved');
    } catch (err: any) {
      setPasswordError(err.message || 'Incorrect password');
    } finally {
      setSubmitting(false);
    }
  }

  if (state === 'loading') {
    return (
      <ShareShell>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ShareShell>
    );
  }

  if (state === 'error') {
    return (
      <ShareShell>
        <div className="flex flex-col items-center py-12 text-center">
          <AlertTriangle className="mb-3 h-10 w-10 text-destructive" />
          <h2 className="text-lg font-semibold">Link unavailable</h2>
          <p className="mt-1 text-sm text-muted-foreground">{errorMsg}</p>
        </div>
      </ShareShell>
    );
  }

  if (state === 'password') {
    return (
      <ShareShell>
        <div className="flex flex-col items-center py-8 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">Password required</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This file is protected. Enter the password to access it.
          </p>
          <p className="mt-2 text-sm font-medium">{resolution?.fileName}</p>

          <form onSubmit={handlePasswordSubmit} className="mt-6 w-full max-w-xs">
            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {passwordError && (
              <p className="mt-2 text-sm text-destructive">{passwordError}</p>
            )}
            <button
              type="submit"
              disabled={submitting || !password}
              className="mt-3 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Verifying…' : 'Access file'}
            </button>
          </form>
        </div>
      </ShareShell>
    );
  }

  const r = resolution!;

  return (
    <ShareShell>
      <div className="space-y-6 py-4">
        {/* File info */}
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-muted">
            <FileIcon className="h-7 w-7 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold leading-tight">{r.fileName}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{formatBytes(r.sizeBytes)}</p>
            {r.permission === 'view' && (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                <Eye className="h-3 w-3" /> View only
              </span>
            )}
          </div>
        </div>

        {/* Preview */}
        {r.fileUrl && r.mimeType?.startsWith('image/') && (
          <div className="overflow-hidden rounded-xl border border-border">
            <img src={r.fileUrl} alt={r.fileName} className="max-h-96 w-full object-contain" />
          </div>
        )}

        {r.fileUrl && r.mimeType === 'application/pdf' && (
          <div className="overflow-hidden rounded-xl border border-border">
            <iframe src={r.fileUrl} className="h-[500px] w-full" title={r.fileName} />
          </div>
        )}

        {r.fileUrl && r.mimeType?.startsWith('text/') && (
          <div className="rounded-xl border border-border bg-muted p-4">
            <p className="text-xs text-muted-foreground">Text preview not available. Download to view.</p>
          </div>
        )}

        {/* Action */}
        {r.permission === 'download' && r.fileUrl && (
          <a
            href={r.fileUrl}
            download={r.fileName}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Download className="h-4 w-4" />
            Download {r.fileName}
          </a>
        )}

        {r.permission === 'view' && (
          <p className="text-center text-xs text-muted-foreground">
            This file is shared in view-only mode and cannot be downloaded.
          </p>
        )}
      </div>
    </ShareShell>
  );
}

function ShareShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-lg items-center px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <span className="text-xs font-bold text-primary-foreground">N</span>
            </div>
            <span className="font-semibold">nimbus</span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-8">{children}</main>
    </div>
  );
}
