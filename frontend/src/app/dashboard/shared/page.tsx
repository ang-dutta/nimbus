'use client';

import { useEffect, useState } from 'react';
import { Loader2, Link2, Shield, Eye, Download, Clock, Hash, Trash2, Copy, Check, ExternalLink } from 'lucide-react';
import { ShareLink, shareApi } from '@/lib/api';
import { formatDateTime, formatRelative, copyToClipboard } from '@/lib/utils';
import { cn } from '@/lib/utils';

export default function SharedPage() {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    shareApi.list()
      .then((r) => setLinks(r.links))
      .finally(() => setLoading(false));
  }, []);

  async function handleRevoke(link: ShareLink) {
    if (!confirm(`Revoke share link for "${link.file_name}"? It will stop working immediately.`)) return;
    setRevoking(link.id);
    try {
      await shareApi.revoke(link.id);
      setLinks((prev) => prev.map((l) => l.id === link.id ? { ...l, is_active: false } : l));
    } finally {
      setRevoking(null);
    }
  }

  async function handleCopy(link: ShareLink) {
    const url = `${window.location.origin}/share/${link.token}`;
    await copyToClipboard(url);
    setCopied(link.id);
    setTimeout(() => setCopied(null), 2000);
  }

  const activeLinks = links.filter((l) => l.is_active);
  const inactiveLinks = links.filter((l) => !l.is_active);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Shared files</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {activeLinks.length} active share link{activeLinks.length !== 1 ? 's' : ''}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : links.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Link2 className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">No share links yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Create share links from the file manager</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active links */}
          {activeLinks.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Active</h2>
              <div className="space-y-3">
                {activeLinks.map((link) => (
                  <ShareLinkCard
                    key={link.id}
                    link={link}
                    onRevoke={() => handleRevoke(link)}
                    onCopy={() => handleCopy(link)}
                    revoking={revoking === link.id}
                    copied={copied === link.id}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Inactive links */}
          {inactiveLinks.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Expired / Revoked</h2>
              <div className="space-y-3 opacity-60">
                {inactiveLinks.map((link) => (
                  <ShareLinkCard key={link.id} link={link} inactive />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function ShareLinkCard({
  link, onRevoke, onCopy, revoking, copied, inactive,
}: {
  link: ShareLink;
  onRevoke?: () => void;
  onCopy?: () => void;
  revoking?: boolean;
  copied?: boolean;
  inactive?: boolean;
}) {
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/share/${link.token}` : '';

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* File name + status badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate">{link.file_name}</span>
            {!inactive ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                Active
              </span>
            ) : (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                Inactive
              </span>
            )}
          </div>

          {/* Metadata badges */}
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge icon={link.permission === 'download' ? Download : Eye} label={link.permission === 'download' ? 'Download' : 'View only'} />
            {link.has_password && <Badge icon={Shield} label="Password protected" />}
            {link.is_one_time && <Badge icon={Hash} label="One-time" />}
            {link.expires_at && (
              <Badge
                icon={Clock}
                label={`Expires ${formatRelative(link.expires_at)}`}
                className={new Date(link.expires_at) < new Date() ? 'text-destructive' : ''}
              />
            )}
            {link.max_access_count && (
              <Badge icon={Hash} label={`${link.access_count} / ${link.max_access_count} accesses`} />
            )}
            {!link.max_access_count && (
              <span className="text-xs text-muted-foreground">{link.access_count} access{link.access_count !== 1 ? 'es' : ''}</span>
            )}
          </div>

          {/* URL */}
          {!inactive && (
            <div className="mt-3 flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 rounded-md border border-border bg-muted px-2.5 py-1.5 font-mono text-xs text-muted-foreground"
              />
              <button
                onClick={onCopy}
                className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener"
                className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {/* Recent accesses */}
          {link.recent_accesses && link.recent_accesses.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Recent accesses</p>
              {link.recent_accesses.slice(0, 3).map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatDateTime(a.accessed_at)}</span>
                  <span>·</span>
                  <span className="font-mono">{a.ip_address || 'unknown IP'}</span>
                  {a.country && <span>({a.country})</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Revoke action */}
        {!inactive && onRevoke && (
          <button
            onClick={onRevoke}
            disabled={revoking}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            {revoking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Revoke
          </button>
        )}
      </div>
    </div>
  );
}

function Badge({ icon: Icon, label, className }: { icon: React.ElementType; label: string; className?: string }) {
  return (
    <span className={cn('flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground', className)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
