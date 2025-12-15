'use client';

import { ReactLenis } from 'lenis/react';
import ModernHero from "../components/landing/ModernHero";
import AISmartSetup from "../components/landing/AISmartSetup";
import BentoGrid from "../components/landing/BentoGrid";
import ModernFooter from "../components/landing/ModernFooter";
import Link from "next/link";
import Button from "../components/Button";
import LandingAuthWrapper from "../components/landing/LandingAuthWrapper";

export default function Home() {
  return (
    <ReactLenis root>
      <div className="min-h-screen bg-white dark:bg-neutral-950 font-sans text-neutral-900 dark:text-neutral-50 selection:bg-blue-500/30">
        <LandingAuthWrapper />

        {/* Navigation Header - Keeping existing style but cleaner */}
        <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800 transition-all duration-300">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm group-hover:shadow-md transition-all duration-200 group-hover:scale-105">
                <span className="text-white font-semibold text-sm">Z</span>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-neutral-900 to-neutral-700 dark:from-white dark:to-neutral-300 bg-clip-text text-transparent">
                Zenith PM
              </span>
            </Link>
            <div className="flex items-center gap-3">
              <Link href="/auth/login">
                <Button variant="ghost" size="sm" className="font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white">Log in</Button>
              </Link>
              <Link href="/auth/register">
                <Button variant="primary" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20 border-none">Get Started</Button>
              </Link>
            </div>
          </div>
        </header>

        <main>
          <ModernHero />
          <AISmartSetup />
          <BentoGrid />
        </main>

        <ModernFooter />
      </div>
    </ReactLenis>
  );
}
