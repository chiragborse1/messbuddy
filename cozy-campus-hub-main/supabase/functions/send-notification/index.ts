import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import * as djwt from "https://deno.land/x/djwt@v2.8/mod.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface NotificationPayload {
    title?: string;
    body?: string;
    image?: string;
    topic?: string;
    userIds?: string[];
    targetRole?: 'student' | 'admin';
    eventType?: 'student_signup' | 'payment_submitted' | 'leave_request';
    resourceId?: string | number;
}

type Requester = {
    id: string;
    role: string;
    isAdmin: boolean;
}

type SendCounts = {
    sentCount: number;
    successCount: number;
    errorCount: number;
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    let payload: NotificationPayload | null = null
    let requester: Requester | null = null
    let supabase: ReturnType<typeof createClient> | null = null
    let counts: SendCounts = { sentCount: 0, successCount: 0, errorCount: 0 }
    let notificationLogWritten = false
    let shouldWriteNotificationLog = false

    const writeNotificationLog = async () => {
        if (!shouldWriteNotificationLog || !supabase || !requester || !payload || notificationLogWritten) return
        notificationLogWritten = true
        await insertNotificationLog(supabase, requester.id, payload, counts)
    }

    try {
        const notificationPayload = await req.json() as NotificationPayload
        payload = notificationPayload
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

        const adminClient = createClient(supabaseUrl, serviceRoleKey)
        supabase = adminClient
        requester = await getRequester(req, supabaseUrl, anonKey, adminClient)
        const resolvedPayload = await resolveNotificationPayload(notificationPayload, requester, adminClient)
        payload = resolvedPayload
        shouldWriteNotificationLog = true

        if (!requester.isAdmin && resolvedPayload.targetRole !== 'admin') {
            return new Response(JSON.stringify({ error: "Only admins can send student broadcasts." }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 403,
            })
        }

        const rawSecret = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON")
        if (!rawSecret) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON secret.")

        let secretString = rawSecret.trim();
        // Base64 auto-decode
        if (!secretString.startsWith('{')) {
            try {
                const decoded = atob(secretString);
                if (decoded.trim().startsWith('{')) secretString = decoded.trim();
            } catch (e) { /* proceed raw */ }
        }

        // Strip shell quotes
        if (secretString.startsWith('"') && secretString.endsWith('"')) {
            secretString = secretString.substring(1, secretString.length - 1).replace(/\\"/g, '"');
        }

        let serviceAccount;
        try {
            serviceAccount = JSON.parse(secretString)
        } catch (e: any) {
            throw new Error("Failed to parse Service Account JSON: " + (e?.message || "Unknown error"));
        }

        const projectID = serviceAccount.project_id;
        const accessToken = await getGoogleAccessToken(serviceAccount)

        let tokens: string[] = [];

        // Determine targets
        if (resolvedPayload.targetRole) {
            const { data, error } = await adminClient
                .from('profiles')
                .select('fcm_token')
                .eq('role', resolvedPayload.targetRole)
                .not('fcm_token', 'is', null);

            if (error) throw error;
            tokens = data.map((p: any) => p.fcm_token).filter((t: string | null) => !!t);
        } else if (resolvedPayload.topic === "all_students") {
            const { data, error } = await adminClient
                .from('profiles')
                .select('fcm_token')
                .eq('role', 'student')
                .not('fcm_token', 'is', null);

            if (error) throw error;
            tokens = data.map((p: any) => p.fcm_token).filter((t: string | null) => !!t);
        } else if (resolvedPayload.userIds && resolvedPayload.userIds.length > 0) {
            const { data, error } = await adminClient
                .from('profiles')
                .select('fcm_token')
                .in('id', resolvedPayload.userIds)
                .not('fcm_token', 'is', null);

            if (error) throw error;
            tokens = data.map((p: any) => p.fcm_token).filter((t: string | null) => !!t);
        }

        counts.sentCount = tokens.length

        // Send to each token. Do not return or log device tokens.
        for (const token of tokens) {
            try {
                const res = await sendToFcm(projectID, accessToken, {
                    message: {
                        token: token,
                        notification: {
                            title: resolvedPayload.title,
                            body: resolvedPayload.body,
                            ...(resolvedPayload.image ? { image: resolvedPayload.image } : {})
                        },
                    }
                });
                const status = res.error ? 'error' : 'success'
                if (status === 'success') {
                    counts.successCount++
                } else {
                    counts.errorCount++
                }
            } catch (e: any) {
                counts.errorCount++
            }
        }

        await writeNotificationLog()
        return new Response(JSON.stringify({ success: true, count: tokens.length, ...counts }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        if (requester && payload && counts.sentCount === 0 && counts.errorCount === 0) {
            counts.errorCount = 1
        }
        await writeNotificationLog()
        const message = error?.message || "Unknown error"
        console.error("Edge Function Error:", message);
        return new Response(JSON.stringify({ error: message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})

async function getRequester(
    req: Request,
    supabaseUrl: string,
    anonKey: string,
    adminClient: ReturnType<typeof createClient>,
): Promise<Requester> {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader || !anonKey || !supabaseUrl) {
        throw new Error("Authentication required.")
    }

    const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error } = await userClient.auth.getUser()
    if (error || !user) {
        throw new Error("Invalid authentication.")
    }

    const { data: profile, error: profileError } = await adminClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profileError || !profile) {
        throw new Error("Profile not found.")
    }

    const role = profile.role ?? 'student'
    return {
        id: user.id,
        role,
        isAdmin: role === 'admin' || role === 'developer',
    }
}

async function resolveNotificationPayload(
    payload: NotificationPayload,
    requester: Requester,
    adminClient: ReturnType<typeof createClient>,
): Promise<NotificationPayload> {
    if (requester.isAdmin) {
        if (!payload.title?.trim() || !payload.body?.trim()) {
            throw new Error("Notification title and body are required.")
        }
        return payload
    }

    if (payload.targetRole !== 'admin') {
        throw new Error("Only admins can send student broadcasts.")
    }

    if (payload.eventType === 'student_signup') {
        const { data: profile, error } = await adminClient
            .from('profiles')
            .select('name')
            .eq('id', requester.id)
            .eq('role', 'student')
            .single()

        if (error || !profile) throw new Error("Signup profile not found.")

        return {
            title: "New Student Signup!",
            body: `${profile.name || "A student"} has requested to join. Please review for approval.`,
            targetRole: 'admin',
        }
    }

    if (payload.eventType === 'payment_submitted') {
        const paymentId = Number(payload.resourceId)
        if (!Number.isFinite(paymentId)) throw new Error("Valid payment id is required.")

        const { data: payment, error } = await adminClient
            .from('payments')
            .select('amount, plan_name, screenshot_url, profiles:user_id(name)')
            .eq('id', paymentId)
            .eq('user_id', requester.id)
            .single()

        if (error || !payment) throw new Error("Payment submission not found.")

        const profile = Array.isArray(payment.profiles) ? payment.profiles[0] : payment.profiles
        return {
            title: "New Payment Submitted!",
            body: `${profile?.name || "A student"} paid ₹${payment.amount} for ${payment.plan_name}. Please verify receipt.`,
            image: payment.screenshot_url || undefined,
            targetRole: 'admin',
        }
    }

    if (payload.eventType === 'leave_request') {
        const requestId = Number(payload.resourceId)
        if (!Number.isFinite(requestId)) throw new Error("Valid leave request id is required.")

        const { data: request, error } = await adminClient
            .from('leave_requests')
            .select('start_date, end_date, reason, profiles:user_id(name)')
            .eq('id', requestId)
            .eq('user_id', requester.id)
            .single()

        if (error || !request) throw new Error("Leave request not found.")

        const profile = Array.isArray(request.profiles) ? request.profiles[0] : request.profiles
        const isReturn = String(request.reason || "").startsWith("[RETURN]")
        const dateText = request.end_date && request.end_date !== request.start_date
            ? `${request.start_date} to ${request.end_date}`
            : request.start_date
        return {
            title: `New ${isReturn ? "RETURN" : "LEAVE"} Request`,
            body: `${profile?.name || "A student"} submitted a ${isReturn ? "return" : "leave"} request for ${dateText}.`,
            targetRole: 'admin',
        }
    }

    throw new Error("Unsupported admin notification event.")
}

async function insertNotificationLog(
    adminClient: ReturnType<typeof createClient>,
    senderId: string,
    payload: NotificationPayload,
    counts: SendCounts,
) {
    try {
        const { error } = await adminClient
            .from('notification_logs')
            .insert({
                sender_id: senderId,
                title: payload.title ?? '',
                body: payload.body ?? '',
                image: payload.image ?? null,
                target_role: payload.targetRole ?? null,
                topic: payload.topic ?? null,
                user_ids: payload.userIds ?? [],
                sent_count: counts.sentCount,
                success_count: counts.successCount,
                error_count: counts.errorCount,
            })

        if (error) {
            console.error("Notification log insert failed:", error.message)
        }
    } catch (error) {
        console.error("Notification log insert failed:", error instanceof Error ? error.message : "Unknown error")
    }
}

async function getGoogleAccessToken(serviceAccount: any) {
    const header = { alg: "RS256", typ: "JWT" }
    const iat = Math.floor(Date.now() / 1000)
    const exp = iat + 3600
    const claims = {
        iss: serviceAccount.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        exp,
        iat,
    }

    const pemContents = serviceAccount.private_key
        .replace("-----BEGIN PRIVATE KEY-----", "")
        .replace("-----END PRIVATE KEY-----", "")
        .replace(/\s/g, "");

    const binaryDerString = atob(pemContents);
    const binaryDer = new Uint8Array(binaryDerString.length);
    for (let i = 0; i < binaryDerString.length; i++) {
        binaryDer[i] = binaryDerString.charCodeAt(i);
    }

    const key = await crypto.subtle.importKey(
        "pkcs8",
        binaryDer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        true,
        ["sign"]
    );

    const jwt = await djwt.create(header, claims, key)

    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: jwt,
        }),
    })

    const body = await res.json()
    if (body.error) throw new Error("OAuth Error: " + (body.error_description || body.error));
    return body.access_token
}

async function sendToFcm(projectId: string, accessToken: string, message: any) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(message),
    })
    return await res.json()
}
