'use client';
import React, { useRef, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { PaperAirplaneIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { safeLocalStorage } from '@/lib/safe-local-storage';

interface ProjectChatProps {
    projectId: string;
}

interface Message {
    id: string;
    role: 'function' | 'system' | 'user' | 'assistant' | 'data' | 'tool';
    content: string;
}

// Define the shape we expect from useChat to resolve type mismatches
interface ChatHelpers {
    messages: Message[];
    input: string;
    handleInputChange: (e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLTextAreaElement>) => void;
    handleSubmit: (event?: { preventDefault?: () => void }) => void;
    isLoading: boolean;
}

const ProjectChat: React.FC<ProjectChatProps> = ({ projectId }) => {
    const authHeader = `Bearer ${safeLocalStorage.getItem('access_token')}`;

    const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
        api: `/api/projects/${projectId}/chat`,
        headers: {
            Authorization: authHeader,
        },
        body: {
            projectId,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any) as unknown as ChatHelpers;

    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="flex flex-col h-full bg-white dark:bg-neutral-900 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700">
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 rounded-t-lg">
                <div className="flex items-center gap-2">
                    <SparklesIcon className="h-5 w-5 text-purple-500" />
                    <h3 className="font-semibold text-neutral-900 dark:text-white">Chat with Project</h3>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                    Ask questions about documentation, code, or issues.
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px] max-h-[500px]">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center text-neutral-500 space-y-2">
                        <SparklesIcon className="h-10 w-10 text-neutral-300" />
                        <p className="text-sm">Ask anything about this project!</p>
                    </div>
                )}
                {messages.map((m) => (
                    <div
                        key={m.id}
                        className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.role === 'user'
                                ? 'bg-blue-600 text-white rounded-br-none'
                                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white rounded-bl-none'
                                }`}
                        >
                            {m.role !== 'user' && (
                                <p className="text-xs text-purple-500 font-bold mb-1">Zenith AI</p>
                            )}
                            <p className="whitespace-pre-wrap">{m.content}</p>
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-neutral-100 dark:bg-neutral-800 rounded-2xl px-4 py-2 rounded-bl-none">
                            <span className="text-sm text-neutral-500 animate-pulse">Thinking...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="p-4 border-t border-neutral-200 dark:border-neutral-700 pb-6">
                <div className="flex items-center gap-2">
                    <input
                        className="flex-1 px-4 py-2 rounded-full border border-neutral-300 dark:border-neutral-600 
                                 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 
                                 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={input}
                        onChange={handleInputChange}
                        placeholder="Type your question..."
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <PaperAirplaneIcon className="h-5 w-5" />
                    </button>
                </div>
                <div className="mt-2 text-center">
                    <span className="text-[10px] text-neutral-400">AI can make mistakes. Check important info.</span>
                </div>
            </form>
        </div>
    );
};

export default ProjectChat;
