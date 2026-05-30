import { useState, useEffect, useCallback } from "react";
import PageShell from "@/components/PageShell";
import StudentBottomNav from "@/components/StudentBottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CalendarIcon, CalendarOff, RotateCcw, CheckCircle2, History, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const StudentLeave = () => {
  const { user } = useUser();
  const [tab, setTab] = useState<"leave" | "return">("leave");
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);

  // Form State
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [reason, setReason] = useState("");

  const fetchRequests = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (data) setRequests(data);
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      fetchRequests();

      // Realtime Listener — filtered to this user only
      const channel = supabase
        .channel('student_leaves_changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'leave_requests', filter: `user_id=eq.${user.id}` },
          () => fetchRequests()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user?.id, fetchRequests]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!date) {
      toast({ title: "Date Required", description: "Please select a date.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const dateString = format(date, "yyyy-MM-dd");

      const typeLabel = tab === "leave" ? "LEAVE" : "RETURN";
      const finalReason = `[${typeLabel}] ${reason}`;

      const { error } = await supabase.from('leave_requests').insert({
        user_id: user.id,
        start_date: dateString,
        end_date: dateString, // Same day for single event record
        reason: finalReason,
        status: 'pending'
      });

      if (error) throw error;

      // Notify Admins of new leave request
      supabase.functions.invoke('send-notification', {
        body: {
          title: `📌 New ${tab.toUpperCase()} Request`,
          body: `${user.name} has submitted a ${tab} request for ${dateString}.`,
          targetRole: 'admin'
        }
      });

      toast({ title: "Request Submitted", description: `Your ${tab} request is pending approval.` });
      setDate(undefined);
      setReason("");
      fetchRequests(); // Refresh history
    } catch (error: any) {
      console.error("Leave request error:", error);
      toast({ title: "Submission Failed", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const [showHistory, setShowHistory] = useState(false);



  return (
    <>
      <PageShell
        title={showHistory ? "Request History" : "Leave/Return"}
        subtitle={showHistory ? "Your past requests" : "Manage your mess availability"}
        action={
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowHistory(!showHistory)}
            className="rounded-full w-10 h-10 bg-secondary/50 hover:bg-secondary"
          >
            {showHistory ? <ArrowLeft className="w-5 h-5" /> : <History className="w-5 h-5" />}
          </Button>
        }
      >
        <div className="pb-24">

          {showHistory ? (
            /* History View */
            <div className="space-y-3">
              {requests.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <History className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p>No history found.</p>
                </div>
              ) : (
                requests.map((r) => {
                  const isReturn = r.reason?.startsWith("[RETURN]");
                  const displayReason = r.reason ? r.reason.replace(/^\[.*?\]\s*/, "") : "";

                  return (
                    <div key={r.id} className="bg-card rounded-xl border border-border/50 p-4 flex items-center justify-between shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${isReturn ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}>
                          {isReturn ? <RotateCcw className="w-4 h-4" /> : <CalendarOff className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">
                            {isReturn ? "Return" : "Leave"} on {formatDate(r.start_date)}
                          </p>
                          {displayReason && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{displayReason}</p>}
                          <p className="text-[10px] text-muted-foreground mt-1">Submitted: {formatDate(r.created_at)}</p>
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${r.status === "pending"
                          ? "bg-yellow-50 text-yellow-600 border-yellow-200"
                          : r.status === "approved"
                            ? "bg-green-50 text-green-600 border-green-200"
                            : "bg-red-50 text-red-600 border-red-200"
                          }`}
                      >
                        {r.status}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* Main Form View */
            <div>
              {/* Tabs */}
              <div className="flex bg-muted rounded-xl p-1 mb-6">
                <button
                  onClick={() => setTab("leave")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${tab === "leave" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                    }`}
                >
                  <CalendarOff className="w-4 h-4" />
                  Leave
                </button>
                <button
                  onClick={() => setTab("return")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${tab === "return" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                    }`}
                >
                  <RotateCcw className="w-4 h-4" />
                  Return
                </button>
              </div>

              {/* Form */}
              <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm mb-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  {tab === "leave" ? <CalendarOff className="w-5 h-5 text-red-500" /> : <RotateCcw className="w-5 h-5 text-green-500" />}
                  {tab === "leave" ? "Apply for Leave" : "Report Return"}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>{tab === "leave" ? "Start Date (Leaving On)" : "Return Date (Joining From)"}</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full justify-start text-left font-normal h-12 rounded-xl border-border/50",
                            !date && "text-muted-foreground"
                          )}
                          type="button" // Prevent form submission
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {date ? format(date, "PPP") : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={date}
                          onSelect={setDate}
                          initialFocus
                          disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>Reason / Note</Label>
                    <Textarea
                      placeholder={tab === "leave" ? "Going home for festival..." : "Bus arrives at 10 AM..."}
                      className="rounded-xl min-h-[80px]"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>

                  <Button type="submit" className="w-full h-12 rounded-xl text-base font-semibold" disabled={loading}>
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (tab === "leave" ? "Submit Leave Request" : "Submit Return Request")}
                  </Button>
                </form>
              </div>
            </div>
          )}

        </div>
      </PageShell>
      <StudentBottomNav />
    </>
  );
};

export default StudentLeave;
