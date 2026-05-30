import { useCallback, useState, useEffect } from "react";
import PageShell from "@/components/PageShell";
import AdminBottomNav from "@/components/AdminBottomNav";
import ConfirmActionDialog from "@/components/ConfirmActionDialog";
import { Button } from "@/components/ui/button";
import { Check, X, Loader2, ExternalLink, Image as ImageIcon, RotateCcw, Trash2, Plus, Pencil, Eye, EyeOff, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PaymentSwipeCard } from "@/components/PaymentSwipeCard"; // Ensure this path is correct
import { AnimatePresence, motion } from "framer-motion";
import { calculatePaymentPlanUpdate, calculatePaymentRevokeUpdate, MembershipPlanRecord, PlanAudience, PlanDurationType } from "@/lib/plans";

type PaymentConfirmAction =
  | { type: "revoke"; paymentId: number; planName?: string }
  | { type: "delete"; paymentId: number; planName?: string };

type AdminMembershipPlan = MembershipPlanRecord & {
  is_active: boolean;
  sort_order: number | null;
};

type PlanFormState = {
  label: string;
  price: string;
  description: string;
  audience: PlanAudience;
  duration_type: PlanDurationType;
  is_active: boolean;
  sort_order: string;
};

let cachedAdminPayments: any[] | null = null;
let cachedAdminMembershipPlans: AdminMembershipPlan[] | null = null;

const emptyPlanForm: PlanFormState = {
  label: "",
  price: "",
  description: "",
  audience: "boys",
  duration_type: "monthly",
  is_active: true,
  sort_order: "100",
};

const getPaymentPlanDefinition = (payment: any) => {
  if (Array.isArray(payment?.membership_plans)) return payment.membership_plans[0] ?? null;
  return payment?.membership_plans ?? null;
};

