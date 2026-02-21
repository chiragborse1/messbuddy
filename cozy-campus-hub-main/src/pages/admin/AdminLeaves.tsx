import { useState, useEffect } from "react";
import PageShell from "@/components/PageShell";
import AdminBottomNav from "@/components/AdminBottomNav";
import { Button } from "@/components/ui/button";
import { Check, X, Calendar, ArrowLeft, Loader2, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

const AdminLeaves = () => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leave_requests')
        .select(`
                    *,
                    profiles (
                        name,
                        photo_url,
                        course
                    )
                `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error: any) {
      console.error("Error fetching leaves:", error);
      if (!silent) toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();

    // Realtime Subscription
    const channel = supabase
      .channel('admin_leaves_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leave_requests' },
        () => {
          fetchRequests(true); // Silent update
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const updateStatus = async (id: number, status: string) => {
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({ status })
        .eq('id', id);

      if (error) throw error;

      // Auto-update on_leave status in profile
      if (status === 'approved') {
        const request = requests.find(r => r.id === id);
        if (request?.reason?.startsWith('[LEAVE]')) {
          await supabase.from('profiles').update({ on_leave: true }).eq('id', request.user_id);
        } else if (request?.reason?.startsWith('[RETURN]')) {
          await supabase.from('profiles').update({ on_leave: false }).eq('id', request.user_id);
        }
      }

      // Logic to extend plan if this is a RETURN approval
      if (status === 'approved') {
        const request = requests.find(r => r.id === id);

        // rudimentary check if it's a return request
        if (request && request.reason && request.reason.startsWith("[RETURN]")) {
          // Find last approved leave
          const { data: lastLeave } = await supabase
            .from('leave_requests')
            .select('*')
            .eq('user_id', request.user_id)
            .ilike('reason', '[LEAVE]%')
            .eq('status', 'approved')
            .lt('created_at', request.created_at)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (lastLeave) {
            const leaveDate = new Date(lastLeave.start_date);
            const returnDate = new Date(request.start_date);
            const diffTime = returnDate.getTime() - leaveDate.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Round up to be generous/safe

            if (diffDays > 0) {
              // Fetch current profile
              const { data: profile } = await supabase
                .from('profiles')
                .select('plan_end_date')
                .eq('id', request.user_id)
                .single();

              if (profile?.plan_end_date) {
                const currentEnd = new Date(profile.plan_end_date);
                currentEnd.setDate(currentEnd.getDate() + diffDays);

                await supabase.from('profiles').update({
                  plan_end_date: currentEnd.toISOString()
                }).eq('id', request.user_id);

                toast({ title: "Plan Extended", description: `Added ${diffDays} days to student plan.` });
              }
            }
          }
        }
      }

      toast({
        title: status === "approved" ? "Request Approved" : "Request Declined",
        description: `The leave request has been ${status}.`,
        variant: status === "approved" ? "default" : "destructive",
      });

      // Notify Student of the decision
      const request = requests.find(r => r.id === id);
      if (request) {
        supabase.functions.invoke('send-notification', {
          body: {
            title: status === "approved" ? "✅ Leave Request Approved" : "❌ Leave Request Declined",
            body: status === "approved"
              ? `Your request for ${formatDate(request.start_date)} has been approved.`
              : `Your request for ${formatDate(request.start_date)} was not approved. Please contact admin.`,
            userIds: [request.user_id]
          }
        });
      }

      // Refresh list
      fetchRequests();
    } catch (error: any) {
      console.error("Update leave error:", error);
      toast({ title: "Action Failed", description: error.message, variant: "destructive" });
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  };

  return (
    <>
      <PageShell>
        <header className="flex items-center gap-3 px-1 pt-12 pb-4">
          <button onClick={() => navigate("/admin")} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <p className="text-sm text-muted-foreground">Admin Panel</p>
            <h1 className="text-xl font-bold">Leave Management</h1>
          </div>
        </header>

        <div className="space-y-3 animate-slide-up pb-20">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No leave requests found</p>
            </div>
          ) : (
            requests.map((r) => (
              <div key={r.id} className="bg-card rounded-2xl border border-border/50 p-4 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                      {r.profiles?.photo_url ? (
                        <img src={r.profiles.photo_url} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-5 h-5 text-primary" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{r.profiles?.name || "Unknown Student"}</p>
                      <div className="flex items-center text-xs text-muted-foreground mt-0.5">
                        <Calendar className="w-3 h-3 mr-1" />
                        {formatDate(r.start_date)} - {formatDate(r.end_date)}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${r.status === "pending"
                      ? "bg-yellow-500/10 text-yellow-600 border border-yellow-500/20"
                      : r.status === "approved"
                        ? "bg-green-500/10 text-green-600 border border-green-500/20"
                        : "bg-red-500/10 text-red-600 border border-red-500/20"
                      }`}
                  >
                    {r.status}
                  </span>
                </div>

                <div className="bg-muted/50 rounded-xl p-3 mb-4 text-sm ml-12">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Reason</span>
                  {r.reason || "No reason provided."}
                </div>

                {r.status === "pending" && (
                  <div className="flex gap-3 ml-12">
                    <Button
                      size="sm"
                      className="flex-1 rounded-xl h-9 bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => updateStatus(r.id, "approved")}
                    >
                      <Check className="w-4 h-4 mr-1.5" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 rounded-xl h-9 border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => updateStatus(r.id, "rejected")}
                    >
                      <X className="w-4 h-4 mr-1.5" /> Decline
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </PageShell>
      <AdminBottomNav />
    </>
  );
};

export default AdminLeaves;
