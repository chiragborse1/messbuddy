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
        console.log("--- Notification Request Start ---");
        const payload: NotificationPayload = await req.json()

        let rawSecret = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON")

        if (!rawSecret) {
            throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON secret.")
        }

        let secretString = rawSecret.trim();

        // --- NEW: AUTOMATIC BASE64 DECODING ---
        // If it doesn't start with '{' but looks like base64, try decoding it
        if (!secretString.startsWith('{')) {
            try {
                console.log("Secret does not start with '{'. Attempting Base64 decode...");
                const decoded = atob(secretString);
                if (decoded.trim().startsWith('{')) {
                    console.log("Successfully decoded Base64 JSON.");
                    secretString = decoded.trim();
                }
            } catch (e) {
                console.log("Not a valid Base64 string or decode failed. Proceeding with raw string.");
            }
        }

        // Final fallback: Strip accidental outer quotes added by shell
        if (secretString.startsWith('"') && secretString.endsWith('"')) {
            secretString = secretString.substring(1, secretString.length - 1).replace(/\\"/g, '"');
        }

        let serviceAccount;
        try {
            serviceAccount = JSON.parse(secretString)
        } catch (e) {
            console.error("JSON Parse Error info:", {
                message: e.message,
                first5: secretString.substring(0, 5),
                last5: secretString.substring(secretString.length - 5)
            });
            throw new Error("Failed to parse Service Account JSON. Position: " + e.message);
        }

        const projectID = serviceAccount.project_id;
        if (!projectID) throw new Error("project_id missing in service account");

        // 1. Get Access Token
        console.log("Fetching Google Access Token...");
        const accessToken = await getGoogleAccessToken(serviceAccount)

        // 2. Send to Firebase
        console.log("Sending to FCM Topic: " + (payload.topic || 'none'));
        const results = [];
        if (payload.topic) {
            const res = await sendToFcm(projectID, accessToken, {
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
                console.error("FCM Error Details:", JSON.stringify(res.error));
                throw new Error("FCM Error: " + (res.error.message || JSON.stringify(res.error)));
            }
        }

        console.log("--- Success ---");
        return new Response(JSON.stringify({ success: true, results }), {
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