const AdminPayments = () => {
  const [payments, setPayments] = useState<any[]>(cachedAdminPayments ?? []);
  const [loading, setLoading] = useState(!cachedAdminPayments);
  const [activeTab, setActiveTab] = useState("pending");
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<PaymentConfirmAction | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [membershipPlans, setMembershipPlans] = useState<AdminMembershipPlan[]>(cachedAdminMembershipPlans ?? []);
  const [plansLoading, setPlansLoading] = useState(!cachedAdminMembershipPlans);
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [planForm, setPlanForm] = useState<PlanFormState>(emptyPlanForm);
  const [savingPlan, setSavingPlan] = useState(false);

  const applyPayments = useCallback((nextPayments: any[]) => {
    cachedAdminPayments = nextPayments;
    setPayments(nextPayments);
  }, []);

  const applyMembershipPlans = useCallback((nextPlans: AdminMembershipPlan[]) => {
    cachedAdminMembershipPlans = nextPlans;
    setMembershipPlans(nextPlans);
  }, []);

  const fetchPayments = useCallback(async (isBackground = false) => {
    const showInitialLoader = !isBackground && !cachedAdminPayments;
    if (showInitialLoader) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payments')
        .select(`
                    id,
                    user_id,
                    amount,
                    plan_name,
                    screenshot_url,
                    membership_start_date,
                    membership_plan_id,
                    transaction_id,
                    status,
                    created_at,
                    profiles (
                        name,
                        college,
                        photo_url
                    ),
                    membership_plans (
                        id,
                        label,
                        price,
                        duration_type
                    )
                `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      applyPayments(data || []);
    } catch (error: any) {
      console.error("Fetch payments error:", error);
      if (!isBackground) toast({ title: "Failed to load payments", description: error.message, variant: "destructive" });
    } finally {
      if (showInitialLoader) setLoading(false);
    }
  }, [applyPayments]);

  const fetchMembershipPlans = useCallback(async (isBackground = false) => {
    const showInitialLoader = !isBackground && !cachedAdminMembershipPlans;
    if (showInitialLoader) setPlansLoading(true);
    try {
      const { data, error } = await supabase
        .from('membership_plans')
        .select('id, label, price, description, audience, duration_type, is_active, sort_order')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true });

      if (error) throw error;
      applyMembershipPlans((data || []) as AdminMembershipPlan[]);
    } catch (error: any) {
      console.error("Fetch membership plans error:", error);
      if (!isBackground) toast({ title: "Failed to load plans", description: error.message, variant: "destructive" });
    } finally {
      if (showInitialLoader) setPlansLoading(false);
    }
  }, [applyMembershipPlans]);

  useEffect(() => {
    fetchPayments();

    // Realtime Subscription
    const channel = supabase
      .channel('admin_payments_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments' },
        () => fetchPayments(true) // Silent update
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPayments]);

  useEffect(() => {
    fetchMembershipPlans();

    const channel = supabase
      .channel('admin_membership_plans_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'membership_plans' },
        () => fetchMembershipPlans(true)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMembershipPlans]);

  const resetPlanForm = () => {
    setEditingPlanId(null);
    setPlanForm(emptyPlanForm);
  };

  const editPlan = (plan: AdminMembershipPlan) => {
    setEditingPlanId(Number(plan.id));
    setPlanForm({
      label: plan.label,
      price: String(plan.price),
      description: plan.description || "",
      audience: plan.audience,
      duration_type: plan.duration_type || plan.durationType || "monthly",
      is_active: plan.is_active,
      sort_order: String(plan.sort_order ?? 100),
    });
  };

  const savePlan = async (e: React.FormEvent) => {
    e.preventDefault();

    const price = Number(planForm.price);
    if (!planForm.label.trim() || !Number.isFinite(price) || price <= 0) {
      toast({ title: "Invalid plan", description: "Plan name and valid price are required.", variant: "destructive" });
      return;
    }

    setSavingPlan(true);
    try {
      const payload = {
        label: planForm.label.trim(),
        price,
        description: planForm.description.trim(),
        audience: planForm.audience,
        duration_type: planForm.duration_type,
        is_active: planForm.is_active,
        sort_order: Number(planForm.sort_order) || 100,
      };

      const request = editingPlanId
        ? supabase.from('membership_plans').update(payload).eq('id', editingPlanId)
        : supabase.from('membership_plans').insert(payload);

      const { error } = await request;
      if (error) throw error;

      toast({ title: editingPlanId ? "Plan updated" : "Plan added" });
      resetPlanForm();
      fetchMembershipPlans();
    } catch (error: any) {
      console.error("Save plan error:", error);
      toast({ title: "Plan save failed", description: error.message, variant: "destructive" });
    } finally {
      setSavingPlan(false);
    }
  };

  const togglePlanActive = async (plan: AdminMembershipPlan) => {
    try {
      const { error } = await supabase
        .from('membership_plans')
        .update({ is_active: !plan.is_active })
        .eq('id', plan.id);

      if (error) throw error;
      toast({ title: !plan.is_active ? "Plan shown to students" : "Plan hidden from students" });
      fetchMembershipPlans(true);
    } catch (error: any) {
      toast({ title: "Plan update failed", description: error.message, variant: "destructive" });
    }
  };

  const updateStatus = async (id: number, status: string) => {
    // Optimistic Update: Change local state immediately
    const previousPayments = [...payments];
    applyPayments(payments.map(p => p.id === id ? { ...p, status } : p));

    try {
      const { error } = await supabase
        .from('payments')
        .update({ status })
        .eq('id', id);

      if (error) {
        // Revert if failed
        applyPayments(previousPayments);
        throw error;
      }

      // If approved, update user's plan end date and handle installments
      if (status === 'approved') {
        const payment = payments.find(p => p.id === id);
        if (payment && payment.user_id) {
          // Fetch current profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('plan_end_date, pending_amount, plan')
            .eq('id', payment.user_id)
            .single();

          const update = calculatePaymentPlanUpdate({ payment, profile, planDefinition: getPaymentPlanDefinition(payment) });

          await supabase.from('profiles').update(update).eq('id', payment.user_id);
        }
      }

      // Notify the student
      const paymentData = payments.find(p => p.id === id);
      if (paymentData && paymentData.user_id) {
        supabase.functions.invoke('send-notification', {
          body: {
            title: status === 'approved' ? "💰 Payment Approved!" : "❌ Payment Rejected",
            body: status === 'approved'
              ? `Your payment of ₹${paymentData.amount} for ${paymentData.plan_name} has been verified.`
              : `Your payment of ₹${paymentData.amount} was not approved. Please contact the admin.`,
            userIds: [paymentData.user_id]
          }
        });
      }

      toast({
        title: status === 'approved' ? "Payment Approved" : "Payment Rejected",
        description: "Student has been notified."
      });
    } catch (error: any) {
      console.error("Update status error:", error);
      applyPayments(previousPayments); // Revert on error
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    }
  };

  const handleRevoke = async (paymentId: number) => {
    const previousPayments = [...payments];
    const payment = payments.find(p => p.id === paymentId);
    if (!payment) return;

    // Optimistic UI
    applyPayments(payments.map(p => p.id === paymentId ? { ...p, status: 'rejected' } : p));

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan_end_date')
        .eq('id', payment.user_id)
        .single();

      const revokeUpdate = calculatePaymentRevokeUpdate({ payment, profile, planDefinition: getPaymentPlanDefinition(payment) });
      if (revokeUpdate) {
        await supabase.from('profiles').update(revokeUpdate).eq('id', payment.user_id);
      }

      // 2. Update status to rejected
      const { error } = await supabase
        .from('payments')
        .update({ status: 'rejected' })
        .eq('id', paymentId);

      if (error) throw error;

      toast({ title: "Payment Revoked", description: "Days have been removed from student plan." });

    } catch (error: any) {
      console.error("Revoke error:", error);
      applyPayments(previousPayments);
      toast({ title: "Action Failed", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async (paymentId: number) => {
    try {
      const { error } = await supabase.from('payments').delete().eq('id', paymentId);
      if (error) throw error;
      applyPayments(payments.filter(p => p.id !== paymentId));
      toast({ title: "Record Deleted" });
    } catch (error: any) {
      toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
    }
  };

  const requestRevoke = (payment: any) => {
    setConfirmAction({ type: "revoke", paymentId: payment.id, planName: payment.plan_name });
  };

  const requestDelete = (payment: any) => {
    setConfirmAction({ type: "delete", paymentId: payment.id, planName: payment.plan_name });
  };

  const confirmPaymentAction = async () => {
    if (!confirmAction) return;

    setConfirmLoading(true);
    try {
      if (confirmAction.type === "revoke") {
        await handleRevoke(confirmAction.paymentId);
      } else {
        await handleDelete(confirmAction.paymentId);
      }
      setConfirmAction(null);
    } finally {
      setConfirmLoading(false);
    }
  };

  // Derived Lists
  const pendingPayments = payments.filter(p => !p.status || p.status.toLowerCase().trim() === 'pending');
  const approvedPayments = payments.filter(p => p.status && p.status.toLowerCase().trim() === 'approved');
  const rejectedPayments = payments.filter(p => p.status && p.status.toLowerCase().trim() === 'rejected');

  const handleSwipe = (id: number, direction: 'left' | 'right') => {
    // User Logic: Left = Accept, Right = Reject
    if (direction === 'left') {
      updateStatus(id, 'approved');
    } else {
      updateStatus(id, 'rejected');
    }
  };

  return (
    <>
      <PageShell
        title="Payments"
        subtitle="Review & Verify Payments"
        className="pb-4"
        action={
          <Button variant="outline" size="sm" onClick={() => { fetchPayments(); fetchMembershipPlans(); }} disabled={loading || plansLoading} className="gap-2">
            <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      >
        <Tabs defaultValue="pending" className="w-full" onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="pending" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Pending ({pendingPayments.length})
            </TabsTrigger>
            <TabsTrigger value="approved" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
              Approved
            </TabsTrigger>
            <TabsTrigger value="rejected" className="data-[state=active]:bg-destructive data-[state=active]:text-white">
              Rejected
            </TabsTrigger>
            <TabsTrigger value="plans" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Plans
            </TabsTrigger>
          </TabsList>

          {/* Pending Tab - Swipe Interface */}
          <TabsContent value="pending" className="data-[state=inactive]:hidden">
            <div className="relative h-[600px] flex flex-col items-center justify-center min-h-[500px]">
              {loading ? (
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
              ) : pendingPayments.length === 0 ? (
                <div className="text-center text-muted-foreground w-full">
                  <div className="w-20 h-20 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4 border border-dashed border-border">
                    <Check className="w-10 h-10 opacity-30" />
                  </div>
                  <h3 className="text-lg font-semibold mb-1">All Caught Up!</h3>
                  <p className="text-sm">No pending payments to review.</p>
                </div>
              ) : (
                <div className="relative w-full max-w-sm h-[550px] flex items-center justify-center">
                  {/* Stacked Cards (AnimatePresence for exit animations) */}
                  <AnimatePresence>
                    {pendingPayments.slice().reverse().map((payment, index) => {
                      // Render only the top 2 cards for performance
                      if (index < pendingPayments.length - 2) return null;

                      const isTop = index === pendingPayments.length - 1;

                      return (
                        <PaymentSwipeCard
                          key={payment.id}
                          payment={payment}
                          onSwipe={handleSwipe}
                          onImageClick={setZoomedImage}
                          className={isTop ? "z-10" : "z-0 scale-95 opacity-50 top-4"} // Visual stacking
                          style={{
                            pointerEvents: isTop ? "auto" : "none", // Only top card is interactive
                          }}
                        />
                      );
                    })}
                  </AnimatePresence>

                  {/* Helper Text */}
                  <div className="absolute -bottom-10 left-0 right-0 text-center text-xs text-muted-foreground opacity-70">
                    top card is active
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Approved List */}
          <TabsContent value="approved" className="w-full mt-4">
            <div className="space-y-3 pb-4">
              {approvedPayments.length === 0 ? (
                <p className="text-center py-10 text-muted-foreground w-full">No approved payments yet.</p>
              ) : (
                approvedPayments.map(p => (
                  <PaymentListItem key={p.id} payment={p} onDelete={requestDelete} onRevoke={requestRevoke} onImageClick={setZoomedImage} />
                ))
              )}
            </div>
          </TabsContent>

          {/* Rejected List */}
          <TabsContent value="rejected" className="w-full mt-4">
            <div className="space-y-3 pb-4">
              {rejectedPayments.length === 0 ? (
                <p className="text-center py-10 text-muted-foreground w-full">No rejected payments yet.</p>
              ) : (
                rejectedPayments.map(p => (
                  <PaymentListItem key={p.id} payment={p} onDelete={requestDelete} showRevoke={false} onImageClick={setZoomedImage} />
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="plans" className="w-full mt-4">
            <div className="space-y-4 pb-32">
              <form onSubmit={savePlan} className="bg-card rounded-2xl border border-border/50 p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{editingPlanId ? "Edit Plan" : "Add Plan"}</h3>
                    <p className="text-xs text-muted-foreground">Controls what students see in Fees.</p>
                  </div>
                  {editingPlanId ? (
                    <Button type="button" variant="ghost" size="sm" onClick={resetPlanForm}>
                      <Plus className="w-4 h-4" />
                      New
                    </Button>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Plan Name</label>
                  <input
                    value={planForm.label}
                    onChange={(e) => setPlanForm({ ...planForm, label: e.target.value })}
                    placeholder="Boys Monthly Mess"
                    className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">Price</label>
                    <input
                      type="number"
                      min={1}
                      value={planForm.price}
                      onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })}
                      placeholder="1300"
                      className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">Sort</label>
                    <input
                      type="number"
                      value={planForm.sort_order}
                      onChange={(e) => setPlanForm({ ...planForm, sort_order: e.target.value })}
                      className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">Audience</label>
                    <select
                      value={planForm.audience}
                      onChange={(e) => setPlanForm({ ...planForm, audience: e.target.value as PlanAudience })}
                      className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="boys">Boys</option>
                      <option value="girls">Girls</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">Duration</label>
                    <select
                      value={planForm.duration_type}
                      onChange={(e) => setPlanForm({ ...planForm, duration_type: e.target.value as PlanDurationType })}
                      className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="day">1 Day</option>
                      <option value="time">1 Time</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Description</label>
                  <input
                    value={planForm.description}
                    onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                    placeholder="2 meals/day access"
                    className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <label className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/30 p-3">
                  <span>
                    <span className="block text-sm font-semibold">Show to students</span>
                    <span className="block text-xs text-muted-foreground">Hidden plans stay usable for old payments.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={planForm.is_active}
                    onChange={(e) => setPlanForm({ ...planForm, is_active: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                </label>

                <Button type="submit" className="w-full rounded-xl" disabled={savingPlan}>
                  {savingPlan ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editingPlanId ? "Save Changes" : "Add Plan"}
                </Button>
              </form>

              {plansLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : membershipPlans.length === 0 ? (
                <p className="text-center py-10 text-muted-foreground">No plans found.</p>
              ) : (
                <div className="space-y-3">
                  {membershipPlans.map((plan) => (
                    <div key={plan.id} className="bg-card rounded-2xl border border-border/50 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm truncate">{plan.label}</p>
                            {!plan.is_active && (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">Hidden</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{plan.description || "No description"}</p>
                          <p className="text-[11px] text-muted-foreground mt-1 capitalize">
                            {plan.audience} • {plan.duration_type || plan.durationType}
                          </p>
                        </div>
                        <p className="text-lg font-bold text-primary shrink-0">₹{Number(plan.price).toLocaleString()}</p>
                      </div>

                      <div className="flex gap-2 mt-4">
                        <Button type="button" variant="outline" size="sm" className="flex-1 rounded-xl" onClick={() => editPlan(plan)}>
                          <Pencil className="w-4 h-4" />
                          Edit
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="flex-1 rounded-xl" onClick={() => togglePlanActive(plan)}>
                          {plan.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          {plan.is_active ? "Hide" : "Show"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </PageShell>

      {/* Full Screen Image Modal */}
      <AnimatePresence>
        {zoomedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
            onClick={() => setZoomedImage(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="relative max-w-full max-h-full"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={zoomedImage}
                alt="Full Size Payment Screenshot"
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              />
              <button
                className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-black/50 rounded-full transition-colors"
                onClick={() => setZoomedImage(null)}
              >
                <X className="w-6 h-6" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmActionDialog
        open={!!confirmAction}
        onOpenChange={(open) => {
          if (!open && !confirmLoading) setConfirmAction(null);
        }}
        title={confirmAction?.type === "revoke" ? "Reject and revert payment?" : "Delete payment record?"}
        description={
          confirmAction?.type === "revoke"
            ? `This will reject ${confirmAction.planName || "this payment"} and remove the plan days added by it.`
            : `This deletes ${confirmAction?.planName || "this payment"} from history only. It does not change student plan days.`
        }
        confirmLabel={confirmAction?.type === "revoke" ? "Reject & Revert" : "Delete Record"}
        loading={confirmLoading}
        onConfirm={confirmPaymentAction}
      />

      <AdminBottomNav />
    </>
  );
};

// Sub-component for List Items (Approved/Rejected) to keep code clean
const PaymentListItem = ({ payment, onDelete, onRevoke, onImageClick, showRevoke = true }: { payment: any, onDelete: (payment: any) => void, onRevoke?: (payment: any) => void, onImageClick?: (url: string) => void, showRevoke?: boolean }) => (
  <div className="w-full bg-card rounded-xl border border-border/50 p-4 shadow-sm flex items-center justify-between">
    <div className="flex items-center gap-3 flex-1 min-w-0">
      {/* Profile Photo */}
      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
        {payment.profiles?.photo_url ? (
          <img src={payment.profiles.photo_url} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-5 h-5 text-muted-foreground" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">{payment.profiles?.name || "Unknown"}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span>{payment.plan_name}</span>
          <span>•</span>
          <span>₹{payment.amount}</span>
        </div>
        {/* Payment Screenshot Thumbnail Link */}
        {payment.screenshot_url && (
          <button
            onClick={() => onImageClick && onImageClick(payment.screenshot_url)}
            className="text-[10px] text-blue-500 hover:underline flex items-center gap-1 mt-1"
          >
            <ExternalLink className="w-3 h-3" /> View Screenshot
          </button>
        )}
      </div>
    </div>

    <div className="flex items-center gap-2 shrink-0">
      {/* <StatusBadge status={payment.status} /> - Optional: Hide badge to save space if needed */}
      {showRevoke && onRevoke ? (
        <Button
          size="sm"
          variant="destructive"
          className="h-8 px-3 text-xs"
          onClick={() => onRevoke(payment)}
          title="Reject & Revert Days"
        >
          Reject
        </Button>
      ) : (
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(payment)}
          title="Delete Record"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </div>
  </div>
);

export default AdminPayments;
