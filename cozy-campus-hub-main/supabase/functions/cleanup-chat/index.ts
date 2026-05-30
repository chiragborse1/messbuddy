import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

class HttpError extends Error {
    status: number

    constructor(status: number, message: string) {
        super(message)
        this.status = status
    }
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return jsonResponse({ ok: true }, 200)
    }

    if (req.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405)
    }

    try {
        const supabaseUrl = getRequiredEnv('SUPABASE_URL')
        const serviceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')
        const anonKey = getRequiredEnv('SUPABASE_ANON_KEY')
        const adminClient = createClient(supabaseUrl, serviceRoleKey)

        await requireAdmin(req, supabaseUrl, anonKey, adminClient)

        const body = await readJsonBody(req)
        const mode = body.mode === 'all' ? 'all' : 'old'
        let query = adminClient
            .from('messages')
            .select('id, image_url')

        if (mode === 'old') {
            const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
            query = query.lt('created_at', cutoff)
        }

        const { data: rows, error: lookupError } = await query
        if (lookupError) throw new HttpError(500, 'Unable to inspect chat messages')

        const messageIds = (rows ?? []).map((row) => row.id)
        if (messageIds.length === 0) {
            return jsonResponse({ success: true, deleted: 0 }, 200)
        }

        await removeStorageObjects(adminClient, (rows ?? []).map((row) => row.image_url))

        const { count, error: deleteError } = await adminClient
            .from('messages')
            .delete({ count: 'exact' })
            .in('id', messageIds)

        if (deleteError) throw new HttpError(500, 'Unable to delete chat messages')

        return jsonResponse({ success: true, deleted: count ?? 0 }, 200)
    } catch (error) {
        if (!(error instanceof HttpError)) {
            console.error('cleanup-chat failed:', error instanceof Error ? error.message : 'Unknown error')
        }

        const status = error instanceof HttpError ? error.status : 500
        const message = error instanceof Error ? error.message : 'Unable to clean chat'
        return jsonResponse({ error: message }, status)
    }
})

async function requireAdmin(
    req: Request,
    supabaseUrl: string,
    anonKey: string,
    adminClient: ReturnType<typeof createClient>,
) {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) {
        throw new HttpError(401, 'Authentication required')
    }

    const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error } = await userClient.auth.getUser()
    if (error || !user) {
        throw new HttpError(401, 'Invalid authentication')
    }

    const { data: profile, error: profileError } = await adminClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profileError || !profile || !['admin', 'developer'].includes(profile.role)) {
        throw new HttpError(403, 'Admin access required')
    }
}

async function removeStorageObjects(
    adminClient: ReturnType<typeof createClient>,
    urls: Array<string | null | undefined>,
) {
    const paths = urls
        .map((url) => extractChatImagePath(url))
        .filter((path): path is string => !!path)

    if (paths.length === 0) return

    const { error } = await adminClient.storage.from('chat_images').remove(paths)
    if (error) {
        throw new HttpError(500, 'Unable to delete chat image objects')
    }
}

function extractChatImagePath(rawUrl: string | null | undefined) {
    if (!rawUrl) return null

    try {
        const url = new URL(rawUrl)
        const publicPrefix = '/storage/v1/object/public/chat_images/'
        const signedPrefix = '/storage/v1/object/sign/chat_images/'
        const pathPrefix = url.pathname.includes(publicPrefix) ? publicPrefix : signedPrefix
        const index = url.pathname.indexOf(pathPrefix)
        if (index === -1) return null

        return decodeURIComponent(url.pathname.slice(index + pathPrefix.length))
    } catch (_error) {
        return null
    }
}

async function readJsonBody(req: Request) {
    try {
        return await req.json()
    } catch (_error) {
        return {}
    }
}

function getRequiredEnv(name: string) {
    const value = Deno.env.get(name)
    if (!value) {
        throw new HttpError(500, 'Server configuration is incomplete')
    }
    return value
}

function jsonResponse(body: Record<string, unknown>, status: number) {
    return new Response(JSON.stringify(body), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status,
    })
}
