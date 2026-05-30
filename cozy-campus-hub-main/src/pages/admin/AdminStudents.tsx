import { useState, useEffect } from "react";
import PageShell from "@/components/PageShell";
import AdminBottomNav from "@/components/AdminBottomNav";
import StatusBadge from "@/components/StatusBadge";
import ConfirmActionDialog from "@/components/ConfirmActionDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, X, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { calculatePlanEndDate, MESS_PLANS } from "@/lib/plans";

const tabs = ["All", "Members", "Non-Members", "Pending", "Approved", "Suspended", "Rejected", "Deleted"];

type StudentConfirmAction =
  | { type: "trash"; studentId: string; studentName?: string }
  | { type: "permanent"; studentId: string; studentName?: string };

// Helper to format date to DD/MM/YYYY (Indian Standard)
const formatDate = (dateString: string) => {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleDateString("en-IN", {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Kolkata'
  });
};

const getFunctionErrorMessage = async (error: any) => {
  if (!error) return "Request failed.";

  try {
    const context = error.context;
    if (context && typeof context.json === "function") {
      const body = await context.json();
      if (body?.error) return body.error;
    }
  } catch {
    // Fall back to the client error message below.
  }

  return error.message || "Request failed.";
};

const AdminStudents = () => {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(initialTab && tabs.includes(initialTab) ? initialTab : "All");
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<StudentConfirmAction | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Drawer State
  const [adjustingStudent, setAdjustingStudent] = useState<any>(null);
  const [adjustmentDays, setAdjustmentDays] = useState(0);
  const [adjustmentPlan, setAdjustmentPlan] = useState("");
  const [adjustmentBalance, setAdjustmentBalance] = useState(0);

  const loadStudents = async (silent = false) => {
    // ... existing loadStudents logic ... (I am replacing too much context if I copy paste all. I will target specific lines)
    if (!silent) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, mobile, college, course, photo_url, role, status, plan, plan_start_date, plan_end_date, pending_amount, requested_plan, requested_plan_start_date, requested_pending_amount, created_at')
        .eq('role', 'student')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setStudents(data || []);
    } catch (error: any) {
      console.error(error);
      if (!silent) toast({ title: "Error loading students", description: error.message, variant: "destructive" });
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // ... useEffect ...

  // New Handler for Drawer
  const handleOpenAdjustment = (student: any) => {
    setAdjustingStudent(student);
    setAdjustmentDays(0);
    setAdjustmentPlan(student.plan || "");
    setAdjustmentBalance(student.pending_amount || 0);
  };

  const confirmAdjustment = async () => {
    if (!adjustingStudent) return;

    // Check if any change has actually been made
    const hasDaysChange = adjustmentDays !== 0;
    const hasPlanChange = adjustmentPlan !== adjustingStudent.plan;
    const hasBalanceChange = adjustmentBalance !== (adjustingStudent.pending_amount || 0);

    if (!hasDaysChange && !hasPlanChange && !hasBalanceChange) {
      toast({ title: "No changes detected", description: "You haven't adjusted any values." });
      return;
    }

    // Use today as the base if there's no existing plan_end_date
    const baseDate = adjustingStudent.plan_end_date
      ? new Date(adjustingStudent.plan_end_date)
      : new Date();
    baseDate.setDate(baseDate.getDate() + adjustmentDays);

    // If the resulting date is in the future, make student active; otherwise keep current status
    // Or if they just bought a new plan and days > 0
    const newStatus = baseDate > new Date() ? 'active' : adjustingStudent.status;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          plan_end_date: baseDate.toISOString(),
          status: newStatus,
          plan: adjustmentPlan || null,
          pending_amount: adjustmentBalance
        })
        .eq('id', adjustingStudent.id);

      if (error) throw error;

      toast({
        title: "Plan Updated Successfully",
        description: `Plan: ${adjustmentPlan || 'None'}, Days adjusted: ${adjustmentDays > 0 ? '+' : ''}${adjustmentDays}, Base changed to ₹${adjustmentBalance}`
      });

      setAdjustingStudent(null); // Close drawer
      loadStudents();
    } catch (error: any) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    }
  };

  // ... keep other handlers ... (handleApprove etc)


  useEffect(() => {
    loadStudents();

    // Listen for new student signups or status changes
    const channel = supabase
      .channel('admin_students_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => loadStudents(true) // Silent update
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleApprove = async (student: any) => {
    try {
      const hasRequest = student.requested_plan && student.requested_plan_start_date && student.requested_plan_start_date.length > 5;

      let planEndDate = null;
      if (hasRequest) {
        const startDate = new Date(student.requested_plan_start_date);
        planEndDate = calculatePlanEndDate(startDate, student.requested_plan);
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          status: hasRequest ? 'active' : 'approved',
          plan: hasRequest ? student.requested_plan : null,
          plan_start_date: hasRequest ? student.requested_plan_start_date : null,
          plan_end_date: hasRequest ? planEndDate?.toISOString() : null,
          pending_amount: hasRequest ? (Number(student.requested_pending_amount) || 0) : 0
        })
        .eq('id', student.id);

      if (error) throw error;

      // Notify the student
      supabase.functions.invoke('send-notification', {
        body: {
          title: "🎉 Account Approved!",
          body: "Your Kanhaiya Mess account is now active. You can now access all features!",
          userIds: [student.id]
        }
      });

      toast({
        title: "Student Approved",
        description: "The student account has been approved.",
      });
      loadStudents();
    } catch (error: any) {
      toast({ title: "Action failed", description: error.message, variant: "destructive" });
    }
  };

  const handleReactivate = async (studentId: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: 'active' })
        .eq('id', studentId);

      if (error) throw error;

      toast({ title: "Account Reactivated", description: "Student access restored." });

      // Notify Student
      supabase.functions.invoke('send-notification', {
        body: {
          title: "🔓 Account Reactivated!",
          body: "Your Kanhaiya Mess account has been restored. You can now use the app normally.",
          userIds: [studentId]
        }
      });

      loadStudents();
    } catch (error: any) {
      toast({ title: "Action failed", description: error.message, variant: "destructive" });
    }
  };

  const handleSuspend = async (studentId: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: 'suspended' })
        .eq('id', studentId);

      if (error) throw error;

      toast({ title: "Student Suspended", description: "Access has been revoked.", variant: "destructive" });

      // Notify Student
      supabase.functions.invoke('send-notification', {
        body: {
          title: "🔒 Account Suspended",
          body: "Your mess account access has been revoked. Please contact the administrator.",
          userIds: [studentId]
        }
      });

      loadStudents();
    } catch (error: any) {
      toast({ title: "Action failed", description: error.message, variant: "destructive" });
    }
  };

  const handlePermanentDelete = async (studentId: string) => {
    try {
      const { error } = await supabase.functions.invoke('delete-student', {
        body: { studentId },
      });

      if (error) {
        throw new Error(await getFunctionErrorMessage(error));
      }

      toast({ title: "Permanently Deleted", description: "All student data has been removed successfully." });
      loadStudents();
    } catch (error: any) {
      console.error("Delete error:", error);
      toast({ title: "Delete Failed", description: error.message || "Could not delete student.", variant: "destructive" });
    }
  };

  /* handleAdjustDays replaced by Drawer logic */

  const getDerivedStatus = (s: any) => {
    if (s.status === 'suspended') return 'suspended';
    if (s.status === 'rejected') return 'rejected';
    if (s.status === 'deleted') return 'deleted';
    if (s.status === 'pending') return 'pending';

    // For active/approved (login allowed)
    if (s.status === 'active' || s.status === 'approved') {
      if (s.plan_end_date) {
        const endDate = new Date(s.plan_end_date);
        if (endDate > new Date()) return 'active'; // Has Valid Plan -> Active
        return 'expired'; // Has Expired Plan -> Expired
      }
      return 'approved'; // No Plan -> Approved
    }
    return s.status;
  };

  const handleDelete = async (studentId: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: 'deleted' })
        .eq('id', studentId);

      if (error) throw error;

      toast({ title: "Moved to Trash", description: "Student moved to Deleted tab." });
      loadStudents();
    } catch (error: any) {
      toast({ title: "Action failed", description: error.message, variant: "destructive" });
    }
  };

  const requestDelete = (studentId: string, studentName?: string) => {
    setConfirmAction({ type: "trash", studentId, studentName });
  };

  const requestPermanentDelete = (studentId: string, studentName?: string) => {
    setConfirmAction({ type: "permanent", studentId, studentName });
  };

  const confirmStudentAction = async () => {
    if (!confirmAction) return;

    setConfirmLoading(true);
    try {
      if (confirmAction.type === "trash") {
        await handleDelete(confirmAction.studentId);
      } else {
        await handlePermanentDelete(confirmAction.studentId);
      }
      setConfirmAction(null);
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleReject = async (studentId: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: 'rejected' })
        .eq('id', studentId);

      if (error) throw error;

      toast({
        title: "Student Rejected",
        description: "The student signup has been rejected.",
        variant: "destructive",
      });
      loadStudents();
    } catch (error: any) {
      toast({ title: "Action failed", description: error.message, variant: "destructive" });
    }
  };

  const filtered = students.filter((s) => {
    if (activeTab === "Members") {
      // Active status AND plan_end_date is in the future
      return s.status === "active" && s.plan_end_date && new Date(s.plan_end_date) > new Date();
    }
    if (activeTab === "Non-Members") {
      // Active/Approved status BUT no active plan OR plan expired
      const isActiveUser = s.status === "active" || s.status === "approved";
      const hasActivePlan = s.plan_end_date && new Date(s.plan_end_date) > new Date();
      return isActiveUser && !hasActivePlan;
    }
    if (activeTab === "Pending") return s.status === "pending";
    if (activeTab === "Approved") return s.status === "approved" || s.status === "active";
    if (activeTab === "Rejected") return s.status === "rejected";
    if (activeTab === "Suspended") return s.status === "suspended";
    if (activeTab === "Deleted") return s.status === "deleted";
    return s.status !== "deleted";
  });

  return (
    <>
      <PageShell title="Students" subtitle={`${students.length} total students`}>
        <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${activeTab === tab
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
                }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="space-y-3 pb-20">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No students found in this category</p>
            </div>
          ) : (
            filtered.map((s) => {
              const isExpanded = expandedId === s.id;

              return (
                <div
                  key={s.id}
                  className={`bg-card rounded-2xl border transition-all duration-200 overflow-hidden ${isExpanded ? "border-primary/50 shadow-md ring-1 ring-primary/5" : "border-border/50 shadow-sm"
                    }`}
                >
                  {/* Card Header - Clickable Area */}
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : s.id)}
                    className="p-4 flex items-center gap-4 cursor-pointer hover:bg-muted/30 transition-colors active:bg-muted/50"
                  >
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg overflow-hidden flex-shrink-0 border-2 border-background shadow-sm">
                      {s.photo_url ? (
                        <img src={s.photo_url} alt={s.name} className="w-full h-full object-cover" />
                      ) : (
                        (s.name || '?').charAt(0).toUpperCase()
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-base text-foreground truncate">{s.name}</h3>
                          <p className="text-xs text-muted-foreground truncate max-w-[150px]">{s.college}</p>
                          {(() => {
                            const daysRemaining = (s.status === 'active' && s.plan_end_date && new Date(s.plan_end_date) > new Date())
                              ? Math.ceil((new Date(s.plan_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                              : 0;

                            if (daysRemaining > 0) {
                              return (
                                <p className={`text-[10px] font-bold mt-1 inline-flex items-center px-1.5 py-0.5 rounded-md ${daysRemaining < 5
                                  ? "bg-red-100 text-red-600"
                                  : daysRemaining < 10
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-green-100 text-green-700"
                                  }`}>
                                  {daysRemaining} days left
                                </p>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <StatusBadge status={getDerivedStatus(s)} />
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 bg-muted/10 border-t border-border/50">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 mt-3 text-sm">
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">College</p>
                          <p className="font-medium text-foreground">{s.college || "N/A"}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Course</p>
                          <p className="font-medium text-foreground">{s.course || "N/A"}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Mobile</p>
                          <p className="font-medium text-foreground">{s.mobile || "N/A"}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Email</p>
                          <p className="font-medium text-foreground break-all">{s.email || "N/A"}</p>
                        </div>
                      </div>

                      {/* Membership Verification Block */}
                      {s.status === 'pending' && (
                        <div className={`mt-4 p-3 rounded-xl border ${s.requested_plan ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-border/50"} space-y-3`}>
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Membership Type</p>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${s.requested_plan ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                              {s.requested_plan ? "EXISTING MEMBER" : "NEW STUDENT"}
                            </span>
                          </div>

                          {s.requested_plan ? (
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <p className="text-[10px] text-muted-foreground font-semibold uppercase">Claimed Plan</p>
                                  <p className="font-bold text-foreground">{s.requested_plan}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-muted-foreground font-semibold uppercase">Plan Start Date</p>
                                  <p className="font-bold text-foreground">{formatDate(s.requested_plan_start_date)}</p>
                                </div>
                              </div>

                              {(s.requested_pending_amount || 0) > 0 && (
                                <div className="p-2.5 bg-orange-100/50 border border-orange-200 rounded-lg">
                                  <p className="text-[10px] text-orange-800 font-bold uppercase mb-0.5">Pending Balance to Sync</p>
                                  <p className="text-sm font-black text-orange-950">₹{s.requested_pending_amount}</p>
                                </div>
                              )}

                              <div className="p-2 bg-primary/10 rounded-lg">
                                <p className="text-[10px] text-primary font-medium leading-tight italic">
                                  ✨ Approving will automatically activate this plan and set full access.
                                </p>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[10px] text-muted-foreground italic">
                              This student has no existing membership. Approving will allow them to purchase a new plan.
                            </p>
                          )}
                        </div>
                      )}

                      {/* Active Plan / Adjust Plan Block */}
                      {(s.status === 'active' || s.status === 'approved') && (
                        <div className="mt-4 space-y-0.5">
                          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Active Plan</p>
                          <p className="font-medium text-foreground flex items-center gap-2">
                            <span>
                              {s.plan || 'No Plan'}
                              {(s.plan_start_date || s.plan_end_date) && (
                                <span className="text-muted-foreground font-normal text-xs">
                                  {s.plan_start_date ? ` • Starts ${formatDate(s.plan_start_date)}` : ""}
                                  {s.plan_end_date ? ` • Ends ${formatDate(s.plan_end_date)}` : ""}
                                </span>
                              )}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenAdjustment(s);
                              }}
                              className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold hover:bg-primary/20 transition-colors"
                            >
                              Edit Days
                            </button>
                          </p>
                        </div>
                      )}

                      {/* Action Buttons Block */}
                      <div className="flex gap-3 mt-5 pt-4 border-t border-border/50">
                        {s.status === "pending" ? (
                          <>
                            <Button
                              onClick={(e) => { e.stopPropagation(); handleApprove(s); }}
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white shadow-sm h-9"
                            >
                              <Check className="w-4 h-4 mr-2" />
                              Approve
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={(e) => { e.stopPropagation(); handleReject(s.id); }}
                              className="flex-1 shadow-sm h-9"
                            >
                              <X className="w-4 h-4 mr-2" />
                              Reject
                            </Button>
                          </>
                        ) : s.status === "deleted" ? (
                          <>
                            <Button
                              onClick={(e) => { e.stopPropagation(); handleReactivate(s.id); }}
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white shadow-sm h-9"
                            >
                              <Check className="w-4 h-4 mr-2" />
                              Restore
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={(e) => { e.stopPropagation(); requestPermanentDelete(s.id, s.name); }}
                              className="flex-1 shadow-sm h-9"
                            >
                              <X className="w-4 h-4 mr-2" />
                              Delete Permanently
                            </Button>
                          </>
                        ) : (
                          <>
                            {(s.status === 'active' || s.status === 'approved') ? (
                              <Button
                                variant="destructive"
                                onClick={(e) => { e.stopPropagation(); handleSuspend(s.id); }}
                                className="flex-1 shadow-sm h-9 bg-orange-600 hover:bg-orange-700 text-white"
                              >
                                <X className="w-4 h-4 mr-2" />
                                Suspend
                              </Button>
                            ) : (
                              <Button
                                onClick={(e) => { e.stopPropagation(); handleReactivate(s.id); }}
                                className="flex-1 bg-green-600 hover:bg-green-700 text-white shadow-sm h-9"
                              >
                                <Check className="w-4 h-4 mr-2" />
                                Activate
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              onClick={(e) => { e.stopPropagation(); requestDelete(s.id, s.name); }}
                              className="flex-1 shadow-sm h-9 border-destructive/30 text-destructive hover:bg-destructive/10"
                            >
                              Move to Trash
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </PageShell >
      <AdminBottomNav />

      {/* Adjust Plan Drawer */}
      <Drawer open={!!adjustingStudent} onOpenChange={(open) => !open && setAdjustingStudent(null)}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-sm">
            <DrawerHeader>
              <DrawerTitle>Adjust Plan Duration</DrawerTitle>
              <DrawerDescription>
                Swipe to add or remove days for {adjustingStudent?.name}.
              </DrawerDescription>
            </DrawerHeader>
            <div className="p-4 space-y-4">
              {/* Plan Name Field */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Plan</Label>
                <select
                  className="w-full h-11 rounded-xl border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                  value={adjustmentPlan}
                  onChange={(e) => setAdjustmentPlan(e.target.value)}
                >
                  <option value="">No Plan</option>
                  {MESS_PLANS.map((plan) => (
                    <option key={plan.id} value={plan.label}>
                      {plan.label} (₹{plan.price})
                    </option>
                  ))}
                </select>
              </div>

              {/* Pending Balance Field */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pending Balance (₹)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={adjustmentBalance === 0 ? '' : adjustmentBalance}
                  onChange={(e) => setAdjustmentBalance(e.target.value === '' ? 0 : Number(e.target.value))}
                  className="h-11 rounded-xl font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Adjust Expiry (Days)</Label>
                <div className="flex items-center justify-center space-x-2">
                  <div className={`text-4xl font-bold tracking-tighter ${adjustmentDays === 0 ? 'text-muted-foreground' : (adjustmentDays > 0 ? 'text-primary' : 'text-orange-500')}`}>
                    {adjustmentDays > 0 ? '+' : ''}{adjustmentDays}
                  </div>
                  <div className="text-[0.70rem] uppercase text-muted-foreground mt-3 font-bold">Days</div>
                </div>
              </div>

              <div className="h-[150px] relative flex items-center justify-center overflow-hidden bg-muted/20 rounded-xl border border-border/50">
                {/* Highlight Bar */}
                <div className="absolute w-[80%] h-12 bg-background rounded-lg shadow-sm pointer-events-none z-0 top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 border border-primary/20" />

                {/* Scroll Container */}
                <div
                  className="h-full w-full overflow-y-auto snap-y snap-mandatory py-[76px] z-10 no-scrollbar touch-pan-y"
                  style={{ scrollBehavior: 'smooth' }}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const itemHeight = 48; // h-12 = 3rem = 48px
                    const index = Math.round(el.scrollTop / itemHeight);
                    // Array 0..120. Center is 60.
                    const val = index - 60;
                    if (val !== adjustmentDays) setAdjustmentDays(val);
                  }}
                  ref={(el) => {
                    if (el && adjustingStudent && adjustmentDays === 0 && Math.abs(el.scrollTop - (60 * 48)) > 10) {
                      el.scrollTop = 60 * 48;
                    }
                  }}
                >
                  {Array.from({ length: 121 }).map((_, i) => {
                    const val = i - 60;
                    return (
                      <div
                        key={i}
                        className={`snap-center h-12 flex items-center justify-center text-xl font-medium transition-all duration-100 cursor-pointer ${Math.abs(val - adjustmentDays) < 1 ? "text-primary scale-110 font-bold" : "text-muted-foreground opacity-40 scale-90"}`}
                        onClick={(e) => {
                          // Allow click to select
                          const container = e.currentTarget.parentElement;
                          if (container) container.scrollTop = i * 48;
                        }}
                      >
                        {val === 0 ? "0" : (val > 0 ? `+${val}` : `${val}`)}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <DrawerFooter className="mt-4">
              <Button onClick={confirmAdjustment} className="w-full h-12 text-lg rounded-xl">Confirm Adjustment</Button>
              <DrawerClose asChild>
                <Button variant="outline" className="w-full h-12 rounded-xl">Cancel</Button>
              </DrawerClose>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>

      <ConfirmActionDialog
        open={!!confirmAction}
        onOpenChange={(open) => {
          if (!open && !confirmLoading) setConfirmAction(null);
        }}
        title={confirmAction?.type === "permanent" ? "Delete student permanently?" : "Move student to trash?"}
        description={
          confirmAction?.type === "permanent"
            ? `${confirmAction.studentName || "This student"} and all related account data will be removed. This cannot be undone.`
            : `${confirmAction?.studentName || "This student"} will be moved to the Deleted tab and blocked from login. Their data stays available for restore.`
        }
        confirmLabel={confirmAction?.type === "permanent" ? "Delete Permanently" : "Move to Trash"}
        loading={confirmLoading}
        onConfirm={confirmStudentAction}
      />
    </>
  );
};

export default AdminStudents;
