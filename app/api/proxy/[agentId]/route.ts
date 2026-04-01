import { handleProxyRequest } from '@/lib/gateway/proxyHandler'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params
  return handleProxyRequest(request, agentId)
}
