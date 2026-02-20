import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Send email via Resend
async function sendReminderEmail(email: string, name: string, daysLeft: number, planEndDate: string) {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
        console.error('RESEND_API_KEY not set')
        return false
    }

    const formattedDate = new Date(planEndDate).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata'
    })

    const urgencyColor = daysLeft === 1 ? '#ef4444' : daysLeft === 3 ? '#f97316' : '#f59e0b'
    const urgencyText = daysLeft === 1 ? '🚨 Last Day!' : daysLeft === 3 ? '⚠️ 3 Days Left' : '📅 1 Week Left'

    const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; margin: 0; padding: 20px;">
      <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
        
        <div style="background: ${urgencyColor}; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 20px;">${urgencyText}</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">Mess Membership Expiring Soon</p>
        </div>

        <div style="padding: 24px;">
          <p style="color: #374151; font-size: 16px;">Hi <strong>${name}</strong>,</p>

          <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 12px; padding: 16px; margin: 16px 0; text-align: center;">
            <p style="margin: 0; color: #92400e; font-size: 14px; font-weight: 500;">Your mess plan expires on</p>
            <p style="margin: 8px 0 0; color: #78350f; font-size: 20px; font-weight: 700;">${formattedDate}</p>
            <p style="margin: 4px 0 0; color: #92400e; font-size: 13px;">That's in <strong>${daysLeft} day${daysLeft > 1 ? 's' : ''}</strong></p>
          </div>

          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            To avoid any disruption to your meals, please contact the mess admin to renew your membership before it expires.
          </p>

          <div style="background: #f3f4f6; border-radius: 12px; padding: 16px; margin-top: 16px;">
            <p style="margin: 0; color: #374151; font-size: 13px; font-weight: 600;">Kanhaiya Mess</p>
            <p style="margin: 4px 0 0; color: #6b7280; font-size: 13px;">Contact your admin to renew your plan.</p>
          </div>
        </div>

        <div style="border-top: 1px solid #f3f4f6; padding: 16px; text-align: center;">
          <p style="margin: 0; color: #9ca3af; font-size: 12px;">This is an automated reminder from Kanhaiya Mess.</p>
        </div>
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
            from: 'Kanhaiya Mess <reminders@yourdomain.com>', // ← Change to your verified Resend domain
            to: email,
            subject: `${urgencyText} — Your mess plan expires in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`,
            html,
        }),
    })

    if (!response.ok) {
        const err = await response.text()
        console.error(`Failed to send email to ${email}:`, err)
        return false
    }

    console.log(`✅ Reminder sent to ${email} (${daysLeft} days left)`)
    return true
}

Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const today = new Date()
        today.setHours(0, 0, 0, 0)

        // Fetch all active students with a plan_end_date
        const { data: students, error } = await supabase
            .from('profiles')
            .select('id, name, email, plan_end_date')
            .eq('status', 'active')
            .not('plan_end_date', 'is', null)

        if (error) throw error

        const results = { sent: 0, skipped: 0, failed: 0, total: students?.length ?? 0 }
        const reminderDays = [7, 3, 1]

        for (const student of students ?? []) {
            const endDate = new Date(student.plan_end_date)
            endDate.setHours(0, 0, 0, 0)

            const daysLeft = Math.round((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

            if (reminderDays.includes(daysLeft)) {
                const sent = await sendReminderEmail(student.email, student.name, daysLeft, student.plan_end_date)
                if (sent) results.sent++
                else results.failed++
            } else {
                results.skipped++
            }
        }

        console.log('Payment reminder run complete:', results)

        return new Response(JSON.stringify({ success: true, results }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    } catch (err) {
        console.error('Edge function error:', err)
        return new Response(JSON.stringify({ error: err.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
