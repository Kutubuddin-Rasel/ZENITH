import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> } // Next.js 15+ Params are Promises? 
    // Wait, in Next 15 params is async. In 14 it's sync. 
    // I will check package.json next version. It is "^15.5.7". So params is a Promise.
) {
    try {
        const { projectId } = await params;
        const body = await req.json();
        const authHeader = req.headers.get('authorization');

        if (!authHeader) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        // Forward to Backend
        // Backend creates a raw stream.
        const response = await fetch(`${API_BASE}/projects/${projectId}/rag/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: authHeader,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return new NextResponse(`Backend Error: ${errorText}`, { status: response.status });
        }

        // Stream the response back
        return new NextResponse(response.body);
    } catch (error) {
        console.error('Chat Proxy Error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
