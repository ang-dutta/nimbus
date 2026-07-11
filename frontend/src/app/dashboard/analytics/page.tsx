'use client';

import { useEffect, useState } from 'react';
import { Loader2, TrendingUp, HardDrive, Zap } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { analyticsApi, StoragePoint, FileTypeBreakdown, ActivityPoint, TopFile, FileRecord } from '@/lib/api';
import { formatBytes, formatDate } from '@/lib/utils';

const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#10b981', '#64748b'];

export default function AnalyticsPage() {
  const [storage, setStorage] = useState<{ series: StoragePoint[]; currentBytes: number; quotaBytes: number } | null>(null);
  const [breakdown, setBreakdown] = useState<FileTypeBreakdown[]>([]);
  const [activity, setActivity] = useState<ActivityPoint[]>([]);
  const [topFiles, setTopFiles] = useState<TopFile[]>([]);
  const [largestFiles, setLargestFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      analyticsApi.storage(),
      analyticsApi.breakdown(),
      analyticsApi.activity(),
      analyticsApi.topFiles(),
      analyticsApi.largestFiles(),
    ]).then(([s, b, a, t, l]) => {
      setStorage(s);
      setBreakdown(b.breakdown);
      setActivity(a.activity);
      setTopFiles(t.topFiles);
      setLargestFiles(l.largestFiles);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Storage usage and activity insights</p>
      </div>

      {/* ── Storage over time ──────────────────────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Storage over time</h2>
          {storage && (
            <span className="ml-auto text-sm text-muted-foreground">
              {formatBytes(storage.currentBytes)} / {formatBytes(storage.quotaBytes)}
            </span>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          {storage?.series && storage.series.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={storage.series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(d) => formatDate(d).slice(0, 6)} />
                <YAxis tickFormatter={(v) => formatBytes(v)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any) => [formatBytes(v), 'Storage used']}
                />
                <Line type="monotone" dataKey="storageBytes" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Upload some files to see storage over time" />
          )}
        </div>
      </section>

      {/* ── File type breakdown + Activity heatmap ─────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pie chart */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Storage by file type</h2>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            {breakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={breakdown} dataKey="total_bytes" nameKey="category" cx="50%" cy="50%" outerRadius={80} paddingAngle={2}>
                    {breakdown.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend formatter={(value) => <span style={{ fontSize: 12 }}>{value}</span>} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: any, name: any, props: any) => [
                      `${formatBytes(v)} (${props.payload.file_count} files)`,
                      props.payload.category,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No files yet" />
            )}
          </div>
        </section>

        {/* Activity heatmap */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Upload activity</h2>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <ActivityHeatmap data={activity} />
          </div>
        </section>
      </div>

      {/* ── Top files + Largest files ─────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-4 text-base font-semibold">Most accessed files</h2>
          <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            {topFiles.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">No access data yet</p>
            ) : topFiles.map((f, i) => (
              <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-5 text-center text-sm font-bold text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.file_name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(f.size_bytes)}</p>
                </div>
                <span className="text-sm font-semibold text-primary">{f.access_count}</span>
                <span className="text-xs text-muted-foreground">accesses</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-base font-semibold">Largest files</h2>
          <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            {largestFiles.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">No files yet</p>
            ) : largestFiles.map((f, i) => (
              <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-5 text-center text-sm font-bold text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.file_name}</p>
                  <p className="text-xs text-muted-foreground">{f.mime_type}</p>
                </div>
                <span className="text-sm font-medium">{formatBytes(f.size_bytes)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">{message}</div>
  );
}

function ActivityHeatmap({ data }: { data: ActivityPoint[] }) {
  if (data.length === 0) {
    return <EmptyChart message="No upload activity yet" />;
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const dataMap = new Map(data.map((d) => [d.date, d.count]));

  // Build last 52 weeks of dates
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 52 * 7);

  const weeks: Date[][] = [];
  let current = new Date(start);
  current.setDate(current.getDate() - current.getDay()); // align to Sunday

  while (current <= today) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
  }

  function getIntensity(date: Date): number {
    const key = date.toISOString().slice(0, 10);
    const count = dataMap.get(key) || 0;
    if (count === 0) return 0;
    return Math.ceil((count / maxCount) * 5);
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day, di) => {
              const intensity = getIntensity(day);
              return (
                <div
                  key={di}
                  title={`${day.toISOString().slice(0, 10)}: ${dataMap.get(day.toISOString().slice(0, 10)) || 0} uploads`}
                  className={`h-3 w-3 rounded-sm heatmap-${intensity}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
        <span>Less</span>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`h-3 w-3 rounded-sm heatmap-${i}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
