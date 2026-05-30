import { useState, useEffect } from "react";
import PageShell from "@/components/PageShell";
import AdminBottomNav from "@/components/AdminBottomNav";
import StatusBadge from "@/components/StatusBadge";
import ConfirmActionDialog from "@/components/ConfirmActionDialog";
import { Button } from "@/components/ui/button";
import { Check, X, Loader2, ExternalLink, Image as ImageIcon, RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PaymentSwipeCard } from "@/components/PaymentSwipeCard"; // Ensure this path is correct
import { AnimatePresence, motion } from "framer-motion";
import { calculatePaymentPlanUpdate, calculatePaymentRevokeUpdate } from "@/lib/plans";

type PaymentConfirmAction =
  | { type: "revoke"; paymentId: number; planName?: string }
  | { type: "delete"; paymentId: number; planName?: string };

const AdminPayments = () => {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("pending");
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<PaymentConfirmAction | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const fetchPayments = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
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
                    transaction_id,
                    status,
                    created_at,
                    profiles (
                        name,
                        college,
                        photo_url
                    )
                `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPayments(data || []);
    } catch (error: any) {
      console.error("Fetch payments error:", error);
      if (!isBackground) toast({ title: "Failed to load payments", description: error.message, variant: "destructive" });
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

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
  }, []);

  const updateStatus = async (id: number, status: string) => {
    // Optimistic Update: Change local state immediately
    const previousPayments = [...payments];
    setPayments(payments.map(p => p.id === id ? { ...p, status } : p));

    try {
      const { error } = await supabase
        .from('payments')
        .update({ status })
        .eq('id', id);

      if (error) {
        // Revert if failed
        setPayments(previousPayments);
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

          const update = calculatePaymentPlanUpdate({ payment, profile });

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
      setPayments(previousPayments); // Revert on error
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    }
  };

  const handleRevoke = async (paymentId: number) => {
    const previousPayments = [...payments];
    const payment = payments.find(p => p.id === paymentId);
    if (!payment) return;

    // Optimistic UI
    setPayments(payments.map(p => p.id === paymentId ? { ...p, status: 'rejected' } : p));

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan_end_date')
        .eq('id', payment.user_id)
        .single();

      const revokeUpdate = calculatePaymentRevokeUpdate({ payment, profile });
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
      setPayments(previousPayments);
      toast({ title: "Action Failed", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async (paymentId: number) => {
    try {
      const { error } = await supabase.from('payments').delete().eq('id', paymentId);
      if (error) throw error;
      setPayments(payments.filter(p => p.id !== paymentId));
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
          <Button variant="outline" size="sm" onClick={() => fetchPayments()} disabled={loading} className="gap-2">
            <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      >
        <Tabs defaultValue="pending" className="w-full" onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="pending" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Pending ({pendingPayments.length})
            </TabsTrigger>
            <TabsTrigger value="approved" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
              Approved
            </TabsTrigger>
            <TabsTrigger value="rejected" className="data-[state=active]:bg-destructive data-[state=active]:text-white">
              Rejected
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
