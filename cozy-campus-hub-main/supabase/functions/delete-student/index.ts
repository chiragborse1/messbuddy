import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type AdminClient = ReturnType<typeof createClient>

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

        const payload = await readJsonBody(req)
        const studentId = typeof payload.studentId === 'string' ? payload.studentId.trim() : ''

        if (!uuidPattern.test(studentId)) {
            throw new HttpError(400, 'Valid studentId is required')
        }

        const { data: targetProfile, error: targetError } = await adminClient
            .from('profiles')
            .select('id, role')
            .eq('id', studentId)
            .maybeSingle()

        if (targetError) {
            throw new HttpError(500, 'Unable to verify target profile')
        }

        if (!targetProfile) {
            throw new HttpError(404, 'Student profile not found')
        }

        if (targetProfile.role !== 'student') {
            throw new HttpError(403, 'Only student accounts can be deleted')
        }

        const deleted = await deleteStudentData(adminClient, studentId)
        deleted.profile = await deleteRows(adminClient, 'profiles', 'id', studentId, 'Unable to delete profile')
        await deleteAuthUser(adminClient, studentId)

        return jsonResponse({ success: true, deleted }, 200)
    } catch (error) {
        if (!(error instanceof HttpError)) {
            console.error('delete-student failed:', error instanceof Error ? error.message : 'Unknown error')
        }

        const status = error instanceof HttpError ? error.status : 500
        const message = error instanceof Error ? error.message : 'Unable to delete student'
        return jsonResponse({ error: message }, status)
    }
})

async function requireAdmin(
    req: Request,
    supabaseUrl: string,
    anonKey: string,
    adminClient: AdminClient,
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

async function deleteStudentData(adminClient: AdminClient, studentId: string) {
    const deleted: Record<string, number> = {}

    const { data: messageRows, error: messageLookupError } = await adminClient
        .from('messages')
        .select('id, image_url')
        .eq('user_id', studentId)

    if (messageLookupError) {
        throw new HttpError(500, 'Unable to inspect student messages')
    }

    const { data: paymentRows, error: paymentLookupError } = await adminClient
        .from('payments')
        .select('screenshot_url')
        .eq('user_id', studentId)

    if (paymentLookupError) {
        throw new HttpError(500, 'Unable to inspect payment receipts')
    }

    const { data: profileRow } = await adminClient
        .from('profiles')
        .select('photo_url')
        .eq('id', studentId)
        .maybeSingle()

    await removeStorageObjects(adminClient, 'chat_images', (messageRows ?? []).map((row) => row.image_url))
    await removeStorageObjects(adminClient, 'payment_receipts', (paymentRows ?? []).map((row) => row.screenshot_url))
    await removeStorageObjects(adminClient, 'avatars', [profileRow?.photo_url])

    const messageIds = (messageRows ?? []).map((message) => message.id)
    if (messageIds.length > 0) {
        const { error: replyUpdateError } = await adminClient
            .from('messages')
            .update({ reply_to_id: null })
            .in('reply_to_id', messageIds)

        if (replyUpdateError) {
            throw new HttpError(500, 'Unable to detach message replies')
        }
    }

    deleted.payments = await deleteRows(adminClient, 'payments', 'user_id', studentId, 'Unable to delete payments')
    deleted.leave_requests = await deleteRows(adminClient, 'leave_requests', 'user_id', studentId, 'Unable to delete leave requests')
    deleted.votes = await deleteRows(adminClient, 'votes', 'user_id', studentId, 'Unable to delete votes')
    deleted.messages = await deleteRows(adminClient, 'messages', 'user_id', studentId, 'Unable to delete messages')

    return deleted
}

async function removeStorageObjects(
    adminClient: AdminClient,
    bucket: string,
    urls: Array<string | null | undefined>,
) {
    const paths = urls
        .map((url) => extractStoragePath(url, bucket))
        .filter((path): path is string => !!path)

    if (paths.length === 0) return

    const { error } = await adminClient.storage.from(bucket).remove(paths)
    if (error) {
        throw new HttpError(500, `Unable to delete ${bucket} storage objects`)
    }
}

function extractStoragePath(rawUrl: string | null | undefined, bucket: string) {
    const rawValue = rawUrl?.trim()
    if (!rawValue) return null

    if (!/^https?:\/\//i.test(rawValue)) {
        const prefix = `${bucket}/`
        return rawValue.startsWith(prefix) ? rawValue.slice(prefix.length) : rawValue.replace(/^\/+/, '')
    }

    try {
        const url = new URL(rawValue)
        const publicPrefix = `/storage/v1/object/public/${bucket}/`
        const signedPrefix = `/storage/v1/object/sign/${bucket}/`
        const pathPrefix = url.pathname.includes(publicPrefix) ? publicPrefix : signedPrefix
        const index = url.pathname.indexOf(pathPrefix)
        if (index === -1) return null

        return decodeURIComponent(url.pathname.slice(index + pathPrefix.length))
    } catch (_error) {
        return null
    }
}

async function deleteRows(
    adminClient: AdminClient,
    table: string,
    column: string,
    value: string,
    errorMessage: string,
) {
    const { count, error } = await adminClient
        .from(table)
        .delete({ count: 'exact' })
        .eq(column, value)

    if (error) {
        throw new HttpError(500, errorMessage)
    }

    return count ?? 0
}

async function deleteAuthUser(adminClient: AdminClient, userId: string) {
    const { error } = await adminClient.auth.admin.deleteUser(userId)

    if (!error) return

    const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : undefined
    if (status === 404 || /not found/i.test(error.message)) {
        return
    }

    throw new HttpError(500, 'Unable to delete auth user')
}

async function readJsonBody(req: Request) {
    try {
        return await req.json()
    } catch (_error) {
        throw new HttpError(400, 'Invalid JSON body')
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
