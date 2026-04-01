import { handleProxyRequest } from '@/lib/gateway/proxyHandler'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  return handleProxyRequest(request, slug)
}
