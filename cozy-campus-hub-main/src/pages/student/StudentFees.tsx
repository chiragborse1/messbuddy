import { useState, useEffect } from "react";
import PageShell from "@/components/PageShell";
import StudentBottomNav from "@/components/StudentBottomNav";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, History, ArrowLeft, Copy, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/contexts/UserContext";
import { toast } from "@/hooks/use-toast";

const plans = [
  { id: 1, label: "1 Day Trial", price: 120, desc: "Single day access" },
  { id: 2, label: "Boys Monthly", price: 2200, desc: "30 days unlimited meals" },
  { id: 3, label: "Girls Monthly", price: 1600, desc: "30 days unlimited meals" },
];

const StudentFees = () => {
  const { user } = useUser();
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [myPayments, setMyPayments] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      fetchPayments();

      // Realtime Listener
      const channel = supabase
        .channel('student_payments_changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'payments' },
          () => fetchPayments(true) // Silent update
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const fetchPayments = async (silent = false) => {
    if (!user) return;
    // Ideally add a loading state here if you want to show a spinner on first load
    // But since we didn't have one before, we just ensure we don't clear data unnecessarily

    const { data } = await supabase
      .from('payments')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setMyPayments(data);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    if (!selectedPlanId || !user) {
      toast({ title: "Select a plan first", variant: "destructive" });
      return;
    }

    if (!startDate) {
      toast({ title: "Start Date Required", description: "Please select when your membership should start.", variant: "destructive" });
      // Reset file input so user can try again
      e.target.value = '';
      return;
    }

    const file = e.target.files[0];
    const plan = plans.find(p => p.id === selectedPlanId);
    if (!plan) return;

    setUploading(true);
    try {
      // 1. Upload Image
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('payment_receipts')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('payment_receipts')
        .getPublicUrl(fileName);

      // 3. Insert Record
      const { error: insertError } = await supabase.from('payments').insert({
        user_id: user.id,
        amount: plan.price,
        plan_name: plan.label,
        screenshot_url: publicUrl,
        membership_start_date: startDate,
        status: 'pending'
      });

      if (insertError) throw insertError;

      toast({ title: "Payment Submitted", description: "Admin will review your screenshot." });
      setSelectedPlanId(null);
      setStartDate("");
      fetchPayments();

    } catch (error: any) {
      console.error("Payment upload error:", error);
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const [showHistory, setShowHistory] = useState(false);

  // ... (keep existing useEffects and handlers)

  const pendingPayment = myPayments.find(p => p.status === 'pending');

  return (
    <>
      <PageShell
        title={showHistory ? "Payment History" : "Fees & Membership"}
        subtitle={showHistory ? "Your past transactions" : "Choose a plan and pay"}
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
        <div className="pb-24 space-y-6">

          {showHistory ? (
            /* History View */
            <div className="space-y-3">
              {myPayments.length > 0 ? (
                myPayments.map((p) => (
                  <div key={p.id} className="bg-card rounded-xl border border-border/50 p-4 flex items-center justify-between shadow-sm">
                    <div>
                      <p className="font-semibold text-sm">{p.plan_name}</p>
                      <p className="text-xs text-muted-foreground">₹{p.amount} • {new Date(p.created_at).toLocaleDateString()}</p>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-muted-foreground">
                  <History className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p>No payment history found</p>
                </div>
              )}
            </div>
          ) : (
            /* Main Fee View */
            <div className="space-y-6">
              {/* Active Plan or Pending Status */}
              {pendingPayment ? (
                <div className="bg-yellow-50 rounded-2xl border border-yellow-200 p-6 text-center shadow-sm">
                  <div className="w-12 h-12 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                  <h3 className="font-semibold text-yellow-900">Payment Under Review</h3>
                  <p className="text-sm text-yellow-700 mt-1">
                    You submitted <b>₹{pendingPayment.amount}</b> for <b>{pendingPayment.plan_name}</b>.
                  </p>
                  <p className="text-xs text-muted-foreground mt-4">Please wait for admin approval.</p>
                </div>
              ) : (
                <>
                  {/* Plans */}
                  <div>
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Select Plan</h2>
                    <div className="space-y-3">
                      {plans.map((plan) => (
                        <button
                          key={plan.id}
                          onClick={() => setSelectedPlanId(plan.id)}
                          className={`w-full p-4 rounded-2xl border text-left transition-all relative overflow-hidden ${selectedPlanId === plan.id
                            ? "bg-primary/5 border-primary ring-1 ring-primary/20 shadow-md"
                            : "bg-card border-border/50 hover:border-primary/30"
                            }`}
                        >
                          <div className="flex items-center justify-between relative z-10">
                            <div>
                              <p className="font-semibold">{plan.label}</p>
                              <p className="text-xs text-muted-foreground">{plan.desc}</p>
                            </div>
                            <span className="text-lg font-bold text-primary">₹{plan.price}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Payment Section */}
                  {selectedPlanId && (
                    <div className="pt-4 border-t border-dashed border-border/50">
                      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Pay via UPI</h2>

                      <div className="bg-white rounded-2xl border border-border/50 p-5 text-center mb-6 shadow-sm">
                        {/* PhonePe QR Code */}
                        <img
                          src="/Mess QR.jpeg"
                          alt="PhonePe QR Code - Akshay Anil Patil"
                          className="w-48 h-auto mx-auto mb-3 rounded-xl"
                        />
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">UPI ID</p>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText('9359447581@ibl');
                            toast({ title: "UPI ID Copied!", description: "9359447581@ibl" });
                          }}
                          className="bg-muted hover:bg-muted/70 active:scale-95 transition-all inline-flex items-center gap-2 px-3 py-1.5 rounded-lg mt-1 font-mono text-sm font-medium"
                        >
                          9359447581@ibl
                          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        <p className="text-xs text-muted-foreground mt-2">Tap the UPI ID to copy</p>
                      </div>

                      <div className="bg-card rounded-2xl border border-border p-6 text-center">
                        {uploading ? (
                          <div className="py-4">
                            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground">Uploading screenshot...</p>
                          </div>
                        ) : (
                          <>
                            {/* Start Date Input */}
                            < div className="mb-4 text-left">
                              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Membership Start Date</label>
                              <input
                                type="date"
                                required
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full p-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                              />
                            </div>

                            <label className="block cursor-pointer group">
                              <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-3 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                <Upload className="w-6 h-6" />
                              </div>
                              <p className="font-semibold text-foreground">Upload Screenshot</p>
                              <p className="text-xs text-muted-foreground mt-1">Attach the payment success screen</p>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleFileUpload}
                              />
                            </label>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

        </div>
      </PageShell >
      <StudentBottomNav />
    </>
  );
};

export default StudentFees;
