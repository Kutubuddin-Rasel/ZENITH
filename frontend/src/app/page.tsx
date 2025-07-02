"use client";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { user, token, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && token && user) {
      router.replace("/projects");
    }
  }, [loading, token, user, router]);

  if (loading || (token && !user)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full inline-block" />
      </div>
    );
  }

  if (token && user) return null;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-indigo-500 via-blue-400 to-purple-400 dark:from-gray-900 dark:via-indigo-900 dark:to-purple-900 relative overflow-hidden">
      {/* Animated background shape */}
      <div className="absolute -top-32 -left-32 w-[600px] h-[600px] bg-indigo-300 dark:bg-indigo-800 rounded-full opacity-30 blur-3xl animate-pulse z-0" />
      <header className="w-full flex justify-between items-center px-8 py-6 z-10 relative">
        <div className="flex items-center gap-3">
          <Image src="/file.svg" alt="Zenith PM Logo" width={48} height={48} />
          <span className="text-3xl font-extrabold tracking-tight text-white drop-shadow-lg">Zenith PM</span>
        </div>
        <Link href="/auth/login" className="px-7 py-2 rounded-full bg-white text-indigo-700 font-bold shadow-lg hover:bg-indigo-100 transition text-lg">Login</Link>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 z-10 relative">
        <h1 className="text-6xl sm:text-7xl font-black mb-4 bg-gradient-to-r from-white via-indigo-100 to-purple-200 bg-clip-text text-transparent drop-shadow-xl font-sans">The next generation<br/>project management platform</h1>
        <p className="text-2xl sm:text-3xl text-white/90 dark:text-indigo-100 max-w-2xl mb-10 font-light">Collaborate, plan, and track your work with boards, sprints, epics, releases, and more. Zenith PM is your all-in-one productivity hub for modern teams.</p>
        <div className="flex gap-4 mb-16 justify-center">
          <Link href="/auth/login" className="inline-block px-10 py-4 rounded-full bg-white text-indigo-700 font-bold text-xl shadow-xl hover:bg-indigo-100 transition">Get Started</Link>
          <a href="#features" className="inline-block px-10 py-4 rounded-full border-2 border-white text-white font-bold text-xl shadow-xl hover:bg-white hover:text-indigo-700 transition">Learn More</a>
        </div>
        <section id="features" className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-5xl w-full mb-20 mt-8">
          <div className="bg-white/90 dark:bg-gray-900/80 rounded-2xl p-8 shadow-lg flex flex-col items-center transition-transform hover:-translate-y-2 hover:shadow-2xl">
            <Image src="/window.svg" alt="Boards" width={40} height={40} />
            <h3 className="font-bold text-xl mt-5 mb-2 text-indigo-700 dark:text-indigo-300">Boards & Sprints</h3>
            <p className="text-gray-700 dark:text-gray-300 text-base">Visualize your workflow, manage tasks, and run agile sprints with ease.</p>
          </div>
          <div className="bg-white/90 dark:bg-gray-900/80 rounded-2xl p-8 shadow-lg flex flex-col items-center transition-transform hover:-translate-y-2 hover:shadow-2xl">
            <Image src="/file.svg" alt="Epics" width={40} height={40} />
            <h3 className="font-bold text-xl mt-5 mb-2 text-indigo-700 dark:text-indigo-300">Epics & Releases</h3>
            <p className="text-gray-700 dark:text-gray-300 text-base">Organize work into epics, plan releases, and track progress across teams.</p>
          </div>
          <div className="bg-white/90 dark:bg-gray-900/80 rounded-2xl p-8 shadow-lg flex flex-col items-center transition-transform hover:-translate-y-2 hover:shadow-2xl">
            <Image src="/globe.svg" alt="Collaboration" width={40} height={40} />
            <h3 className="font-bold text-xl mt-5 mb-2 text-indigo-700 dark:text-indigo-300">Real-time Collaboration</h3>
            <p className="text-gray-700 dark:text-gray-300 text-base">Comment, notify, and stay in sync with your team in real time.</p>
          </div>
        </section>

        {/* Feature Spotlight Section */}
        <section className="w-full max-w-6xl mx-auto my-20 p-8 bg-white/80 dark:bg-gray-900/80 rounded-3xl shadow-xl flex flex-col md:flex-row items-center gap-12">
          <div className="w-full md:w-1/2">
            <h2 className="text-4xl font-bold text-indigo-700 dark:text-indigo-300 mb-4">Visualize Your Workflow</h2>
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">Zenith PM&apos;s powerful Kanban boards give you a clear, shared perspective on your team&apos;s work. Drag and drop tasks, create custom columns, and watch your projects move from &quot;To Do&quot; to &quot;Done&quot; in real-time.</p>
            <ul className="space-y-3 text-left">
              <li className="flex items-center gap-3"><span className="text-green-500 font-bold">✓</span> Real-time updates</li>
              <li className="flex items-center gap-3"><span className="text-green-500 font-bold">✓</span> Customizable columns</li>
              <li className="flex items-center gap-3"><span className="text-green-500 font-bold">✓</span> Seamless drag-and-drop</li>
            </ul>
          </div>
          <div className="w-full md:w-1/2 p-4 bg-gray-200 dark:bg-gray-800 rounded-2xl shadow-inner">
             <Image src="/window.svg" alt="Kanban Board Screenshot" width={800} height={600} className="rounded-xl"/>
          </div>
        </section>

        {/* Testimonials Section */}
        <section className="my-20 w-full">
            <h2 className="text-4xl font-bold text-white mb-12 text-center">Loved by Teams Everywhere</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                <div className="bg-white/90 dark:bg-gray-900/80 rounded-2xl p-8 shadow-lg">
                    <p className="text-gray-700 dark:text-gray-300 mb-4">&quot;Zenith PM has revolutionized our workflow. The intuitive design and powerful features make it a must-have for any agile team.&quot;</p>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-indigo-200 flex items-center justify-center font-bold text-indigo-700">JD</div>
                        <div>
                            <h4 className="font-bold">Jane Doe</h4>
                            <p className="text-sm text-gray-500">Project Lead, TechCorp</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white/90 dark:bg-gray-900/80 rounded-2xl p-8 shadow-lg">
                    <p className="text-gray-700 dark:text-gray-300 mb-4">&quot;The best project management tool we&apos;ve ever used. The real-time collaboration features are a game-changer.&quot;</p>
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-purple-200 flex items-center justify-center font-bold text-purple-700">SM</div>
                        <div>
                            <h4 className="font-bold">Sam Mills</h4>
                            <p className="text-sm text-gray-500">Lead Developer, Innovate LLC</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white/90 dark:bg-gray-900/80 rounded-2xl p-8 shadow-lg">
                    <p className="text-gray-700 dark:text-gray-300 mb-4">&quot;From epics to releases, everything is perfectly organized. Our productivity has skyrocketed since we switched to Zenith PM.&quot;</p>
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-blue-200 flex items-center justify-center font-bold text-blue-700">AL</div>
                        <div>
                            <h4 className="font-bold">Alex Lee</h4>
                            <p className="text-sm text-gray-500">Product Manager, Solutions Inc.</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        {/* Pricing Section */}
        <section className="my-20 w-full">
            <h2 className="text-4xl font-bold text-white mb-12 text-center">Choose Your Plan</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                {/* Free Plan */}
                <div className="bg-white/90 dark:bg-gray-900/80 rounded-2xl p-8 shadow-lg border-2 border-transparent transition hover:border-indigo-400">
                    <h3 className="text-2xl font-bold mb-2">Free</h3>
                    <p className="text-gray-500 mb-6">For small teams getting started</p>
                    <p className="text-4xl font-extrabold mb-6">$0<span className="text-lg font-medium">/mo</span></p>
                    <ul className="space-y-3 mb-8 text-left">
                        <li>✓ Up to 5 users</li>
                        <li>✓ Basic board features</li>
                        <li>✓ Community support</li>
                    </ul>
                    <Link href="/auth/register" className="w-full inline-block text-center py-3 rounded-full bg-gray-200 dark:bg-gray-700 font-bold hover:bg-gray-300">Get Started</Link>
                </div>
                {/* Pro Plan (Highlighted) */}
                <div className="bg-indigo-600 text-white rounded-2xl p-8 shadow-2xl border-2 border-indigo-400 scale-105">
                    <h3 className="text-2xl font-bold mb-2">Pro</h3>
                    <p className="text-indigo-200 mb-6">For growing teams that need more power</p>
                    <p className="text-4xl font-extrabold mb-6">$10<span className="text-lg font-medium">/user/mo</span></p>
                    <ul className="space-y-3 mb-8 text-left">
                        <li>✓ Unlimited users</li>
                        <li>✓ Advanced features</li>
                        <li>✓ Epics & Releases</li>
                        <li>✓ Priority support</li>
                    </ul>
                    <Link href="/auth/register" className="w-full inline-block text-center py-3 rounded-full bg-white text-indigo-700 font-bold hover:bg-indigo-100">Choose Pro</Link>
                </div>
                {/* Enterprise Plan */}
                <div className="bg-white/90 dark:bg-gray-900/80 rounded-2xl p-8 shadow-lg border-2 border-transparent transition hover:border-indigo-400">
                    <h3 className="text-2xl font-bold mb-2">Enterprise</h3>
                    <p className="text-gray-500 mb-6">For large organizations with specific needs</p>
                    <p className="text-4xl font-extrabold mb-6">Custom</p>
                    <ul className="space-y-3 mb-8 text-left">
                        <li>✓ All Pro features</li>
                        <li>✓ SAML/SSO Integration</li>
                        <li>✓ Dedicated support</li>
                    </ul>
                    <Link href="/contact" className="w-full inline-block text-center py-3 rounded-full bg-gray-200 dark:bg-gray-700 font-bold hover:bg-gray-300">Contact Us</Link>
                </div>
            </div>
        </section>

      </main>
      <footer className="w-full py-8 flex flex-col items-center text-white/80 dark:text-indigo-200 text-base border-t border-white/20 dark:border-indigo-800 bg-transparent z-10 relative">
        <div className="mb-2">&copy; {new Date().getFullYear()} Zenith PM. All rights reserved.</div>
        <div className="flex gap-6">
          <a href="https://github.com/your-repo" target="_blank" rel="noopener noreferrer" className="hover:underline">GitHub</a>
          <a href="https://nextjs.org" target="_blank" rel="noopener noreferrer" className="hover:underline">Powered by Next.js</a>
          <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="hover:underline">Deployed on Vercel</a>
        </div>
      </footer>
    </div>
  );
}
