import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import * as djwt from "https://deno.land/x/djwt@v2.8/mod.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface NotificationPayload {
    title: string;
    body: string;
    topic?: string;
    userIds?: string[];
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        console.log("Request received:", req.method);
        const payload: NotificationPayload = await req.json()
        console.log("Payload:", JSON.stringify(payload));

        const FIREBASE_SERVICE_ACCOUNT_JSON = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON")

        if (!FIREBASE_SERVICE_ACCOUNT_JSON) {
            console.error("Missing FIREBASE_SERVICE_ACCOUNT_JSON secret");
            return new Response(JSON.stringify({ error: "Missing FIREBASE_SERVICE_ACCOUNT_JSON secret on Supabase" }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        let serviceAccount;
        try {
            serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON)
        } catch (e) {
            console.error("Failed to parse Service Account JSON:", e.message);
            return new Response(JSON.stringify({ error: "Invalid Service Account JSON format: " + e.message }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        const FIREBASE_PROJECT_ID = serviceAccount.project_id || "cozy-campus";

        // 1. Get Access Token via JWT
        console.log("Generating Google Access Token...");
        let accessToken;
        try {
            accessToken = await getGoogleAccessToken(serviceAccount)
        } catch (e) {
            console.error("Token Generation Error:", e.message);
            return new Response(JSON.stringify({ error: "OAuth Token Failure: " + e.message }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        console.log("Token generated successfully");

        // 2. Send to Firebase
        let results = [];

        if (payload.topic) {
            console.log(`Sending to topic: ${payload.topic}`);
            const res = await sendToFcm(FIREBASE_PROJECT_ID, accessToken, {
                message: {
                    topic: payload.topic,
                    notification: {
                        title: payload.title,
                        body: payload.body,
                    },
                }
            });
            results.push(res);

            if (res.error) {
                return new Response(JSON.stringify({ error: "FCM Error: " + JSON.stringify(res.error) }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }
        }

        return new Response(JSON.stringify({ success: true, results }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error("Global Function Error:", error.message);
        return new Response(JSON.stringify({ error: "System Error: " + error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})

async function getGoogleAccessToken(serviceAccount: any) {
    const iat = Math.floor(Date.now() / 1000)
    const exp = iat + 3600

    const header = { alg: "RS256", typ: "JWT" }
    const claims = {
        iss: serviceAccount.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        exp,
        iat,
    }

    // Import the private key
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    const pemContents = serviceAccount.private_key
        .replace(pemHeader, "")
        .replace(pemFooter, "")
        .replace(/\s/g, "");

    const binaryDerString = atob(pemContents);
    const binaryDer = new Uint8Array(binaryDerString.length);
    for (let i = 0; i < binaryDerString.length; i++) {
        binaryDer[i] = binaryDerString.charCodeAt(i);
    }

    const key = await crypto.subtle.importKey(
        "pkcs8",
        binaryDer,
        {
            name: "RSASSA-PKCS1-v1_5",
            hash: "SHA-256",
        },
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
    if (body.error) {
        throw new Error(body.error_description || body.error)
    }
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
