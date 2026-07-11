'use client';

import { useState } from 'react';
import { X, Copy, Check, Link2, Lock, Eye, Download, Clock, Hash } from 'lucide-react';
import { FileRecord, shareApi } from '@/lib/api';
import { copyToClipboard } from '@/lib/utils';

interface Props {
  file: FileRecord;
  onClose: () => void;
}

export function ShareModal({ file, onClose }: Props) {
  const [config, setConfig] = useState({
    permission: 'view' as 'view' | 'download',
    hasExpiry: false,
    expiresAt: '',
    hasPassword: false,
    password: '',
    isOneTime: false,
    hasMaxAccess: false,
    maxAccessCount: 10,
  });
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const result = await shareApi.create(file.id, {
        permission: config.permission,
        expiresAt: config.hasExpiry && config.expiresAt ? config.expiresAt : null,
        password: config.hasPassword && config.password ? config.password : null,
        isOneTime: config.isOneTime,
        maxAccessCount: config.hasMaxAccess ? config.maxAccessCount : null,
      });
      setShareUrl(result.url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    await copyToClipboard(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-50 w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold">Share file</h2>
              <p className="text-xs text-muted-foreground truncate max-w-[240px]">{file.file_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!shareUrl ? (
          <div className="space-y-4 p-5">
            {/* Permission */}
            <div>
              <label className="mb-2 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Permission
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'view', label: 'View only', icon: Eye, desc: 'Recipients can preview' },
                  { value: 'download', label: 'Download', icon: Download, desc: 'Recipients can download' },
                ].map(({ value, label, icon: Icon, desc }) => (
                  <button
                    key={value}
                    onClick={() => setConfig((c) => ({ ...c, permission: value as any }))}
                    className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors ${
                      config.permission === value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <Icon className={`mb-1 h-4 w-4 ${config.permission === value ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-xs text-muted-foreground">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Options */}
            <div className="space-y-3">
              {/* Expiry */}
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="has-expiry"
                  checked={config.hasExpiry}
                  onChange={(e) => setConfig((c) => ({ ...c, hasExpiry: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <div className="flex-1">
                  <label htmlFor="has-expiry" className="flex cursor-pointer items-center gap-1.5 text-sm font-medium">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Expiry date
                  </label>
                  {config.hasExpiry && (
                    <input
                      type="datetime-local"
                      value={config.expiresAt}
                      min={new Date().toISOString().slice(0, 16)}
                      onChange={(e) => setConfig((c) => ({ ...c, expiresAt: e.target.value }))}
                      className="mt-2 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  )}
                </div>
              </div>

              {/* Password */}
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="has-password"
                  checked={config.hasPassword}
                  onChange={(e) => setConfig((c) => ({ ...c, hasPassword: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <div className="flex-1">
                  <label htmlFor="has-password" className="flex cursor-pointer items-center gap-1.5 text-sm font-medium">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" /> Password protection
                  </label>
                  {config.hasPassword && (
                    <input
                      type="text"
                      placeholder="Set a password"
                      value={config.password}
                      onChange={(e) => setConfig((c) => ({ ...c, password: e.target.value }))}
                      className="mt-2 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  )}
                </div>
              </div>

              {/* One-time */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="one-time"
                  checked={config.isOneTime}
                  onChange={(e) => setConfig((c) => ({ ...c, isOneTime: e.target.checked }))}
                  className="h-4 w-4 accent-primary"
                />
                <label htmlFor="one-time" className="text-sm font-medium cursor-pointer">
                  One-time access — link expires after first view
                </label>
              </div>

              {/* Max access count */}
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="has-max"
                  checked={config.hasMaxAccess}
                  onChange={(e) => setConfig((c) => ({ ...c, hasMaxAccess: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <div className="flex-1">
                  <label htmlFor="has-max" className="flex cursor-pointer items-center gap-1.5 text-sm font-medium">
                    <Hash className="h-3.5 w-3.5 text-muted-foreground" /> Maximum access count
                  </label>
                  {config.hasMaxAccess && (
                    <input
                      type="number"
                      min={1}
                      value={config.maxAccessCount}
                      onChange={(e) => setConfig((c) => ({ ...c, maxAccessCount: parseInt(e.target.value) || 1 }))}
                      className="mt-2 w-24 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  )}
                </div>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Creating link…' : 'Create share link'}
            </button>
          </div>
        ) : (
          <div className="p-5">
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
              <Check className="h-4 w-4 shrink-0" />
              <span className="text-sm font-medium">Share link created successfully</span>
            </div>

            <div className="mb-4 flex gap-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm font-mono text-muted-foreground"
              />
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground space-y-1">
              <p>Permission: <strong className="text-foreground">{config.permission}</strong></p>
              {config.hasExpiry && config.expiresAt && <p>Expires: <strong className="text-foreground">{new Date(config.expiresAt).toLocaleString()}</strong></p>}
              {config.isOneTime && <p className="text-orange-600 dark:text-orange-400">⚠ One-time access — this link will expire after the first view</p>}
              {config.hasPassword && <p>🔒 Password protected</p>}
              {config.hasMaxAccess && <p>Max {config.maxAccessCount} accesses</p>}
            </div>

            <button onClick={onClose} className="mt-4 w-full rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
