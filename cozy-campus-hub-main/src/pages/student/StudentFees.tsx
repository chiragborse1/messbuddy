import { useState, useEffect, useRef, useCallback } from "react";
import PageShell from "@/components/PageShell";
import StudentBottomNav from "@/components/StudentBottomNav";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, History, ArrowLeft, Copy, Download, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { toast } from "@/hooks/use-toast";
import { MessReceiptTicket } from "@/components/ui/ticket-confirmation-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mapMembershipPlanRecord, MessPlan, MESS_PLANS } from "@/lib/plans";
import { validateImageFile } from "@/lib/uploads";

const StudentFees = () => {
  const { user } = useUser();
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [myPayments, setMyPayments] = useState<any[]>([]);
  const [plans, setPlans] = useState<MessPlan[]>([...MESS_PLANS]);
  const [receiptPayment, setReceiptPayment] = useState<any | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [isPartialPayment, setIsPartialPayment] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const receiptRef = useRef<HTMLDivElement>(null);

  const selectedPlan = selectedPlanId ? plans.find((plan) => plan.id === selectedPlanId) : undefined;

  const fetchPlans = useCallback(async () => {
    const { data, error } = await supabase
      .from('membership_plans')
      .select('id, label, price, description, audience, duration_type, is_active, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      console.error("Plan fetch error:", error);
      return;
    }

    setPlans((data && data.length > 0) ? data.map(mapMembershipPlanRecord) : [...MESS_PLANS]);
  }, []);

  const fetchPayments = useCallback(async (_silent = false) => {
    if (!user?.id) return;

    const { data } = await supabase
      .from('payments')
      .select('id, amount, plan_name, screenshot_url, membership_start_date, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setMyPayments(data);
  }, [user?.id]);

  useEffect(() => {
    fetchPlans();

    const channel = supabase
      .channel('student_membership_plans_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'membership_plans' }, () => fetchPlans())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPlans]);

  useEffect(() => {
    if (selectedPlanId && !plans.some((plan) => plan.id === selectedPlanId)) {
      setSelectedPlanId(null);
      setIsPartialPayment(false);
      setPartialAmount("");
    }
  }, [plans, selectedPlanId]);

  useEffect(() => {
    if (user?.id) {
      fetchPayments();

      // Realtime Listener
      const channel = supabase
        .channel('student_payments_changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'payments', filter: `user_id=eq.${user.id}` },
          () => fetchPayments(true) // Silent update
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user?.id, fetchPayments]);

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
    const validation = validateImageFile(file, { maxSizeMB: 5 });
    if (validation.ok === false) {
      toast({ title: "Invalid receipt image", description: validation.error, variant: "destructive" });
      e.target.value = '';
      return;
    }

    if (!selectedPlan) return;

    const partialPaymentAmount = Number(partialAmount);
    if (
      isPartialPayment &&
      (!Number.isFinite(partialPaymentAmount) || partialPaymentAmount <= 0 || partialPaymentAmount >= selectedPlan.price)
    ) {
      toast({
        title: "Invalid installment amount",
        description: `Enter an amount between ₹1 and ₹${selectedPlan.price - 1}.`,
        variant: "destructive",
      });
      e.target.value = '';
      return;
    }

    setUploading(true);
    try {
      // 1. Upload Image
      const fileExt = validation.file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('payment_receipts')
        .upload(fileName, validation.file);

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('payment_receipts')
        .getPublicUrl(fileName);

      // 3. Insert Record
      const finalAmount = isPartialPayment ? partialPaymentAmount : selectedPlan.price;
      const planLabel = isPartialPayment ? `${selectedPlan.label} (Partial)` : selectedPlan.label;

      const { data: paymentRecord, error: insertError } = await supabase.from('payments').insert({
        user_id: user.id,
        amount: finalAmount,
        plan_name: planLabel,
        membership_plan_id: selectedPlan.id,
        screenshot_url: publicUrl,
        membership_start_date: startDate,
        status: 'pending'
      }).select('id').single();

      if (insertError) throw insertError;

      // Notify Admins of new payment
      supabase.functions.invoke('send-notification', {
        body: {
          eventType: 'payment_submitted',
          resourceId: paymentRecord?.id,
          targetRole: 'admin',
        }
      });

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

  const handleDownloadReceipt = (payment: any) => {
    setReceiptPayment(payment);
  };

  const handleSavePdf = async () => {
    if (!receiptRef.current || !receiptPayment) return;
    setDownloadingPdf(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { default: jsPDF } = await import('jspdf');
      const el = receiptRef.current;
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
        scrollX: 0, scrollY: 0,
      });
      const imgW = canvas.width;
      const imgH = canvas.height;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [imgW / 2, imgH / 2] });
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, imgW / 2, imgH / 2);
      pdf.save(`Mess-Receipt-${String(receiptPayment.id)}.pdf`);
      toast({ title: "Receipt Downloaded! 🎉" });
      setReceiptPayment(null);
    } catch (err: any) {
      console.error('PDF error:', err);
      toast({ title: "Download failed", description: err?.message ?? 'Try again', variant: "destructive" });
    } finally {
      setDownloadingPdf(false);
    }
  };



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
                  <div key={p.id} className="bg-card rounded-xl border border-border/50 p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">{p.plan_name}</p>
                        <p className="text-xs text-muted-foreground">₹{p.amount} • {new Date(p.created_at).toLocaleDateString()}</p>
                      </div>
                      <StatusBadge status={p.status} />
                    </div>
                    {p.status === 'approved' && (
                      <button
                        onClick={() => handleDownloadReceipt(p)}
                        className="mt-3 w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 text-xs font-semibold transition-colors border border-green-200 active:scale-95"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Receipt
                      </button>
                    )}
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
                    <Tabs defaultValue="boys" className="w-full">
                      <TabsList className="grid w-full grid-cols-2 mb-4 p-1 bg-muted/50 rounded-xl">
                        <TabsTrigger value="boys" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Boys Plans</TabsTrigger>
                        <TabsTrigger value="girls" className="rounded-lg data-[state=active]:bg-pink-500 data-[state=active]:text-white">Girls Plans</TabsTrigger>
                      </TabsList>

                      <TabsContent value="boys" className="space-y-3 mt-0">
                        {plans.filter(p => p.audience === "boys").map((plan) => (
                          <button
                            key={plan.id}
                            onClick={() => {
                              setSelectedPlanId(plan.id);
                              setIsPartialPayment(false); // Reset on plan change
                            }}
                            className={`w-full p-4 rounded-2xl border text-left transition-all relative overflow-hidden ${selectedPlanId === plan.id
                              ? "bg-primary/5 border-primary ring-1 ring-primary/20 shadow-md"
                              : "bg-card border-border/50 hover:border-primary/30"
                              }`}
                          >
                            <div className="flex items-center justify-between relative z-10">
                              <div>
                                <p className="font-semibold text-foreground">{plan.label.replace("Boys ", "")}</p>
                                <p className="text-xs text-muted-foreground">{plan.description}</p>
                              </div>
                              <span className="text-lg font-bold text-primary">₹{plan.price}</span>
                            </div>
                          </button>
                        ))}
                      </TabsContent>

                      <TabsContent value="girls" className="space-y-3 mt-0">
                        {plans.filter(p => p.audience === "girls").map((plan) => (
                          <button
                            key={plan.id}
                            onClick={() => {
                              setSelectedPlanId(plan.id);
                              setIsPartialPayment(false); // Reset on plan change
                            }}
                            className={`w-full p-4 rounded-2xl border text-left transition-all relative overflow-hidden ${selectedPlanId === plan.id
                              ? "bg-pink-50 border-pink-400 ring-1 ring-pink-400/20 shadow-md"
                              : "bg-card border-border/50 hover:border-pink-300"
                              }`}
                          >
                            <div className="flex items-center justify-between relative z-10">
                              <div>
                                <p className="font-semibold text-foreground">{plan.label.replace("Girls ", "")}</p>
                                <p className="text-xs text-muted-foreground">{plan.description}</p>
                              </div>
                              <span className="text-lg font-bold text-pink-600">₹{plan.price}</span>
                            </div>
                          </button>
                        ))}
                      </TabsContent>
                    </Tabs>

                    {/* Pending Balance Warning if any */}
                    {user?.pendingAmount && user.pendingAmount > 0 ? (
                      <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-2xl">
                        <p className="text-xs font-bold text-red-600 uppercase mb-1">Attention</p>
                        <p className="text-sm text-red-700">You have a pending balance of <b>₹{user.pendingAmount}</b>. Please clear it soon.</p>
                      </div>
                    ) : null}
                  </div>

                  {/* Recent Activity */}
                  {myPayments.length > 0 && (
                    <div>
                      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent Activity</h2>
                      <div className="space-y-2">
                        {myPayments.slice(0, 3).map((p) => (
                          <div
                            key={p.id}
                            onClick={() => p.status === 'approved' && handleDownloadReceipt(p)}
                            className={`flex items-center justify-between p-3 rounded-xl border border-border/40 bg-card shadow-sm ${p.status === 'approved' ? 'cursor-pointer hover:border-green-300 hover:bg-green-50/30 transition-colors' : ''}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm ${p.status === 'approved' ? 'bg-green-100 text-green-700' :
                                p.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>
                                {p.status === 'approved' ? '✓' : p.status === 'pending' ? '⏳' : '✕'}
                              </div>
                              <div>
                                <p className="text-sm font-medium leading-tight">{p.plan_name}</p>
                                <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold">₹{p.amount}</p>
                              {p.status === 'approved' && (
                                <p className="text-[10px] text-green-600 font-medium">Tap for receipt</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Payment Section */}
                  {selectedPlan && (
                    <div className="pt-4 border-t border-dashed border-border/50">
                      {/* Partial Payment Toggle */}
                      <div className="mb-6 p-4 bg-muted/30 rounded-2xl border border-secondary/30">
                        <div className="flex items-center justify-between mb-3">
                          <label className="text-sm font-semibold cursor-pointer select-none" htmlFor="partial-toggle">
                            Pay in Installments?
                          </label>
                          <input
                            id="partial-toggle"
                            type="checkbox"
                            checked={isPartialPayment}
                            onChange={(e) => setIsPartialPayment(e.target.checked)}
                            className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                        </div>
                        {isPartialPayment && (
                          <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                            <p className="text-xs text-muted-foreground">Enter the amount you are paying today. The rest will be shown as "Pending" on your profile.</p>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">₹</span>
                              <input
                                type="number"
                                min={1}
                                max={Math.max(1, (selectedPlan?.price || 1) - 1)}
                                step={1}
                                placeholder="Amount paying now"
                                value={partialAmount}
                                onChange={(e) => setPartialAmount(e.target.value)}
                                className="w-full pl-7 pr-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Pay via UPI</h2>

                      <div className="bg-white rounded-2xl border border-border/50 p-5 text-center mb-4 shadow-sm">
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
                        <p className="text-xs text-muted-foreground mt-2">Tap UPI ID to copy · Scan QR with any app</p>
                      </div>

                      {/* Pay via App Buttons */}
                      {(() => {
                        const partialValue = Number(partialAmount);
                        const hasValidPartialAmount = Number.isFinite(partialValue) && partialValue > 0 && !!selectedPlan && partialValue < selectedPlan.price;
                        const displayPrice = isPartialPayment ? (hasValidPartialAmount ? partialValue : 0) : (selectedPlan?.price || 0);
                        const upiParams = `pa=9359447581@ibl&pn=Akshay+Anil+Patil&am=${displayPrice}&cu=INR&tn=${encodeURIComponent(selectedPlan?.label ?? 'Mess Plan')}`;
                        const upiApps = [
                          {
                            name: "Google Pay",
                            url: `gpay://upi/pay?${upiParams}`,
                            fallback: `upi://pay?${upiParams}`,
                            bg: "bg-white border border-gray-200",
                            icon: (
                              <svg viewBox="0 0 48 48" className="w-7 h-7">
                                <path fill="#4285F4" d="M24 9.5c3.5 0 6.6 1.2 9 3.2l6.7-6.7C35.9 2.3 30.3 0 24 0 14.6 0 6.6 5.5 2.7 13.5l7.8 6C12.5 13.2 17.8 9.5 24 9.5z" />
                                <path fill="#34A853" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-4 6.2-9.9 7.2-16.9z" />
                                <path fill="#FBBC04" d="M10.5 28.5c-.5-1.5-.8-3-.8-4.5s.3-3 .8-4.5l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.5l7.8-6z" />
                                <path fill="#EA4335" d="M24 48c6.3 0 11.6-2.1 15.4-5.7l-7.3-5.7c-2.1 1.4-4.8 2.3-8.1 2.3-6.2 0-11.5-3.7-13.5-9l-7.8 6C6.6 42.5 14.6 48 24 48z" />
                              </svg>
                            ),
                          },
                          {
                            name: "PhonePe",
                            url: `phonepe://pay?${upiParams}`,
                            fallback: `upi://pay?${upiParams}`,
                            bg: "bg-[#5f259f]",
                            textColor: "text-white",
                            icon: (
                              <svg viewBox="0 0 48 48" className="w-7 h-7" fill="white">
                                <circle cx="24" cy="24" r="24" fill="#5f259f" />
                                <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fontSize="22" fontWeight="bold" fill="white">Pe</text>
                              </svg>
                            ),
                          },
                          {
                            name: "Paytm",
                            url: `paytmmp://pay?${upiParams}`,
                            fallback: `upi://pay?${upiParams}`,
                            bg: "bg-[#00BAF2]",
                            textColor: "text-white",
                            icon: (
                              <svg viewBox="0 0 48 48" className="w-7 h-7">
                                <circle cx="24" cy="24" r="24" fill="#00BAF2" />
                                <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fontSize="13" fontWeight="bold" fill="white">PAY</text>
                              </svg>
                            ),
                          },
                          {
                            name: "Other UPI",
                            url: `upi://pay?${upiParams}`,
                            fallback: `upi://pay?${upiParams}`,
                            bg: "bg-secondary",
                            textColor: "text-foreground",
                            icon: (
                              <svg viewBox="0 0 48 48" className="w-7 h-7">
                                <circle cx="24" cy="24" r="24" fill="#eee" />
                                <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#333">UPI</text>
                              </svg>
                            ),
                          },
                        ];
                        return (
                          <div className="mb-4">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 text-center">
                              Or open app directly — ₹{displayPrice} auto-filled
                            </p>
                            <div className="grid grid-cols-4 gap-2">
                              {upiApps.map((app) => (
                                <button
                                  key={app.name}
                                  onClick={() => {
                                    // Try deep link, fallback to generic UPI
                                    const link = document.createElement('a');
                                    link.href = app.url;
                                    link.click();
                                    // Fallback after 1.5s if app not installed
                                    setTimeout(() => {
                                      window.location.href = app.fallback;
                                    }, 1500);
                                  }}
                                  className={`flex flex-col items-center gap-1.5 p-2.5 rounded-2xl ${app.bg} active:scale-95 transition-all shadow-sm`}
                                >
                                  {app.icon}
                                  <span className={`text-[10px] font-semibold ${app.textColor ?? 'text-foreground'} leading-tight text-center`}>
                                    {app.name}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })()}


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

      {/* Receipt Modal */}
      {
        receiptPayment && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-start overflow-y-auto p-4 pt-8">
            {/* Close button */}
            <div className="w-full max-w-sm flex justify-end mb-2">
              <button
                onClick={() => setReceiptPayment(null)}
                className="text-white/70 hover:text-white p-2 rounded-full bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* The ticket — this is what gets captured */}
            <div ref={receiptRef} className="w-full max-w-sm">
              <MessReceiptTicket
                receiptId={`#${String(receiptPayment.id)}`}
                planName={receiptPayment.plan_name}
                amount={receiptPayment.amount}
                studentName={user?.name ?? "Student"}
                upiId="9359447581@ibl"
                paymentDate={new Date(receiptPayment.created_at)}
                screenshotUrl={receiptPayment.screenshot_url}
                showConfetti={true}
              />
            </div>

            {/* Download button */}
            <button
              onClick={handleSavePdf}
              disabled={downloadingPdf}
              className="mt-4 mb-8 w-full max-w-sm flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-500 hover:bg-green-600 active:scale-95 text-white font-bold text-sm transition-all disabled:opacity-60"
            >
              {downloadingPdf ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generating PDF...</>
              ) : (
                <><Download className="w-4 h-4" /> Save as PDF</>
              )}
            </button>
          </div>
        )
      }
    </>
  );
};

export default StudentFees;
