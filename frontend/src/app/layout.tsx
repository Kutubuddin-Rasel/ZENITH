import './globals.css'
import { ReactNode } from 'react'
import { Inter } from 'next/font/google'
import { AuthProvider } from '../context/AuthContext'
import { ThemeProvider } from '../context/ThemeContext'
import { ToastProvider } from '../context/ToastContext'
import { NotificationsSocketProvider } from '../context/NotificationsSocketProvider'
import CommandPaletteWrapper from '../components/CommandPaletteWrapper'
import ThemeScript from '../components/ThemeScript'
import ClientLayout from '../components/ClientLayout'
import QueryClientWrapper from '../components/QueryClientWrapper'
import { RoleProvider } from '../context/RoleContext'

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="bg-background text-text dark:bg-background-dark dark:text-text-dark">
        <ThemeScript />
        <ToastProvider>
          <ThemeProvider>
            <AuthProvider>
              <RoleProvider>
                <QueryClientWrapper>
                  <NotificationsSocketProvider>
                    <ClientLayout>
                      <CommandPaletteWrapper>
                    {children}
                      </CommandPaletteWrapper>
                    </ClientLayout>
                  </NotificationsSocketProvider>
                </QueryClientWrapper>
              </RoleProvider>
            </AuthProvider>
          </ThemeProvider>
        </ToastProvider>
      </body>
    </html>
  )
}
