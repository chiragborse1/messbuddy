import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import * as djwt from "https://deno.land/x/djwt@v2.8/mod.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface NotificationPayload {
    title: string;
    body: string;
    image?: string;
    topic?: string;
    userIds?: string[];
    targetRole?: 'student' | 'admin';
}

type Requester = {
    id: string;
    role: string;
    isAdmin: boolean;
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        console.log("--- Notification Request Start ---");
        const payload: NotificationPayload = await req.json()
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

        const supabase = createClient(supabaseUrl, serviceRoleKey)
        const requester = await getRequester(req, supabaseUrl, anonKey, supabase)
        if (!requester.isAdmin && payload.targetRole !== 'admin') {
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
        if (payload.targetRole) {
            console.log(`Fetching tokens for role: ${payload.targetRole}...`);
            const { data, error } = await supabase
                .from('profiles')
                .select('fcm_token')
                .eq('role', payload.targetRole)
                .not('fcm_token', 'is', null);

            if (error) throw error;
            tokens = data.map((p: any) => p.fcm_token).filter((t: string | null) => !!t);
        } else if (payload.topic === "all_students") {
            console.log("Fetching all student tokens...");
            const { data, error } = await supabase
                .from('profiles')
                .select('fcm_token')
                .eq('role', 'student')
                .not('fcm_token', 'is', null);

            if (error) throw error;
            tokens = data.map((p: any) => p.fcm_token).filter((t: string | null) => !!t);
        } else if (payload.userIds && payload.userIds.length > 0) {
            console.log(`Fetching tokens for ${payload.userIds.length} users...`);
            const { data, error } = await supabase
                .from('profiles')
                .select('fcm_token')
                .in('id', payload.userIds)
                .not('fcm_token', 'is', null);

            if (error) throw error;
            tokens = data.map((p: any) => p.fcm_token).filter((t: string | null) => !!t);
        }

        console.log(`Sending to ${tokens.length} total tokens...`);

        // Send to each token
        const results = [];
        for (const token of tokens) {
            try {
                const res = await sendToFcm(projectID, accessToken, {
                    message: {
                        token: token,
                        notification: {
                            title: payload.title,
                            body: payload.body,
                            ...(payload.image ? { image: payload.image } : {})
                        },
                    }
                });
                results.push({ token, status: res.error ? 'error' : 'success', details: res });
            } catch (e: any) {
                results.push({ token, status: 'error', error: e?.message || "Unknown error" });
            }
        }

        console.log("--- Success ---");
        return new Response(JSON.stringify({ success: true, count: tokens.length, results }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error("Edge Function Error:", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
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
