
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// --- CORS HEADERS ---
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- CONFIG ---
// Wrap in try-catch to avoid immediate crash on start if env is weird
let globalConfigError: string | null = null;
let projectID = "";
let clientEmail = "";
let privateKey = "";

try {
    projectID = Deno.env.get('project_id') || "";
    clientEmail = Deno.env.get('client_email') || "";
    const rawKey = Deno.env.get('private_key') || "";
    privateKey = rawKey.replace(/\\n/g, '\n');
} catch (e: any) {
    globalConfigError = e.message;
}

// --- HELPER: Base64Url Encode ---
function base64UrlEncode(str: string | Uint8Array): string {
    let base64: string;
    if (typeof str === 'string') {
        base64 = btoa(str);
    } else {
        base64 = btoa(String.fromCharCode(...str));
    }
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// --- HELPER: Generate Google Access Token (Native Web Crypto) ---
async function getAccessToken() {
    if (globalConfigError) throw new Error(`Config Error on Start: ${globalConfigError}`);
    if (!clientEmail || !privateKey) {
        throw new Error(`Missing credentials. Email: ${!!clientEmail}, Key: ${!!privateKey}`);
    }

    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 3600; // 1 hour

    const header = { alg: 'RS256', typ: 'JWT' };
    const claimSet = {
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        exp: expiry,
        iat: now
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedClaimSet = base64UrlEncode(JSON.stringify(claimSet));
    const data = `${encodedHeader}.${encodedClaimSet}`;

    // Robust Key Parsing
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";

    // Try to find the key content regardless of newlines or headers
    let pemContents = privateKey;
    if (privateKey.includes("PRIVATE KEY")) {
        pemContents = privateKey.replace(/-----BEGIN PRIVATE KEY-----/g, '')
            .replace(/-----END PRIVATE KEY-----/g, '')
            .replace(/\s/g, '');
    } else {
        // Maybe user provided just the base64 part?
        pemContents = privateKey.replace(/\s/g, '');
    }

    const binaryDerString = atob(pemContents);
    const binaryDer = new Uint8Array(binaryDerString.length);
    for (let i = 0; i < binaryDerString.length; i++) {
        binaryDer[i] = binaryDerString.charCodeAt(i);
    }

    const key = await crypto.subtle.importKey(
        "pkcs8",
        binaryDer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        new TextEncoder().encode(data)
    );

    const encodedSignature = base64UrlEncode(new Uint8Array(signature));
    const jwt = `${data}.${encodedSignature}`;

    // Exchange JWT for Access Token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });

    if (!tokenResponse.ok) {
        const txt = await tokenResponse.text();
        throw new Error(`Google OAuth Failed: ${txt}`);
    }

    const tokenData = await tokenResponse.json();
    return tokenData.access_token;
}


serve(async (req) => {
    // 1. CORS Preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // 2. Simplified Body Logic
        // We default to manual=true if nothing is provided, just to ensure code runs
        let manual = true;
        try {
            const text = await req.text();
            if (text && text.trim().length > 0) {
                const body = JSON.parse(text);
                if (body.manual !== undefined) manual = body.manual;
            }
        } catch (e) { /* ignore parse error */ }

        // 3. Get Token
        const accessToken = await getAccessToken();

        // 4. Fetch Students
        const { data: profiles, error } = await supabaseClient
            .from('profiles')
            .select('id, name, fcm_token, plan_end_date')
            .not('fcm_token', 'is', null)
            .eq('status', 'active');

        if (error) throw new Error(error.message);

        // Filter
        const expiringStudents = profiles.filter(p => {
            if (!p.plan_end_date) return false;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const end = new Date(p.plan_end_date);
            end.setHours(0, 0, 0, 0);
            const days = Math.ceil((end.getTime() - today.getTime()) / (86400000));
            // Just for testing, let's include if days is <= 30 so user sees SOMETHING if no one is expiring in 3 days
            // Wait, let's keep logic strict but log count
            return days > 0 && days <= 3;
        });

        if (expiringStudents.length === 0) {
            return new Response(JSON.stringify({
                success: true,
                sent_count: 0,
                message: "No students expiring in next 3 days."
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 5. Send
        const results = await Promise.all(expiringStudents.map(async (s) => {
            const days = Math.ceil((new Date(s.plan_end_date).getTime() - new Date().getTime()) / 86400000);

            const payload = {
                message: {
                    token: s.fcm_token,
                    notification: {
                        title: "Plan Expiring Soon ⏳",
                        body: `Hi ${s.name}, your plan ends in ${days} days.`
                    },
                    data: { type: "expiry" }
                }
            };

            const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectID}/messages:send`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const json = await res.json();
            if (!res.ok) {
                if (json.error?.details?.[0]?.errorCode === 'UNREGISTERED') {
                    await supabaseClient.from('profiles').update({ fcm_token: null }).eq('id', s.id);
                }
            }
            return { id: s.id, success: res.ok, error: res.ok ? null : json };
        }));

        return new Response(JSON.stringify({
            success: true,
            sent_count: results.filter(r => r.success).length,
            details: results
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (err: any) {
        // CRASH HANDLER: Return JSON error
        const debugInfo = {
            error: "Edge Function Crash",
            message: err.message,
            stack: err.stack,
            config: {
                has_project_id: !!projectID,
                has_client_email: !!clientEmail,
                has_private_key: !!privateKey
            }
        };
        return new Response(JSON.stringify(debugInfo), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 // Force 200 to see error in frontend
        });
    }
});
