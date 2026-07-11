import { auth } from './firebase';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, 'Not authenticated');
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  skipAuth = false
): Promise<T> {
  const headers = skipAuth
    ? { 'Content-Type': 'application/json', ...(options.headers as Record<string, string>) }
    : { ...(await getAuthHeaders()), ...(options.headers as Record<string, string>) };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

// ─── Files ──────────────────────────────────────────────────────────────────
export const filesApi = {
  list: () => request<{ files: FileRecord[] }>('/files'),
  trash: () => request<{ files: FileRecord[] }>('/files/trash'),
  search: (q: string, mimeType?: string) =>
    request<{ files: FileRecord[] }>(`/files/search?q=${encodeURIComponent(q)}${mimeType ? `&mimeType=${mimeType}` : ''}`),
  initiateUpload: (data: { fileName: string; contentType: string; sizeBytes: number }) =>
    request<{ fileId: string; s3Key: string; uploadUrl: string; versionNumber: number }>('/files/upload', {
      method: 'POST', body: JSON.stringify(data),
    }),
  confirmUpload: (fileId: string, s3Key: string) =>
    request<{ ok: boolean }>('/files/upload/confirm', { method: 'POST', body: JSON.stringify({ fileId, s3Key }) }),
  getDownloadUrl: (fileId: string) =>
    request<{ url: string; fileName: string }>(`/files/${fileId}/download`),
  getPreviewUrl: (fileId: string) =>
    request<{ url: string; mimeType: string }>(`/files/${fileId}/preview`),
  rename: (fileId: string, fileName: string) =>
    request<{ file: FileRecord }>(`/files/${fileId}/rename`, { method: 'PATCH', body: JSON.stringify({ fileName }) }),
  delete: (fileId: string) =>
    request<{ ok: boolean }>(`/files/${fileId}`, { method: 'DELETE' }),
  restore: (fileId: string) =>
    request<{ ok: boolean }>(`/files/${fileId}/restore`, { method: 'POST' }),
  getVersions: (fileId: string) =>
    request<{ versions: FileVersion[] }>(`/files/${fileId}/versions`),
  restoreVersion: (fileId: string, versionId: string) =>
    request<{ ok: boolean; newVersionNumber: number }>(`/files/${fileId}/versions/${versionId}/restore`, { method: 'POST' }),
};

// ─── Share links ─────────────────────────────────────────────────────────────
export const shareApi = {
  create: (fileId: string, config: ShareLinkConfig) =>
    request<{ shareLink: { id: string; token: string }; url: string }>(`/files/${fileId}/share`, {
      method: 'POST', body: JSON.stringify(config),
    }),
  list: () => request<{ links: ShareLink[] }>('/share/links'),
  revoke: (linkId: string) =>
    request<{ ok: boolean }>(`/share/links/${linkId}`, { method: 'DELETE' }),
  resolve: (token: string) =>
    request<ShareResolution>(`/share/${token}`, {}, true),
  submitPassword: (token: string, password: string) =>
    request<ShareResolution>(`/share/${token}/access`, { method: 'POST', body: JSON.stringify({ password }) }, true),
};

// ─── Scanning ────────────────────────────────────────────────────────────────
export const scanApi = {
  scanCredentials: (content: string, fileName: string, fileId?: string) =>
    request<CredentialScanResult>('/scan/credentials', { method: 'POST', body: JSON.stringify({ content, fileName, fileId }) }),
  scanInfrastructure: (creds: { accessKeyId: string; secretAccessKey: string; region: string }) =>
    request<InfrastructureScanResult>('/scan/infrastructure', { method: 'POST', body: JSON.stringify(creds) }),
  history: () => request<{ scans: ScanRecord[] }>('/scan/history'),
};

// ─── Audit ───────────────────────────────────────────────────────────────────
export const auditApi = {
  list: (params: AuditQueryParams) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
    return request<{ logs: AuditLog[]; total: number }>(`/audit?${qs}`);
  },
};

