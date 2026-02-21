import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import * as djwt from "https://deno.land/x/djwt@v2.8/mod.ts"

// 🔥 IMPORTANT: Set your FIREBASE_PROJECT_ID here
const FIREBASE_PROJECT_ID = "cozy-campus"

// 🔥 IMPORTANT: You must set FIREBASE_SERVICE_ACCOUNT_JSON in Supabase Secrets
// Get this from: Firebase Console -> Project Settings -> Service Accounts -> Generate new private key
const GOOGLE_SERVICE_ACCOUNT = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") || "{}")

serve(async (req) => {
    // CORS Headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    }

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { title, body, userIds, topic } = await req.json()

        // 1. Get access token for Firebase v1 API
        // Note: In production, you'd use a JWT library or 'google-auth-library'
        // I am assuming you will set up the secret correctly.
        const accessToken = await getGoogleAccessToken(GOOGLE_SERVICE_ACCOUNT)

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        )

        let tokens: string[] = []

        if (userIds && userIds.length > 0) {
            const { data } = await supabase
                .from("profiles")
                .select("fcm_token")
                .in("id", userIds)
                .not("fcm_token", "is", null)

            tokens = data?.map((p: any) => p.fcm_token) || []
        } else if (topic === "all_students") {
            // Fetch all non-null tokens
            const { data } = await supabase
                .from("profiles")
                .select("fcm_token")
                .not("fcm_token", "is", null)

            tokens = data?.map((p: any) => p.fcm_token) || []
        }

        if (tokens.length === 0) {
            return new Response(JSON.stringify({ success: true, message: "No target tokens found" }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            })
        }

        // 2. Send to Firebase (Batch send would be better, but loop is simpler for now)
        const results = []
        for (const token of tokens) {
            try {
                const res = await fetch(
                    `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${accessToken}`,
                        },
                        body: JSON.stringify({
                            message: {
                                token: token,
                                notification: { title, body },
                                android: {
                                    notification: {
                                        sound: "default",
                                        click_action: "PUSH_RECEIVE",
                                    },
                                },
                            },
                        }),
                    }
                )
                results.push(await res.json())
            } catch (e) {
                results.push({ error: e.message })
            }
        }

        return new Response(JSON.stringify({ success: true, count: tokens.length, results }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        })
    }
})

// Securely getting OAuth2 token for Firebase
async function getGoogleAccessToken(serviceAccount: any) {
    const jwt = await djwt.create(
        { alg: "RS256", typ: "JWT" },
        {
            iss: serviceAccount.client_email,
            sub: serviceAccount.client_email,
            aud: "https://oauth2.googleapis.com/token",
            iat: djwt.getNumericDate(0),
            exp: djwt.getNumericDate(3600),
            scope: "https://www.googleapis.com/auth/cloud-platform",
        },
        await djwt.importJWK(JSON.parse(JSON.stringify(await crypto.subtle.importKey(
            "pkcs8",
            new Uint8Array(atob(serviceAccount.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, "")).split("").map(c => c.charCodeAt(0))),
            { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
            true,
            ["sign"]
        ).then(async (key) => {
            const exported = await crypto.subtle.exportKey("jwk", key);
            return exported;
        }))), "RS256")
    );

    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: jwt,
        }),
    });

    const { access_token } = await res.json();
    return access_token;
}
