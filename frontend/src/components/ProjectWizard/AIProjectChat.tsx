'use client';
import React, { useState, useEffect, useRef } from 'react';
import { SparklesIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { CheckIcon } from '@heroicons/react/24/solid';
import Button from '../Button';
import Card from '../Card';
import Spinner from '../Spinner';
import { apiFetch } from '@/lib/fetcher';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

interface ExtractedCriteria {
    projectName: string | null;
    description: string | null;
    projectType: string | null;
    teamSize: string | null;
    workStyle: string | null;
    timeline: string | null;
    keyFeatures: string[];
    // New intelligent fields
    hasExternalStakeholders?: boolean;
    stakeholderType?: string | null;
    industry?: string | null;
    wantsApprovalWorkflow?: boolean;
}

interface TemplateInfo {
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    category: string;
    methodology: string;
}

interface TemplateRecommendation {
    template: TemplateInfo;
    confidence: number;
    reasoning: string;
}

interface AIChatResponse {
    conversationId: string;
    type: 'question' | 'recommendation';
    message?: string;
    extractedCriteria: ExtractedCriteria;
    confidence?: number; // Overall confidence from intelligent mode
    missingCriteria?: string[];
    recommendation?: TemplateRecommendation;
    alternatives?: TemplateRecommendation[];
    suggestedConfig?: {
        sprintLength?: number;
        columns?: string[];
        labels?: string[];
    };
}

interface AIProjectChatProps {
    onTemplateSelected: (
        templateId: string,
        suggestedConfig: Record<string, unknown> | undefined,
        extractedData?: {
            name?: string;
            description?: string;
            teamSize?: string;
            industry?: string;
            methodology?: string;
            timeline?: string;
        }
    ) => void;
    onClose: () => void;
}

const ChatBubble: React.FC<{ message: Message }> = ({ message }) => {
    const isUser = message.role === 'user';

    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
            <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${isUser
                    ? 'bg-blue-600 text-white rounded-br-md'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-md'
                    }`}
            >
                {!isUser && (
                    <div className="flex items-center gap-2 mb-1">
                        <SparklesIcon className="h-4 w-4 text-purple-500" />
                        <span className="text-xs font-medium text-purple-500">AI Assistant</span>
                    </div>
                )}
                <p className={`text-sm whitespace-pre-wrap ${isUser ? 'text-white' : ''}`}>{message.content}</p>
            </div>
        </div>
    );
};

const RecommendationCard: React.FC<{
    recommendation: TemplateRecommendation;
    isSelected: boolean;
    onSelect: () => void;
}> = ({ recommendation, isSelected, onSelect }) => {
    const { template, confidence, reasoning } = recommendation;

    return (
        <Card
            className={`p-4 cursor-pointer transition-all duration-200 border-2 ${isSelected
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'
                }`}
            onClick={onSelect}
        >
            <div className="flex items-start gap-4">
                <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center text-white flex-shrink-0"
                    style={{ backgroundColor: template.color }}
                >
                    <span className="text-xl">{template.icon}</span>
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-gray-900 dark:text-white truncate">
                            {template.name}
                        </h4>
                        <span
                            className={`px-2 py-0.5 text-xs rounded-full flex-shrink-0 ${confidence >= 80
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : confidence >= 60
                                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                }`}
                        >
                            {confidence}% match
                        </span>
                        {isSelected && (
                            <CheckIcon className="h-5 w-5 text-blue-500 flex-shrink-0" />
                        )}
                    </div>

                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                        {reasoning}
                    </p>

                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                            {template.methodology}
                        </span>
                    </div>
                </div>
            </div>
        </Card>
    );
};

const AIProjectChat: React.FC<AIProjectChatProps> = ({ onTemplateSelected, onClose: _onClose }) => {
    void _onClose; // Reserved for future close button integration
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [extractedCriteria, setExtractedCriteria] = useState<ExtractedCriteria | null>(null);
    const [recommendation, setRecommendation] = useState<AIChatResponse | null>(null);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Initial greeting
    useEffect(() => {
        setMessages([
            {
                role: 'assistant',
                content: "Hi! 👋 Tell me about the project you want to create. What are you building?",
                timestamp: new Date(),
            },
        ]);
        // Focus input
        setTimeout(() => inputRef.current?.focus(), 100);
    }, []);

    // Scroll to bottom when messages change, but ONLY if not reading recommendations
    useEffect(() => {
        // Only scroll if we added a new message, not just because recommendation loaded
        // This prevents the "jumping button" issue when recommendation cards appear
        if (messages.length > 0) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]); // Removed 'recommendation' dependency to fix jumpiness

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage: Message = {
            role: 'user',
            content: input.trim(),
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const data = await apiFetch<{ success: boolean; error?: string; data: AIChatResponse }>('/api/project-wizard/ai-chat', {
                method: 'POST',
                body: JSON.stringify({
                    message: userMessage.content,
                    conversationId,
                    extractedCriteria,
                }),
            });

            if (!data.success) {
                throw new Error(data.error || 'AI service unavailable');
            }

            const aiResponse: AIChatResponse = data.data;
            setConversationId(aiResponse.conversationId);
            setExtractedCriteria(aiResponse.extractedCriteria);

            if (aiResponse.type === 'question' && aiResponse.message) {
                // AI is asking for more information
                setMessages((prev) => [
                    ...prev,
                    {
                        role: 'assistant',
                        content: aiResponse.message!,
                        timestamp: new Date(),
                    },
                ]);
            } else if (aiResponse.type === 'recommendation') {
                // AI has a recommendation
                setRecommendation(aiResponse);
                // Use the message from AI if provided, otherwise use default
                const confirmMessage = aiResponse.message ||
                    `Great! Based on what you've told me, I have some recommendations for you. 👇`;
                setMessages((prev) => [
                    ...prev,
                    {
                        role: 'assistant',
                        content: confirmMessage,
                        timestamp: new Date(),
                    },
                ]);
                // Auto-select the primary recommendation
                if (aiResponse.recommendation) {
                    setSelectedTemplateId(aiResponse.recommendation.template.id);
                }
            }
        } catch (error) {
            console.error('AI Chat error:', error);
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: "Sorry, I'm having trouble right now. Please try again or use the template browser.",
                    timestamp: new Date(),
                },
            ]);
        } finally {
            setIsLoading(false);
            inputRef.current?.focus();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const handleTemplateSelect = (templateId: string) => {
        setSelectedTemplateId(templateId);
    };

    const handleConfirmSelection = () => {
        if (selectedTemplateId) {
            onTemplateSelected(selectedTemplateId, recommendation?.suggestedConfig, {
                name: extractedCriteria?.projectName || undefined,
                description: extractedCriteria?.description || undefined,
                teamSize: extractedCriteria?.teamSize || undefined,
                industry: extractedCriteria?.projectType || undefined,
                methodology: extractedCriteria?.workStyle || undefined,
                timeline: extractedCriteria?.timeline || undefined,
            });
        }
    };

    return (
        <div className="flex flex-col h-[500px] max-h-[70vh]">
            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
                {messages.map((msg, idx) => (
                    <ChatBubble key={idx} message={msg} />
                ))}

                {/* Loading indicator */}
                {isLoading && (
                    <div className="flex justify-start mb-4">
                        <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3 rounded-bl-md">
                            <div className="flex items-center gap-2">
                                <Spinner className="h-4 w-4" />
                                <span className="text-sm text-gray-500">Thinking...</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Recommendation Cards */}
                {recommendation && (
                    <div className="mt-4 space-y-3">
                        {/* Primary recommendation */}
                        {recommendation.recommendation && (
                            <div>
                                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                                    <SparklesIcon className="h-3 w-3" />
                                    Top Recommendation
                                </p>
                                <RecommendationCard
                                    recommendation={recommendation.recommendation}
                                    isSelected={selectedTemplateId === recommendation.recommendation.template.id}
                                    onSelect={() => handleTemplateSelect(recommendation.recommendation!.template.id)}
                                />
                            </div>
                        )}

                        {/* Alternatives */}
                        {recommendation.alternatives && recommendation.alternatives.length > 0 && (
                            <div>
                                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                                    Alternatives
                                </p>
                                <div className="space-y-2">
                                    {recommendation.alternatives.map((alt) => (
                                        <RecommendationCard
                                            key={alt.template.id}
                                            recommendation={alt}
                                            isSelected={selectedTemplateId === alt.template.id}
                                            onSelect={() => handleTemplateSelect(alt.template.id)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Confirm button */}
                        <div className="pt-3">
                            <Button
                                variant="primary"
                                className="w-full"
                                onClick={handleConfirmSelection}
                                disabled={!selectedTemplateId}
                            >
                                Use This Template
                            </Button>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            {!recommendation && (
                <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Describe your project..."
                            disabled={isLoading}
                            className="flex-1 px-4 py-2.5 rounded-full border border-gray-300 dark:border-gray-600 
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       placeholder:text-gray-400 disabled:opacity-50"
                        />
                        <button
                            onClick={sendMessage}
                            disabled={!input.trim() || isLoading}
                            className="p-2.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <PaperAirplaneIcon className="h-5 w-5" />
                        </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-2 text-center">
                        Example: &quot;I&apos;m building a mobile app with 3 developers using sprints&quot;
                    </p>
                </div>
            )}
        </div>
    );
};

export default AIProjectChat;
