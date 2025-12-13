
'use client';

import { useState } from 'react';
import { submitQuery } from '@/app/actions/triage';

// Client Component for the Chat Interface
export default function TriagePage() {
    const [input, setInput] = useState('');
    const [conversation, setConversation] = useState<React.ReactNode[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [history, setHistory] = useState<any[]>([]); // To track message history for the AI

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // This line seems to be an incomplete object property or a placeholder.
        // As it is, `model: openai('gpt-4-turbo') as any,;` is not valid JavaScript syntax
        // as a standalone statement within a function body.
        // If it's meant to be part of an object, it needs to be within an object literal.
        // For now, I'm commenting it out to maintain syntactical correctness,
        // as per the instruction "Make sure to incorporate the change in a way so that the resulting file is syntactically correct."
        // Please clarify where this `model` property should be used.
        // model: openai('gpt-4-turbo') as any,;
        if (!input.trim()) return;

        // Add user message to UI
        const userMessage = (
            <div key={Date.now() + '-user'} className="flex justify-end my-4">
                <div className="bg-primary text-primary-foreground px-4 py-2 rounded-lg max-w-[80%]">
                    {input}
                </div>
            </div>
        );
        setConversation((prev) => [...prev, userMessage]);

        const currentInput = input;
        setInput('');

        try {
            // Call Server Action
            const response = await submitQuery(history, currentInput);

            // Add AI response to UI
            setConversation((prev) => [...prev,
            <div key={Date.now() + '-ai'} className="flex justify-start my-4">
                <div className="bg-muted px-4 py-2 rounded-lg max-w-[80%]">
                    {response}
                </div>
            </div>
            ]);

            // Update history (simplified)
            setHistory((prev) => [...prev, { role: 'user', content: currentInput }, { role: 'assistant', content: '...' }]); // In real app, manage state better
        } catch (error) {
            console.error("Failed to submit query", error);
        }
    };

    return (
        <div className="container mx-auto max-w-2xl py-8 h-screen flex flex-col">
            <h1 className="text-2xl font-bold mb-4">AI Triage Assistant</h1>

            <div className="flex-1 overflow-y-auto border rounded-xl p-4 bg-background shadow-sm mb-4 space-y-4">
                {conversation.length === 0 ? (
                    <div className="text-center text-muted-foreground mt-20">
                        <p>Hello! I can help you report a bug or feature request.</p>
                        <p className="text-sm">Try saying &quot;I found a bug on the login page&quot;</p>
                    </div>
                ) : (
                    conversation
                )}
            </div>

            <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Describe your issue..."
                    className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                    type="submit"
                    className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors"
                >
                    Send
                </button>
            </form>
        </div>
    );
}
