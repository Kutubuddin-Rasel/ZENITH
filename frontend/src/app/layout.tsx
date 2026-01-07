import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import AppProviders from '../components/AppProviders';
import { CommandMenu } from '../components/CommandMenu';
import { Toaster } from '@/components/ui/sonner';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Zenith - Project Management',
  description: 'Project management for modern software teams',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <AppProviders>
          {children}
          <CommandMenu />
          <Toaster />
        </AppProviders>
      </body>
    </html>
  );
}