// ─── Notifications ───────────────────────────────────────────────────────────
export const notificationsApi = {
  list: () => request<{ notifications: Notification[]; unreadCount: number }>('/notifications'),
  markRead: (id: string) => request<{ ok: boolean }>(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => request<{ ok: boolean }>('/notifications/read-all', { method: 'POST' }),
};

// ─── Anomalies ───────────────────────────────────────────────────────────────
export const anomaliesApi = {
  list: () => request<{ anomalies: AnomalyEvent[]; activeCount: number }>('/anomalies'),
  acknowledge: (id: string) => request<{ ok: boolean }>(`/anomalies/${id}/acknowledge`, { method: 'PATCH' }),
};

// ─── Analytics ───────────────────────────────────────────────────────────────
export const analyticsApi = {
  storage: () => request<{ series: StoragePoint[]; currentBytes: number; quotaBytes: number }>('/analytics/storage'),
  breakdown: () => request<{ breakdown: FileTypeBreakdown[] }>('/analytics/breakdown'),
  activity: () => request<{ activity: ActivityPoint[] }>('/analytics/activity'),
  topFiles: () => request<{ topFiles: TopFile[] }>('/analytics/top-files'),
  largestFiles: () => request<{ largestFiles: FileRecord[] }>('/analytics/largest-files'),
};

// ─── Types ───────────────────────────────────────────────────────────────────
export interface FileRecord {
  id: string;
  file_name: string;
  current_s3_key: string;
  size_bytes: number;
  mime_type: string;
  uploaded_at: string;
  last_accessed_at: string | null;
  is_shared: boolean;
  version_count?: number;
  active_shares?: number;
  deleted_at?: string;
}

export interface FileVersion {
  id: string;
  version_number: number;
  s3_key: string;
  size_bytes: number;
  uploaded_at: string;
  uploaded_by_name: string;
}

export interface ShareLinkConfig {
  expiresAt?: string | null;
  password?: string | null;
  permission: 'view' | 'download';
  isOneTime?: boolean;
  maxAccessCount?: number | null;
  notifyOnAccess?: boolean;
}

export interface ShareLink {
  id: string;
  token: string;
  file_id: string;
  file_name: string;
  created_at: string;
  expires_at: string | null;
  permission: 'view' | 'download';
  is_one_time: boolean;
  max_access_count: number | null;
  access_count: number;
  is_active: boolean;
  has_password: boolean;
  recent_accesses: Array<{ accessed_at: string; ip_address: string; country: string }> | null;
}

export interface ShareResolution {
  requiresPassword?: boolean;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  permission: 'view' | 'download';
  fileUrl?: string;
  accessCount?: number;
}

export interface CredentialFinding {
  patternId: string;
  patternName: string;
  severity: 'critical' | 'high' | 'medium';
  lineNumber: number;
  linePreview: string;
  matchedValue: string;
  description: string;
}

export interface CredentialScanResult {
  scanId: string;
  shouldScan: boolean;
  findings: CredentialFinding[];
  riskScore: number;
  hasCritical: boolean;
}

export interface InfraCheck {
  checkId: string;
  name: string;
  resource: string;
  severity: string;
  status: 'PASS' | 'FAIL' | 'ERROR';
  description: string;
  remediation: string | null;
}

export interface InfrastructureScanResult {
  riskScore: number;
  checks: InfraCheck[];
  scannedAt: string;
  summary: { total: number; passed: number; failed: number; critical: number; high: number };
}

export interface ScanRecord {
  id: string;
  file_id: string | null;
  scan_type: string;
  risk_score: number;
  scanned_at: string;
  finding_count: number;
}

export interface AuditLog {
  id: string;
  action_type: string;
  file_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  is_anomalous: boolean;
  created_at: string;
}

export interface AuditQueryParams {
  actionType?: string;
  fileId?: string;
  fileName?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  related_file_id: string | null;
  created_at: string;
}

export interface AnomalyEvent {
  id: string;
  anomaly_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  statistical_basis: string;
  is_acknowledged: boolean;
  created_at: string;
  related_file_id: string | null;
  file_name: string | null;
}

export interface StoragePoint { date: string; storageBytes: number; }
export interface FileTypeBreakdown { category: string; file_count: number; total_bytes: number; }
export interface ActivityPoint { date: string; count: number; }
export interface TopFile { id: string; file_name: string; size_bytes: number; mime_type: string; access_count: number; }
