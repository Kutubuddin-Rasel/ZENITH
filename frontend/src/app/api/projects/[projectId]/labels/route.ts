import { NextRequest } from 'next/server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
  const token = req.headers.get('authorization') || (typeof window !== 'undefined' ? localStorage.getItem('access_token') : null);

  const res = await fetch(`${backendUrl}/projects/${projectId}/labels`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
    credentials: 'include',
  });

  if (!res.ok) {
    return new Response(await res.text(), { status: res.status });
  }
  const data = await res.json();
  return Response.json(data);
} 