import './globals.css'
import { ReactNode } from 'react'
// Removed Inter from next/font/google since we're using local font
import { AuthProvider } from '../context/AuthContext'
import { ThemeProvider } from '../context/ThemeContext'
import { ToastProvider } from '../context/ToastContext'
import { NotificationsSocketProvider } from '../context/NotificationsSocketProvider'
import CommandPaletteWrapper from '../components/CommandPaletteWrapper'
import ThemeScript from '../components/ThemeScript'
import ClientLayout from '../components/ClientLayout'
import QueryClientWrapper from '../components/QueryClientWrapper'
import { RoleProvider } from '../context/RoleContext'
import { ProgressiveDisclosureProvider } from '../context/ProgressiveDisclosureContext'
import SecurityScript from '../components/SecurityScript'

// No longer using Next.js Inter font

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#3b82f6" />
        <meta name="description" content="Zenith Project Management - Enterprise-grade project management solution" />
        <meta name="robots" content="noindex, nofollow" />
        <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
        <meta httpEquiv="X-Frame-Options" content="DENY" />
        <meta httpEquiv="X-XSS-Protection" content="1; mode=block" />
        <meta httpEquiv="Referrer-Policy" content="strict-origin-when-cross-origin" />
        <meta httpEquiv="Permissions-Policy" content="camera=(), microphone=(), geolocation=()" />
        
        {/* Performance optimizations */}
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />
        <link rel="dns-prefetch" href="//fonts.gstatic.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        
        {/* Icons and manifest */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <link rel="manifest" href="/manifest.json" />
        
        {/* Preload critical resources */}
        <link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        
        {/* Service Worker registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js')
                    .then(function(registration) {
                      console.log('SW registered: ', registration);
                    })
                    .catch(function(registrationError) {
                      console.log('SW registration failed: ', registrationError);
                    });
                });
              }
            `,
          }}
        />
      </head>
      <body className="bg-background text-text dark:bg-background-dark dark:text-text-dark">
        <SecurityScript />
        <ThemeScript />
        <ToastProvider>
          <ThemeProvider>
            <AuthProvider>
              <RoleProvider>
                <ProgressiveDisclosureProvider>
                  <QueryClientWrapper>
                    <NotificationsSocketProvider>
                      <ClientLayout>
                        <CommandPaletteWrapper>
                      {children}
                        </CommandPaletteWrapper>
                      </ClientLayout>
                    </NotificationsSocketProvider>
                  </QueryClientWrapper>
                </ProgressiveDisclosureProvider>
              </RoleProvider>
            </AuthProvider>
          </ThemeProvider>
        </ToastProvider>
      </body>
    </html>
  )
}
