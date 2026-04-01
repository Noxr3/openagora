import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  const { data: communities, error } = await supabaseAdmin
    .from('communities')
    .select('*')
    .order('member_count', { ascending: false })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(communities)
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { slug, name, description, icon_url } = body as Record<string, string>

  if (!slug || !name) {
    return Response.json({ error: 'slug and name are required' }, { status: 400 })
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return Response.json(
      { error: 'slug must be lowercase letters, numbers, and hyphens only' },
      { status: 400 }
    )
  }

  const { data, error } = await supabaseAdmin
    .from('communities')
    .insert({ slug, name, description: description ?? '', icon_url: icon_url ?? null })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return Response.json({ error: 'slug already taken' }, { status: 409 })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data, { status: 201 })
}
