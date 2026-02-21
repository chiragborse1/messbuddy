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
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        console.log("--- New Notification Request ---");
        const payload: NotificationPayload = await req.json()
        console.log("Payload:", JSON.stringify(payload));

        const FIREBASE_SERVICE_ACCOUNT_JSON = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON")

        if (!FIREBASE_SERVICE_ACCOUNT_JSON) {
            const err = "ERROR: Missing FIREBASE_SERVICE_ACCOUNT_JSON secret on Supabase dashboard.";
            console.error(err);
            return new Response(JSON.stringify({ error: err }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        let serviceAccount;
        try {
            console.log("Parsing Service Account JSON... (Length: " + FIREBASE_SERVICE_ACCOUNT_JSON.length + ")");
            serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON)
        } catch (e) {
            const err = "ERROR: Failed to parse Service Account JSON. Check if it is a valid JSON. " + e.message;
            console.error(err);
            return new Response(JSON.stringify({ error: err }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        const FIREBASE_PROJECT_ID = serviceAccount.project_id;
        if (!FIREBASE_PROJECT_ID) {
            const err = "ERROR: project_id missing in service account JSON.";
            console.error(err);
            return new Response(JSON.stringify({ error: err }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        // 1. Get Access Token via JWT
        console.log("Step 1: Generating Google Access Token for project: " + FIREBASE_PROJECT_ID);
        let accessToken;
        try {
            accessToken = await getGoogleAccessToken(serviceAccount)
            console.log("Token generated successfully (Starts with: " + accessToken.substring(0, 10) + "...)");
        } catch (e) {
            const err = "Step 1 FAILED (OAuth): " + e.message;
            console.error(err);
            return new Response(JSON.stringify({ error: err }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        // 2. Send to Firebase
        console.log("Step 2: Sending to FCM...");
        let results = [];

        if (payload.topic) {
            console.log(`Target Topic: ${payload.topic}`);
            const res = await sendToFcm(FIREBASE_PROJECT_ID, accessToken, {
                message: {
                    topic: payload.topic,
                    notification: {
                        title: payload.title,
                        body: payload.body,
                    },
                }
            });
            console.log("FCM Response:", JSON.stringify(res));
            results.push(res);

            if (res.error) {
                const err = "Step 2 FAILED (FCM): " + (res.error.message || JSON.stringify(res.error));
                console.error(err);
                return new Response(JSON.stringify({ error: err }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }
        }

        console.log("--- Request Finished Successfully ---");
        return new Response(JSON.stringify({ success: true, results }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error("GLOBAL ERROR:", error.message);
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

    if (!serviceAccount.private_key) throw new Error("private_key missing in service account");

    // Import the private key
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    const pemContents = serviceAccount.private_key
        .replace(pemHeader, "")
        .replace(pemFooter, "")
        .replace(/\s/g, "");

    let binaryDer;
    try {
        const binaryDerString = atob(pemContents);
        binaryDer = new Uint8Array(binaryDerString.length);
        for (let i = 0; i < binaryDerString.length; i++) {
            binaryDer[i] = binaryDerString.charCodeAt(i);
        }
    } catch (e) {
        throw new Error("Failed to decode private key base64: " + e.message);
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
        throw new Error("Google OAuth Error: " + (body.error_description || body.error))
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
