
'use server';

import { openai } from '@ai-sdk/openai';
import { streamUI } from '@ai-sdk/rsc';
import { z } from 'zod';
import { BrowserSelect } from '@/components/triage/browser-select';
import { LogUploader } from '@/components/triage/log-uploader';

export async function submitQuery(history: unknown[], input: string) {
    'use server';

    const result = await streamUI({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        model: openai('gpt-4-turbo') as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: [...(history as any[]), { role: 'user', content: input }],
        text: ({ content, done }) => {
            if (done) {
                return <div className="p-2 bg-muted/50 rounded-lg">{content}</div>;
            }
            return <div>Loading...</div>;
        },
        tools: {
            askForBrowser: {
                description: 'Ask the user which browser they are using when reporting a web issue.',
                inputSchema: z.object({}),
                generate: async () => {
                    return (
                        <div className="my-2">
                            <BrowserSelect onSelect={(browser) => {
                                // In a real implementation, this would trigger a client-side function
                                // to append "User selected: [Browser]" to the chat history and re-submit.
                                console.log('Browser selected:', browser);
                            }} />
                        </div>
                    );
                },
            },
            askForLogs: {
                description: 'Ask the user to upload error logs when they mention a crash or error.',
                inputSchema: z.object({}),
                generate: async () => {
                    return (
                        <div className="my-2">
                            <LogUploader onUpload={(content) => {
                                console.log('Log uploaded:', content.substring(0, 50) + '...');
                            }} />
                        </div>
                    )
                }
            }
        },
    });

    return result.value;
}
