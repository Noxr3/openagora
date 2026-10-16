import { signedInUser } from '@/lib/oauth/authorize'
import { revokeGrantForUser } from '@/lib/oauth/store'

/**
 * DELETE /api/dashboard/connected-apps/{grantId}
 * The signed-in account disconnects an app it approved: the app's access and
 * refresh tokens stop working at once.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await signedInUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'Not found' }, { status: 404 })
  if (!(await revokeGrantForUser(id, user.id))) return Response.json({ error: 'Not found' }, { status: 404 })
  return new Response(null, { status: 204 })
}
