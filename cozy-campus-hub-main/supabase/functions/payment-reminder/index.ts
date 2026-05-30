import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Reuse the push notification logic from send-notification for consistency
async function sendPushNotification(supabase: any, authHeader: string, userId: string, title: string, body: string) {
    try {
        await supabase.functions.invoke('send-notification', {
            body: { title, body, userIds: [userId] },
            headers: { Authorization: authHeader },
        });
        return true;
    } catch (e) {
        console.error(`Failed to send push to ${userId}:`, e);
        return false;
    }
}

async function requireAdmin(req: Request, adminClient: any) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const authHeader = req.headers.get('Authorization') ?? ''

    if (!supabaseUrl || !anonKey || !authHeader) {
        throw new Error('Authentication required')
    }

    const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error } = await userClient.auth.getUser()
    if (error || !user) {
        throw new Error('Invalid authentication')
    }

    const { data: profile, error: profileError } = await adminClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profileError || !profile || !['admin', 'developer'].includes(profile.role)) {
        throw new Error('Admin access required')
    }

    return authHeader
}

async function sendReminderEmail(email: string, name: string, daysLeft: number, planEndDate: string) {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) return false

    const formattedDate = new Date(planEndDate).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata'
    })

    const urgencyColor = daysLeft === 1 ? '#ef4444' : daysLeft === 3 ? '#f97316' : '#f59e0b'
    const urgencyText = daysLeft === 1 ? '🚨 Last Day!' : daysLeft === 3 ? '⚠️ 3 Days Left' : '📅 1 Week Left'

    const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family: sans-serif; padding: 20px;">
      <div style="max-width: 480px; margin: 0 auto; border: 1px solid #eee; border-radius: 16px; padding: 24px;">
        <h2 style="color: ${urgencyColor}">${urgencyText}</h2>
        <p>Hi <b>${name}</b>, your mess plan expires on <b>${formattedDate}</b> (${daysLeft} day${daysLeft > 1 ? 's' : ''} left).</p>
        <p>Please renew your membership to continue enjoying your meals.</p>
        <hr/>
        <p style="font-size: 12px; color: #999;">Kanhaiya Mess Automated Reminder</p>
      </div>
    </body>
    </html>
    `

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: 'Kanhaiya Mess <reminders@yourdomain.com>',
            to: email,
            subject: `${urgencyText} — Mess plan expires in ${daysLeft} days`,
            html,
        }),
    })
    return response.ok
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )
        const authHeader = await requireAdmin(req, supabase)

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Fetch active students
        const { data: students, error } = await supabase
            .from('profiles')
            .select('id, name, email, plan_end_date, pending_amount')
            .eq('status', 'active');

        if (error) throw error;

        const results = { push_sent: 0, email_sent: 0, total: students?.length ?? 0 };
        const reminderDays = [7, 3, 1];

        for (const student of students ?? []) {
            // 1. Plan Expiry Checks
            if (student.plan_end_date) {
                const endDate = new Date(student.plan_end_date);
                endDate.setHours(0, 0, 0, 0);
                const daysLeft = Math.round((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                if (reminderDays.includes(daysLeft)) {
                    // Send Email
                    await sendReminderEmail(student.email || '', student.name, daysLeft, student.plan_end_date);
                    results.email_sent++;

                    // Send Push
                    const title = daysLeft === 1 ? "🚨 Plan Expiring Tomorrow!" : `⚠️ Plan Expires in ${daysLeft} days`;
                    const body = `Your mess membership ends on ${new Date(student.plan_end_date).toLocaleDateString()}. Please renew soon!`;
                    await sendPushNotification(supabase, authHeader, student.id, title, body);
                    results.push_sent++;
                }
            }

            // 2. Installment / Pending Balance Checks (Weekly on Mondays or if balance > 500)
            if (student.pending_amount && student.pending_amount > 0) {
                // For now, let's notify if they have more than 0 pending during this daily run
                // We don't want to spam, so maybe only on specific days or importance
                // But user specifically asked for "instalment notifications"
                const title = "💸 Installment Reminder";
                const body = `You have a pending balance of ₹${student.pending_amount}. Please clear your dues at the mess office.`;
                await sendPushNotification(supabase, authHeader, student.id, title, body);
                results.push_sent++;
            }
        }

        return new Response(JSON.stringify({ success: true, results }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
