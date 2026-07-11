import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { Toaster } from '@/components/ui/toaster';

export const metadata: Metadata = {
  title: 'Nimbus — Secure Cloud Storage',
  description: 'Production-grade secure file storage with real-time security monitoring, anomaly detection, and credential scanning.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
