"use client";
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // In a real app, you'd handle form submission here (e.g., send to an API endpoint)
    console.log('Form submitted!');
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-indigo-500 via-blue-400 to-purple-400 dark:from-neutral-900 dark:via-indigo-900 dark:to-purple-900 relative">
      <header className="w-full flex justify-between items-center px-8 py-6 z-10 relative">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/file.svg" alt="Zenith PM Logo" width={48} height={48} />
          <span className="text-3xl font-extrabold tracking-tight text-white drop-shadow-lg">Zenith PM</span>
        </Link>
        <Link href="/auth/login" className="px-7 py-2 rounded-full bg-white text-indigo-700 font-bold shadow-lg hover:bg-indigo-100 transition text-lg">Login</Link>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 z-10 relative">
        <div className="bg-white/90 dark:bg-neutral-900/80 rounded-2xl p-8 md:p-12 shadow-2xl max-w-2xl w-full">
          {submitted ? (
            <div>
              <h1 className="text-4xl font-bold text-indigo-700 dark:text-indigo-300 mb-4">Thank You!</h1>
              <p className="text-lg text-neutral-700 dark:text-neutral-300">Your message has been sent. We&apos;ll get back to you as soon as possible.</p>
              <Link href="/" className="inline-block mt-6 px-8 py-3 rounded-full bg-indigo-600 text-white font-bold shadow-lg hover:bg-indigo-700 transition">
                Back to Home
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-4xl font-bold text-indigo-700 dark:text-indigo-300 mb-2">Contact Us</h1>
              <p className="text-lg text-neutral-600 dark:text-neutral-400 mb-8">Have a question about our Enterprise plan or anything else? Let us know!</p>
              <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                <input
                  type="text"
                  placeholder="Your Name"
                  className="w-full px-4 py-3 rounded-lg bg-neutral-100 dark:bg-neutral-800 border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
                <input
                  type="email"
                  placeholder="Your Email"
                  className="w-full px-4 py-3 rounded-lg bg-neutral-100 dark:bg-neutral-800 border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
                <textarea
                  placeholder="Your Message"
                  rows={5}
                  className="w-full px-4 py-3 rounded-lg bg-neutral-100 dark:bg-neutral-800 border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
                <button
                  type="submit"
                  className="w-full py-4 rounded-full bg-indigo-600 text-white font-bold text-lg shadow-lg hover:bg-indigo-700 transition"
                >
                  Send Message
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
} 