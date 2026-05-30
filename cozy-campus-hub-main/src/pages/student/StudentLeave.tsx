import { useState, useEffect, useCallback } from "react";
import PageShell from "@/components/PageShell";
import StudentBottomNav from "@/components/StudentBottomNav";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CalendarIcon, CalendarOff, RotateCcw, History, Loader2, ArrowLeft } from "lucide-react";
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
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);

  // Form State
  const [leaveDate, setLeaveDate] = useState<Date | undefined>(undefined);
  const [returnDate, setReturnDate] = useState<Date | undefined>(undefined);
  const [leavePickerOpen, setLeavePickerOpen] = useState(false);
  const [returnPickerOpen, setReturnPickerOpen] = useState(false);
  const [reason, setReason] = useState("");

  const fetchRequests = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('leave_requests')
      .select('id, user_id, start_date, end_date, reason, status, created_at')
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

  const today = new Date(new Date().setHours(0, 0, 0, 0));

  const toDateOnly = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());

  const isReturnDateInvalid = (dateToCheck: Date) => {
    if (dateToCheck < today) return true;
    if (!leaveDate) return true;
    return toDateOnly(dateToCheck).getTime() <= toDateOnly(leaveDate).getTime();
  };

  const handleLeaveDateSelect = (selected?: Date) => {
    if (!selected) return;

    setLeaveDate(selected);
    if (returnDate && toDateOnly(returnDate).getTime() <= toDateOnly(selected).getTime()) {
      setReturnDate(undefined);
    }
    setLeavePickerOpen(false);
    window.setTimeout(() => setReturnPickerOpen(true), 0);
  };

  const handleReturnDateSelect = (selected?: Date) => {
    if (!selected) return;

    setReturnDate(selected);
    setReturnPickerOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!leaveDate) {
      toast({ title: "Leave Date Required", description: "Please select when you are leaving.", variant: "destructive" });
      return;
    }
    if (!returnDate) {
      toast({ title: "Return Date Required", description: "Please select when you are returning.", variant: "destructive" });
      setReturnPickerOpen(true);
      return;
    }
    if (toDateOnly(returnDate).getTime() <= toDateOnly(leaveDate).getTime()) {
      toast({ title: "Invalid Return Date", description: "Return date must be after the leave date.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const leaveDateString = format(leaveDate, "yyyy-MM-dd");
      const returnDateString = format(returnDate, "yyyy-MM-dd");

      const finalReason = `[LEAVE] ${reason.trim()}`;

      const { data: requestRecord, error } = await supabase.from('leave_requests').insert({
        user_id: user.id,
        start_date: leaveDateString,
        end_date: returnDateString,
        reason: finalReason,
        status: 'pending'
      }).select('id').single();

      if (error) throw error;

      // Notify Admins of new leave request
      supabase.functions.invoke('send-notification', {
        body: {
          eventType: 'leave_request',
          resourceId: requestRecord?.id,
          targetRole: 'admin'
        }
      });

      toast({ title: "Request Submitted", description: "Your leave request is pending approval." });
      setLeaveDate(undefined);
      setReturnDate(undefined);
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
    const [datePart] = dateStr.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    if (!year || !month || !day) return "";
    return new Date(year, month - 1, day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const [showHistory, setShowHistory] = useState(false);



  return (
    <>
      <PageShell
        title={showHistory ? "Request History" : "Leave Request"}
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
                  const isRangeLeave = !isReturn && r.end_date && r.end_date !== r.start_date;
                  const displayReason = r.reason ? r.reason.replace(/^\[.*?\]\s*/, "") : "";

                  return (
                    <div key={r.id} className="bg-card rounded-xl border border-border/50 p-4 flex items-center justify-between shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${isReturn ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}>
                          {isReturn ? <RotateCcw className="w-4 h-4" /> : <CalendarOff className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">
                            {isReturn ? "Return" : "Leave"} {isRangeLeave ? `${formatDate(r.start_date)} - ${formatDate(r.end_date)}` : `on ${formatDate(r.start_date)}`}
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
              {/* Form */}
              <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm mb-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <CalendarOff className="w-5 h-5 text-red-500" />
                  Apply for Leave
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Leave Date</Label>
                      <Popover open={leavePickerOpen} onOpenChange={setLeavePickerOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full justify-start text-left font-normal h-12 rounded-xl border-border/50",
                              !leaveDate && "text-muted-foreground"
                            )}
                            type="button"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {leaveDate ? format(leaveDate, "d MMM") : <span>Pick date</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={leaveDate}
                            onSelect={handleLeaveDateSelect}
                            initialFocus
                            disabled={(date) => date < today}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>Return Date</Label>
                      <Popover open={returnPickerOpen} onOpenChange={setReturnPickerOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full justify-start text-left font-normal h-12 rounded-xl border-border/50",
                              !returnDate && "text-muted-foreground"
                            )}
                            type="button"
                            disabled={!leaveDate}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {returnDate ? format(returnDate, "d MMM") : <span>Pick date</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={returnDate}
                            onSelect={handleReturnDateSelect}
                            initialFocus
                            disabled={isReturnDateInvalid}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                    {!leaveDate
                      ? "Select your leave date first. The return date picker will open automatically."
                      : !returnDate
                        ? "Now select the date you will return to the mess."
                        : `Leave period: ${format(leaveDate, "d MMM yyyy")} to ${format(returnDate, "d MMM yyyy")}`}
                  </div>

                  <div className="space-y-2">
                    <Label>Reason / Note</Label>
                    <Textarea
                      placeholder="Going home for festival..."
                      className="rounded-xl min-h-[80px]"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>

                  {leaveDate && returnDate && (
                    <Button type="submit" className="w-full h-12 rounded-xl text-base font-semibold" disabled={loading}>
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Submit Leave Request"}
                    </Button>
                  )}
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
