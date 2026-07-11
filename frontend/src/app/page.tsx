import Link from 'next/link';
import { Shield, Zap, Lock, BarChart2, Share2, History, AlertTriangle, CheckCircle } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <span className="text-xs font-bold text-primary-foreground">N</span>
            </div>
            <span className="font-semibold tracking-tight">nimbus</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Get started free
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-screen-xl px-4 py-20 text-center">
        <div className="mx-auto mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <Shield className="h-3.5 w-3.5 text-primary" />
          Security-first cloud storage
        </div>
        <h1 className="mx-auto max-w-3xl text-5xl font-bold tracking-tight leading-tight">
          Cloud storage that{' '}
          <span className="text-primary">watches your back</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
          Nimbus combines the simplicity of file storage with enterprise-grade security: 
          credential scanning, anomaly detection, real-time alerts, and infrastructure auditing — built in.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/register"
            className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            Start for free — 5 GB included
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-border px-6 py-3 text-sm font-semibold transition-colors hover:bg-accent"
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-screen-xl px-4 pb-20">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-6">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-sm font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Scan patterns */}
      <section className="border-t border-border bg-muted/30 py-16">
        <div className="mx-auto max-w-screen-xl px-4">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold">15+ credential patterns detected</h2>
            <p className="mt-2 text-muted-foreground">Before your file even reaches storage</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {SCAN_PATTERNS.map((p) => (
              <div key={p.name} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
                <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.severity}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-screen-xl px-4 text-center text-sm text-muted-foreground">
          <p>Built with Next.js, Node.js, PostgreSQL, AWS S3, and Firebase.</p>
        </div>
      </footer>
    </div>
  );
}

const FEATURES = [
  {
    icon: Shield,
    title: 'Pre-upload credential scanning',
    description: 'Every file is scanned for API keys, tokens, and secrets before upload. You see exactly what was found and decide whether to proceed.',
  },
  {
    icon: AlertTriangle,
    title: 'Anomaly detection',
    description: 'Statistical baseline per user. Spikes in access frequency, new geographies, and off-hours activity trigger real-time alerts.',
  },
  {
    icon: Zap,
    title: 'Real-time notifications',
    description: 'Firebase-powered live updates — know the moment a shared file is accessed, a scan flags an issue, or an anomaly is detected.',
  },
  {
    icon: Lock,
    title: 'Advanced sharing controls',
    description: 'Expiry dates, password protection, one-time access, and per-link access counts. Full control over who sees your files and when.',
  },
  {
    icon: History,
    title: 'File versioning',
    description: 'Every upload creates a new version. Browse history, download old versions, or restore with one click.',
  },
  {
    icon: BarChart2,
    title: 'Storage analytics',
    description: 'Storage over time, file type breakdown, activity heatmap, most accessed files — everything visualized from your own data.',
  },
  {
    icon: Shield,
    title: 'Infrastructure audit',
    description: 'Connect your AWS account and scan for misconfigurations: public S3 buckets, unrestricted security groups, missing MFA, and more.',
  },
  {
    icon: Share2,
    title: 'Audit log',
    description: 'Every file action is logged with timestamp, IP address, and user agent. Filterable by action type, file, and date range.',
  },
  {
    icon: Lock,
    title: 'Presigned URLs only',
    description: 'Raw S3 bucket URLs are never exposed to the client. All access goes through short-lived presigned URLs generated on demand.',
  },
];

const SCAN_PATTERNS = [
  { name: 'AWS Access Keys', severity: 'Critical' },
  { name: 'AWS Secret Keys', severity: 'Critical' },
  { name: 'Google API Keys', severity: 'High' },
  { name: 'GitHub Personal Access Tokens', severity: 'Critical' },
  { name: 'Stripe Live Secret Keys', severity: 'Critical' },
  { name: 'Slack Bot & User Tokens', severity: 'High' },
  { name: 'Private Keys (RSA, EC, OpenSSH)', severity: 'Critical' },
  { name: 'SendGrid API Keys', severity: 'High' },
  { name: 'Twilio Credentials', severity: 'High' },
  { name: 'JWT Tokens', severity: 'Medium' },
  { name: 'Database Connection Strings', severity: 'Critical' },
  { name: 'Firebase Service Accounts', severity: 'Critical' },
  { name: 'Heroku API Keys', severity: 'High' },
  { name: 'Slack Webhooks', severity: 'Medium' },
  { name: 'Generic Hardcoded Secrets', severity: 'Medium' },
];
