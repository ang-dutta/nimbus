import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy');
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy HH:mm');
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

export function getFileCategory(mimeType: string): 'image' | 'video' | 'audio' | 'document' | 'code' | 'archive' | 'other' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf') return 'document';
  if (mimeType.startsWith('text/') || ['application/json', 'application/xml', 'application/javascript'].includes(mimeType)) return 'code';
  if (['application/zip', 'application/x-tar', 'application/gzip', 'application/x-7z-compressed'].includes(mimeType)) return 'archive';
  return 'other';
}

export function isPreviewable(mimeType: string): boolean {
  return (
    mimeType.startsWith('image/') ||
    mimeType === 'application/pdf' ||
    mimeType.startsWith('text/') ||
    mimeType === 'application/json'
  );
}

export function getFileIconColor(mimeType: string): string {
  const cat = getFileCategory(mimeType);
  return {
    image: 'text-violet-500',
    video: 'text-pink-500',
    audio: 'text-cyan-500',
    document: 'text-red-500',
    code: 'text-emerald-500',
    archive: 'text-amber-500',
    other: 'text-slate-400',
  }[cat];
}

export function getSeverityClass(severity: string): string {
  return {
    critical: 'severity-critical',
    high: 'severity-high',
    medium: 'severity-medium',
    low: 'severity-low',
    info: 'severity-info',
  }[severity] ?? 'severity-info';
}

export function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max - 1) + '…';
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

/**
 * Upload a file to S3 using a presigned PUT URL.
 * Returns true on success.
 */
export async function uploadToS3(uploadUrl: string, file: File): Promise<boolean> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });
  return res.ok;
}
