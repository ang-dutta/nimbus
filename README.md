# Nimbus — Secure Cloud File Storage

> Production-grade secure cloud storage with pre-upload credential scanning, real-time anomaly detection, file versioning, advanced share links, and a storage analytics dashboard.

[![CI](https://github.com/your-username/nimbus/actions/workflows/ci.yml/badge.svg)](https://github.com/your-username/nimbus/actions)

---

## Table of Contents

- [Architecture](#architecture)
- [Feature Overview](#feature-overview)
- [Tech Stack](#tech-stack)
- [Local Development Setup](#local-development-setup)
- [Environment Variables](#environment-variables)
- [Security Scanner Patterns](#security-scanner-patterns)
- [Anomaly Detection](#anomaly-detection)
- [API Reference](#api-reference)
- [Deployment](#deployment)
- [Honest Limitations](#honest-limitations)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (Browser)                           │
│  Next.js 14 · Tailwind CSS · shadcn/ui · Recharts · Firebase SDK       │
└─────────────────────┬──────────────────────┬───────────────────────────┘
                      │ REST API             │ Firebase Realtime DB
                      │ (JWT auth)           │ (real-time notifications)
         ┌────────────▼──────────────────────▼──────────────────────────┐
         │                     BACKEND (Node.js/Express)                 │
         │                                                               │
         │  Auth middleware → verifies Firebase JWT on every request     │
         │                                                               │
         │  Routes:                                                       │
         │  /files        File management (upload, download, rename…)   │
         │  /share        Share link creation & public resolution        │
         │  /scan         Credential scanner + infra misconfiguration    │
         │  /audit        Audit log with filters                         │
         │  /notifications  Notification history + mark-read            │
         │  /anomalies    Anomaly events + acknowledge                   │
         │  /analytics    Storage, breakdown, activity, top files        │
         │                                                               │
         │  Background jobs (node-cron):                                 │
         │  - Hourly:   Recompute access baselines per user              │
         │  - Nightly:  Hard-delete soft-deleted files after 7 days      │
         │  - 15min:    Expire share links past their expiry date        │
         │  - 6-hourly: Reconcile storage_used_bytes                     │
         └──────┬──────────────┬───────────────┬────────────────────────┘
                │              │               │
    ┌───────────▼──┐  ┌────────▼──────┐  ┌────▼───────────────────────┐
    │ PostgreSQL   │  │   AWS S3       │  │   Firebase Admin SDK       │
    │              │  │               │  │                             │
    │ users        │  │ Presigned PUT  │  │ Auth token verification     │
    │ files        │  │ Presigned GET  │  │ Realtime DB notifications   │
    │ file_versions│  │ Versioned keys │  │                             │
    │ share_links  │  │ Lifecycle rules│  └─────────────────────────────┘
    │ share_accesses│  └───────────────┘
    │ audit_logs   │
    │ notifications│  ┌───────────────┐
    │ scan_results │  │   SendGrid     │
    │ access_      │  │               │
    │  baselines   │  │ Transactional  │
    │ anomaly_     │  │ emails on:    │
    │  events      │  │ - Share access │
    └──────────────┘  │ - Scan flags  │
                      │ - Anomalies   │
                      └───────────────┘
```

### Seven architectural layers

| Layer | Responsibility |
|---|---|
| **Auth** | Firebase Authentication (email/password + Google OAuth). All backend routes verify Firebase JWTs. |
| **File Management** | Upload via presigned S3 PUT URLs, download via presigned GET URLs, rename (metadata only), soft delete with 7-day retention, full-text search via PostgreSQL `tsvector`. |
| **Sharing** | Token-based share links with expiry, password protection, view/download permission, one-time access, and max access count. |
| **Security Scanning** | Scanner A: regex-based credential/API key detection on text files pre-upload. Scanner B: on-demand AWS infrastructure misconfiguration audit. |
| **Real-time Monitoring** | Firebase Realtime Database listeners push notifications to the frontend instantly — no polling. |
| **Anomaly Detection** | Statistical baseline (mean + stddev of access frequency) per user. Rule-based checks for spikes, new geographies, off-hours access, and brute-force attacks. |
| **Analytics** | PostgreSQL-backed storage time-series, file type breakdown, upload activity heatmap, most accessed files, largest files. |

---

## Feature Overview

### File Management
- Drag-and-drop upload with pre-upload security scan gate
- Presigned URL upload to S3 — backend never handles file bytes
- Grid and list view with quick actions
- Full-text search (PostgreSQL `tsvector`/`tsquery`)
- Soft delete with 7-day trash retention, hard delete via cron job
- File versioning — every re-upload preserves previous versions

### File Versioning
- Each upload creates a new version row in `file_versions`
- Versions stored under `files/{fileId}/v{N}/{fileName}` in S3
- Version history panel: timestamp, size, uploader, download, restore
- Restoring a version creates a new version (non-destructive)

### Advanced Sharing
- Unique token-based links resolved through the backend
- Configurable: expiry date, password, view/download, one-time, max count
- Share management dashboard with access logs
- Public share page at `/share/:token` with preview for images and PDFs

### Security Scanning — Scanner A (Credential Exposure)
See [Security Scanner Patterns](#security-scanner-patterns) for full list.

Pre-upload scan UI shows:
- Pattern name and severity (Critical / High / Medium)
- Line number and redacted matched value
- Risk score (0–100) based on finding severities
- User must explicitly acknowledge before upload proceeds
- Scan results persisted to `scan_results` table

### Security Scanning — Scanner B (Infrastructure Audit)
On-demand AWS infrastructure scan. Credentials are ephemeral — never stored.

Checks:
- Public S3 buckets (ACL + bucket policy)
- Unencrypted S3 buckets (missing default encryption)
- Unrestricted security group inbound rules (ports 22, 3306, 5432, 27017, 6379, 3389)
- CloudTrail logging disabled
- MFA not enabled on root account
- Overly permissive IAM policies (`Action: *`)

Output: risk score (0–100), per-check results with severity and remediation steps.

### Real-Time Notifications
Firebase Realtime Database listeners — notifications appear instantly without polling.

Triggered by:
- Shared file accessed
- Share link revoked/expired/max-access reached
- Security scan flagged an issue
- File restored from trash / version restored
- Storage quota at 80% or 100%
- Anomaly detected

### Audit Log
Filterable by action type, file name, and date range. Every entry includes timestamp, IP address, and user agent. Anomalous entries are visually flagged inline.

### Anomaly Detection
See [Anomaly Detection](#anomaly-detection) for full documentation.

### Analytics Dashboard
- Storage over time (line chart, 90-day window)
- File type breakdown (pie chart: images, video, audio, documents, code, other)
- Upload activity heatmap (GitHub-style, 52-week calendar)
- Most accessed files (ranked by access count)
- Largest files (ranked by size)

---

## Tech Stack

| Area | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Node.js, Express.js |
| Database | PostgreSQL 16 (Supabase or Railway in production) |
| File Storage | AWS S3 (presigned URLs, versioned object keys) |
| Auth | Firebase Authentication (email/password + Google OAuth) |
| Real-time | Firebase Realtime Database |
| Charts | Recharts |
| Email | SendGrid |
| Local Dev | LocalStack (S3 simulation), Docker Compose |
| CI/CD | GitHub Actions, Docker multi-stage builds |
| Hosting | Vercel (frontend), Render/Railway (backend) |

---

## Local Development Setup

### Prerequisites
- Docker and Docker Compose
- Node.js 20+ (for running outside Docker)
- A Firebase project (free tier is fine)

### 1. Clone the repository

```bash
git clone https://github.com/your-username/nimbus.git
cd nimbus
```

### 2. Configure environment variables

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env — add Firebase Admin SDK credentials

# Frontend
cp frontend/.env.local.example frontend/.env.local
# Edit frontend/.env.local — add Firebase web app config
```

### 3. Start everything with Docker Compose

```bash
docker compose up --build
```

This starts:
- PostgreSQL on port 5432
- LocalStack (S3) on port 4566
- Backend API on port 4000
- Frontend on port 3000

LocalStack automatically creates the `nimbus-files` S3 bucket on startup.

### 4. Run database migrations

```bash
docker compose exec backend node src/db/migrate.js
```

Or locally:
```bash
cd backend && DATABASE_URL=postgresql://nimbus:nimbus_dev@localhost:5432/nimbus node src/db/migrate.js
```

### 5. Open the app

Navigate to [http://localhost:3000](http://localhost:3000)

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AWS_ACCESS_KEY_ID` | AWS/LocalStack access key |
| `AWS_SECRET_ACCESS_KEY` | AWS/LocalStack secret key |
| `AWS_REGION` | AWS region (default: `us-east-1`) |
| `S3_BUCKET_NAME` | S3 bucket name (default: `nimbus-files`) |
| `S3_ENDPOINT` | Set to `http://localstack:4566` for local dev |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Firebase Admin SDK service account email |
| `FIREBASE_PRIVATE_KEY` | Firebase Admin SDK private key |
| `FIREBASE_DATABASE_URL` | Firebase Realtime Database URL |
| `SENDGRID_API_KEY` | SendGrid API key for transactional email |
| `APP_URL` | Base URL of the frontend app |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase web app API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | Firebase Realtime Database URL |
| `NEXT_PUBLIC_API_URL` | Backend API URL |

---

## Security Scanner Patterns

The credential scanner (Scanner A) uses 15+ regex patterns:

| Pattern ID | Name | Severity | Pattern |
|---|---|---|---|
| `aws_access_key` | AWS Access Key ID | Critical | `AKIA[0-9A-Z]{16}` |
| `aws_secret_key` | AWS Secret Access Key | Critical | 40-char base64 string near "aws/secret/key" |
| `google_api_key` | Google API Key | High | `AIza[0-9A-Za-z-_]{35}` |
| `github_pat_classic` | GitHub PAT (Classic) | Critical | `ghp_[A-Za-z0-9]{36}` |
| `github_pat_fine` | GitHub Fine-grained PAT | Critical | `github_pat_[A-Za-z0-9_]{82}` |
| `stripe_secret` | Stripe Secret Key | Critical | `sk_live_[0-9a-zA-Z]{24,}` |
| `stripe_publishable` | Stripe Publishable Key | Medium | `pk_live_[0-9a-zA-Z]{24,}` |
| `slack_bot_token` | Slack Bot Token | High | `xoxb-...` |
| `slack_user_token` | Slack User Token | High | `xoxp-...` |
| `slack_webhook` | Slack Incoming Webhook | Medium | `hooks.slack.com/services/...` |
| `rsa_private_key` | RSA/EC/OpenSSH Private Key | Critical | `-----BEGIN ... PRIVATE KEY-----` |
| `sendgrid_key` | SendGrid API Key | High | `SG.[A-Za-z0-9_-]{22}.[A-Za-z0-9_-]{43}` |
| `twilio_key` | Twilio SID / Auth Token | High | `AC[a-z0-9]{32}` |
| `jwt_token` | JSON Web Token | Medium | `eyJ...eyJ...` |
| `db_connection_string` | Database Connection String | Critical | `postgresql://user:pass@host` |
| `firebase_service_account` | Firebase Service Account | Critical | `"type": "service_account"` |
| `generic_secret` | Generic Hardcoded Secret | Medium | `secret=`, `password=`, `api_key=` near long strings |
| `private_key_pem` | PEM Certificate | High | `-----BEGIN CERTIFICATE-----` |
| `heroku_api_key` | Heroku API Key | High | UUID-like string near "heroku" |

**Note:** The scanner uses regex and is subject to false positives — particularly for the generic secret pattern and the AWS secret key pattern (which uses context filtering to reduce noise). The scanner is a first-pass gate, not a guarantee.

---

## Anomaly Detection

The anomaly detection system turns the audit log from a passive record into an active security monitor.

### Baseline Computation

A background cron job (runs hourly) computes a per-user baseline from the last 30 days of audit log data:

```
mean_access_frequency  = average accesses per hour
stddev_access_frequency = standard deviation of hourly access counts
typical_hours_start    = earliest hour in the top-10 most active hours
typical_hours_end      = latest hour in the top-10 most active hours
typical_countries      = distinct countries seen in the last 30 days
```

Baseline computation requires at least 5 hourly data points. New users have no baseline and are subject only to hard-threshold checks.

### Detection Rules

| Alert Type | Trigger | Severity |
|---|---|---|
| **Access frequency spike** | A single file accessed more than `ANOMALY_SPIKE_STDDEV_THRESHOLD` (default: 3.0) standard deviations above the user's baseline in `ANOMALY_SPIKE_WINDOW_MINUTES` (default: 5 minutes). Hard threshold: 50+ accesses if no baseline. | High (Critical if z-score > 5) |
| **New geography** | File or share link accessed from a country not in `typical_countries` (only fires when baseline has ≥1 country). | High |
| **Off-hours access** | Share link accessed at an hour outside `[typical_hours_start, typical_hours_end]` UTC. Only fires for share link accesses, not direct downloads. | Medium |
| **Repeated password failure** | 5+ failed password attempts on a password-protected share link within 10 minutes. | High |

### Thresholds (configurable via environment variables)

```
ANOMALY_SPIKE_STDDEV_THRESHOLD=3.0   # z-score threshold for frequency spike
ANOMALY_SPIKE_WINDOW_MINUTES=5       # window for counting accesses
ANOMALY_FAILED_PASSWORD_ATTEMPTS=5   # threshold for brute-force detection
```

### Limitations

- The baseline requires ~7–30 days of access history per user to be meaningful. New users will not see geography or off-hours alerts until the baseline is established.
- The system uses simple statistical thresholds rather than a trained ML model. It can produce false positives for users with highly variable access patterns.
- Country detection requires an IP-to-country lookup (currently stored as `country_code` in `share_accesses` — a MaxMind GeoIP integration would be needed in production).
- Off-hours detection operates on UTC timestamps. An improvement would be to store the user's timezone and calculate local hours.

---

## API Reference

All endpoints except `/share/:token` and `/share/:token/access` require a Firebase JWT in the `Authorization: Bearer <token>` header.

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/files` | List user's files |
| `GET` | `/files/trash` | List soft-deleted files |
| `GET` | `/files/search?q=` | Full-text search |
| `POST` | `/files/upload` | Initiate upload (returns presigned URL) |
| `POST` | `/files/upload/confirm` | Confirm upload complete |
| `GET` | `/files/:id/download` | Generate presigned download URL |
| `GET` | `/files/:id/preview` | Generate presigned preview URL |
| `PATCH` | `/files/:id/rename` | Rename file (metadata only) |
| `DELETE` | `/files/:id` | Soft delete |
| `POST` | `/files/:id/restore` | Restore from trash |
| `GET` | `/files/:id/versions` | List version history |
| `POST` | `/files/:id/versions/:versionId/restore` | Restore a version |
| `POST` | `/files/:id/share` | Create share link |
| `GET` | `/share/links` | List user's share links |
| `DELETE` | `/share/links/:id` | Revoke share link |
| `GET` | `/share/:token` | Resolve share link (public) |
| `POST` | `/share/:token/access` | Submit password for protected link |
| `POST` | `/scan/credentials` | Run credential scanner |
| `POST` | `/scan/infrastructure` | Run infrastructure scanner |
| `GET` | `/scan/history` | Scan history |
| `GET` | `/audit` | Audit log with filters |
| `GET` | `/notifications` | Notification history |
| `PATCH` | `/notifications/:id/read` | Mark notification read |
| `POST` | `/notifications/read-all` | Mark all read |
| `GET` | `/anomalies` | Anomaly events |
| `PATCH` | `/anomalies/:id/acknowledge` | Acknowledge anomaly |
| `GET` | `/analytics/storage` | Storage over time |
| `GET` | `/analytics/breakdown` | File type breakdown |
| `GET` | `/analytics/activity` | Upload activity heatmap data |
| `GET` | `/analytics/top-files` | Most accessed files |
| `GET` | `/analytics/largest-files` | Largest files |

---

## Deployment

### Frontend → Vercel

```bash
# Install Vercel CLI
npm i -g vercel

cd frontend
vercel

# Set environment variables in Vercel dashboard under Settings → Environment Variables
```

### Backend → Render

1. Create a new **Web Service** on Render, pointing at the `/backend` directory
2. Set build command: `npm ci`
3. Set start command: `node src/index.js`
4. Add all environment variables from `backend/.env.example`
5. Set `NODE_ENV=production`

After deploy, run migrations:
```bash
curl -X POST https://your-backend.onrender.com/health  # verify it's up
# Then trigger: DATABASE_URL=... node src/db/migrate.js
```

### Database → Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **Settings → Database** and copy the connection string (use the "Session mode" URI)
3. Set this as `DATABASE_URL` in your backend environment
4. Run migrations via the Supabase SQL editor or remotely

### File Storage → AWS S3

1. Create an S3 bucket (e.g. `nimbus-files-prod`)
2. Enable **Block all public access** ✓
3. Enable **Default encryption** (AES-256) ✓
4. Create an IAM user with the policy below, generate access keys, and set them in your backend env

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::nimbus-files-prod/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::nimbus-files-prod"
    }
  ]
}
```

---

## Honest Limitations

| Area | Limitation |
|---|---|
| **Credential scanner** | Regex-based — can produce false positives (especially the generic secret pattern). Not a substitute for dedicated secret scanning tools like `truffleHog` or GitHub's secret scanning. |
| **Infrastructure scanner** | Requires user-provided AWS credentials. Only scans the resources visible to those credentials. Does not check all AWS services or all regions simultaneously. |
| **Anomaly detection** | Simple statistical baseline rather than a trained model. Requires 7–30 days of user history per user before geography/off-hours alerts fire. High variance in user access patterns may generate false positives. |
| **Country detection** | The schema stores country codes in `share_accesses.country_code` but the backend does not currently integrate a GeoIP library. This field will be null until a MaxMind/ip-api.com integration is added. |
| **Real-time baseline** | Anomaly checks run inline per access event. The hourly cron recomputes baselines from scratch. High-volume deployments should move baseline computation to a separate queue. |
| **File preview** | Text file preview is limited. Large text files are not streamed — they rely on presigned URLs, which means the browser requests the file directly from S3. |
| **S3 version restore** | The current implementation references the old S3 key in the new version row rather than issuing an `S3 CopyObject` API call. This works for LocalStack but would require the CopyObject implementation for AWS in production. |
| **Multi-tenancy** | Nimbus is designed as a personal storage product. There is no team/organization concept, role-based access control within shared workspaces, or admin panel. |
