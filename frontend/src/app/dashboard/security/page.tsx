'use client';

import { useEffect, useState } from 'react';
import { Shield, Loader2, AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronRight, Check, Activity } from 'lucide-react';
import { scanApi, anomaliesApi, InfrastructureScanResult, InfraCheck, AnomalyEvent } from '@/lib/api';
import { getSeverityClass, formatRelative, formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

export default function SecurityPage() {
  const [creds, setCreds] = useState({ accessKeyId: '', secretAccessKey: '', region: 'us-east-1' });
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<InfrastructureScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedChecks, setExpandedChecks] = useState<Set<string>>(new Set());
  const [anomalies, setAnomalies] = useState<AnomalyEvent[]>([]);
  const [anomalyLoading, setAnomalyLoading] = useState(true);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  useEffect(() => {
    anomaliesApi.list()
      .then((r) => setAnomalies(r.anomalies))
      .finally(() => setAnomalyLoading(false));
  }, []);

  async function handleScan() {
    if (!creds.accessKeyId || !creds.secretAccessKey) return;
    setScanning(true);
    setError(null);
    try {
      const r = await scanApi.scanInfrastructure(creds);
      setResult(r);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }

  async function handleAcknowledge(id: string) {
    setAcknowledging(id);
    try {
      await anomaliesApi.acknowledge(id);
      setAnomalies((prev) => prev.map((a) => a.id === id ? { ...a, is_acknowledged: true } : a));
    } finally {
      setAcknowledging(null);
    }
  }

  const activeAnomalies = anomalies.filter((a) => !a.is_acknowledged);
  const acknowledgedAnomalies = anomalies.filter((a) => a.is_acknowledged);

  function toggleCheck(id: string) {
    setExpandedChecks((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Security</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Infrastructure auditing and active security alerts
        </p>
      </div>

      {/* ── Security Alerts (Anomalies) ─────────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Activity className="h-4 w-4 text-orange-500" />
            Security Alerts
            {activeAnomalies.length > 0 && (
              <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-white">
                {activeAnomalies.length}
              </span>
            )}
          </h2>
        </div>

        {anomalyLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : anomalies.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <CheckCircle className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
            <p className="text-sm font-medium">No security alerts</p>
            <p className="mt-1 text-xs text-muted-foreground">Access patterns look normal</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeAnomalies.map((a) => (
              <AnomalyCard
                key={a.id}
                anomaly={a}
                onAcknowledge={() => handleAcknowledge(a.id)}
                acknowledging={acknowledging === a.id}
              />
            ))}
            {acknowledgedAnomalies.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">
                  {acknowledgedAnomalies.length} acknowledged alert{acknowledgedAnomalies.length !== 1 ? 's' : ''}
                </summary>
                <div className="mt-2 space-y-2">
                  {acknowledgedAnomalies.map((a) => (
                    <AnomalyCard key={a.id} anomaly={a} acknowledged />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </section>

      {/* ── Infrastructure Scanner ──────────────────────────────────────── */}
      <section>
        <div className="mb-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Shield className="h-4 w-4 text-primary" />
            AWS Infrastructure Audit
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Provide temporary AWS credentials to scan for common security misconfigurations.
            Credentials are used only for this scan and never stored.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">AWS Access Key ID</label>
              <input
                type="text"
                placeholder="AKIAIOSFODNN7EXAMPLE"
                value={creds.accessKeyId}
                onChange={(e) => setCreds((c) => ({ ...c, accessKeyId: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Secret Access Key</label>
              <input
                type="password"
                placeholder="••••••••••••••••••••"
                value={creds.secretAccessKey}
                onChange={(e) => setCreds((c) => ({ ...c, secretAccessKey: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Region</label>
              <select
                value={creds.region}
                onChange={(e) => setCreds((c) => ({ ...c, region: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1', 'ap-northeast-1'].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={handleScan}
            disabled={scanning || !creds.accessKeyId || !creds.secretAccessKey}
            className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
            {scanning ? 'Scanning…' : 'Run security audit'}
          </button>

          {error && (
            <div className="mt-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
          )}
        </div>

        {/* Scan results */}
        {result && (
          <div className="mt-6 space-y-4">
            {/* Summary */}
            <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
              {/* Risk gauge */}
              <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="10" className="text-muted" />
                  <circle
                    cx="50" cy="50" r="40" fill="none" strokeWidth="10"
                    stroke={result.riskScore > 70 ? '#ef4444' : result.riskScore > 40 ? '#f97316' : '#22c55e'}
                    strokeDasharray={`${(result.riskScore / 100) * 251.3} 251.3`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute text-center">
                  <div className="text-2xl font-bold leading-none">{result.riskScore}</div>
                  <div className="text-[10px] text-muted-foreground">risk</div>
                </div>
              </div>

              <div className="flex-1">
                <h3 className="font-semibold">Scan complete</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {new Date(result.scannedAt).toLocaleString()}
                </p>
                <div className="mt-3 flex gap-4">
                  {[
                    { label: 'Passed', value: result.summary.passed, color: 'text-emerald-600' },
                    { label: 'Failed', value: result.summary.failed, color: 'text-destructive' },
                    { label: 'Critical', value: result.summary.critical, color: 'text-red-500 font-semibold' },
                    { label: 'High', value: result.summary.high, color: 'text-orange-500' },
                  ].map(({ label, value, color }) => (
                    <div key={label}>
                      <div className={cn('text-xl font-bold', color)}>{value}</div>
                      <div className="text-xs text-muted-foreground">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Check list */}
            <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
              {result.checks.map((check, i) => (
                <div key={i}>
                  <button
                    onClick={() => check.status === 'FAIL' ? toggleCheck(check.checkId + i) : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 px-5 py-3.5 text-left',
                      check.status === 'FAIL' && 'cursor-pointer hover:bg-muted/30'
                    )}
                  >
                    {check.status === 'PASS' ? (
                      <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : check.status === 'FAIL' ? (
                      <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{check.name}</span>
                        {check.status === 'FAIL' && (
                          <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase', getSeverityClass(check.severity))}>
                            {check.severity}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{check.resource}</p>
                    </div>
                    {check.status === 'FAIL' && (
                      expandedChecks.has(check.checkId + i)
                        ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>

                  {check.status === 'FAIL' && expandedChecks.has(check.checkId + i) && (
                    <div className="border-t border-border bg-muted/20 px-5 py-4">
                      <p className="mb-2 text-sm text-foreground">{check.description}</p>
                      {check.remediation && (
                        <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2">
                          <p className="text-xs font-semibold text-primary mb-1">Remediation</p>
                          <p className="text-xs text-muted-foreground">{check.remediation}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function AnomalyCard({ anomaly, onAcknowledge, acknowledging, acknowledged }: {
  anomaly: AnomalyEvent;
  onAcknowledge?: () => void;
  acknowledging?: boolean;
  acknowledged?: boolean;
}) {
  const severityColors: Record<string, string> = {
    critical: 'border-red-500/30 bg-red-50 dark:bg-red-950/20',
    high: 'border-orange-500/30 bg-orange-50 dark:bg-orange-950/20',
    medium: 'border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/20',
    low: 'border-border bg-card',
  };

  const anomalyLabels: Record<string, string> = {
    access_frequency_spike: 'Unusual access frequency',
    new_geography: 'Access from new location',
    off_hours_access: 'Off-hours access',
    repeated_password_failure: 'Repeated failed password attempts',
  };

  return (
    <div className={cn('rounded-xl border p-4', severityColors[anomaly.severity] ?? 'border-border bg-card', acknowledged && 'opacity-60')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', {
            'text-red-500': anomaly.severity === 'critical',
            'text-orange-500': anomaly.severity === 'high',
            'text-yellow-500': anomaly.severity === 'medium',
            'text-muted-foreground': anomaly.severity === 'low',
          })} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                {anomalyLabels[anomaly.anomaly_type] ?? anomaly.anomaly_type}
              </span>
              <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase', getSeverityClass(anomaly.severity))}>
                {anomaly.severity}
              </span>
            </div>
            {anomaly.file_name && (
              <p className="mt-0.5 text-xs text-muted-foreground">File: {anomaly.file_name}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{anomaly.statistical_basis}</p>
            <p className="mt-1 text-[11px] text-muted-foreground/70">{formatRelative(anomaly.created_at)}</p>
          </div>
        </div>

        {!acknowledged && onAcknowledge && (
          <button
            onClick={onAcknowledge}
            disabled={acknowledging}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
          >
            {acknowledging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Acknowledge
          </button>
        )}
        {acknowledged && (
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5" /> Acknowledged
          </span>
        )}
      </div>
    </div>
  );
}
