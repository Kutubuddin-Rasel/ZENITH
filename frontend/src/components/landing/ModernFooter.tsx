'use client';

import Link from "next/link";
import { Twitter, Github, Linkedin, Send } from "lucide-react";

export default function ModernFooter() {
    return (
        <footer className="relative w-full py-16 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
            <div className="max-w-7xl mx-auto px-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 mb-16">
                    {/* Brand & Newsletter - Takes 2 columns on large screens */}
                    <div className="lg:col-span-2">
                        <Link href="/" className="inline-block mb-6 group">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:scale-105 transition-transform">
                                    <span className="text-white font-bold text-sm">Z</span>
                                </div>
                                <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-neutral-900 to-neutral-600 dark:from-white dark:to-neutral-400">
                                    Zenith PM
                                </span>
                            </div>
                        </Link>
                        <p className="text-neutral-600 dark:text-neutral-400 mb-6 max-w-sm leading-relaxed">
                            The intelligent project management platform for high-velocity engineering teams. Ship faster, together.
                        </p>

                        <div className="max-w-sm">
                            <label className="text-sm font-semibold text-neutral-900 dark:text-white mb-2 block">
                                Subscribe to our newsletter
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="email"
                                    placeholder="Enter your email"
                                    className="flex-1 px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-neutral-400"
                                />
                                <button className="px-4 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg hover:opacity-90 transition-opacity font-medium flex items-center gap-2">
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Product */}
                    <div>
                        <h3 className="font-semibold text-neutral-900 dark:text-white mb-6">Product</h3>
                        <ul className="space-y-4 text-sm">
                            <li><Link href="#features" className="text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Features</Link></li>
                            <li><Link href="#ai" className="text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">AI Smart Setup</Link></li>
                            <li><Link href="/integrations" className="text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Integrations</Link></li>
                            <li><Link href="/changelog" className="text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Changelog</Link></li>
                        </ul>
                    </div>

                    {/* Resources */}
                    <div>
                        <h3 className="font-semibold text-neutral-900 dark:text-white mb-6">Resources</h3>
                        <ul className="space-y-4 text-sm">
                            <li><Link href="/docs" className="text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Documentation</Link></li>
                            <li><Link href="/api" className="text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">API Reference</Link></li>
                            <li><Link href="/blog" className="text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Engineering Blog</Link></li>
                            <li><Link href="/community" className="text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Community</Link></li>
                        </ul>
                    </div>

                    {/* Company */}
                    <div>
                        <h3 className="font-semibold text-neutral-900 dark:text-white mb-6">Company</h3>
                        <ul className="space-y-4 text-sm">
                            <li><Link href="/about" className="text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">About Us</Link></li>
                            <li><Link href="/careers" className="text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Careers</Link></li>
                            <li><Link href="/legal/privacy" className="text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Privacy Policy</Link></li>
                            <li><Link href="/legal/terms" className="text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Terms of Service</Link></li>
                        </ul>
                    </div>
                </div>

                <div className="pt-8 border-t border-neutral-100 dark:border-neutral-800 flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-neutral-500 text-sm">
                        © {new Date().getFullYear()} Zenith. Designd by AntiGravity.
                    </p>
                    <div className="flex gap-6">
                        <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-blue-500 transition-colors">
                            <span className="sr-only">Twitter</span>
                            <Twitter className="h-5 w-5" />
                        </a>
                        <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors">
                            <span className="sr-only">GitHub</span>
                            <Github className="h-5 w-5" />
                        </a>
                        <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-blue-700 transition-colors">
                            <span className="sr-only">LinkedIn</span>
                            <Linkedin className="h-5 w-5" />
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
