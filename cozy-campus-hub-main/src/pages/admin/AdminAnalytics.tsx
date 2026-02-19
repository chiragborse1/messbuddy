
import { useState, useEffect } from "react";
import PageShell from "@/components/PageShell";
import AdminBottomNav from "@/components/AdminBottomNav";
import { supabase } from "@/lib/supabase";
import { IndianRupee, Calendar, TrendingUp, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";

const AdminAnalytics = () => {
    const [payments, setPayments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Stats
    const [totalRevenue, setTotalRevenue] = useState(0);
    const [monthlyRevenue, setMonthlyRevenue] = useState(0);
    const [weeklyRevenue, setWeeklyRevenue] = useState(0);
    const [dailyRevenue, setDailyRevenue] = useState(0);

    // Custom Date
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [customRevenue, setCustomRevenue] = useState<number | null>(null);

    const fetchPayments = async () => {
        try {
            const { data, error } = await supabase
                .from('payments')
                .select('*')
                .eq('status', 'approved'); // Only approved payments count

            if (error) throw error;
            if (data) {
                setPayments(data);
                calculateStats(data);
            }
        } catch (error) {
            console.error("Error fetching payments:", error);
        } finally {
            setLoading(false);
        }
    };

    const calculateStats = (data: any[]) => {
        const now = new Date();
        let total = 0;
        let monthly = 0;
        let weekly = 0;
        let daily = 0;

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Start of week (Sunday)
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);

        data.forEach(p => {
            const amount = Number(p.amount) || 0;
            const date = new Date(p.created_at);

            total += amount;

            if (date >= startOfMonth) monthly += amount;
            if (date >= startOfWeek) weekly += amount;
            if (date >= startOfDay) daily += amount;
        });

        setTotalRevenue(total);
        setMonthlyRevenue(monthly);
        setWeeklyRevenue(weekly);
        setDailyRevenue(daily);
    };

    const handleCustomCheck = () => {
        if (!startDate || !endDate) return;

        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // Include full end day

        const filtered = payments.filter(p => {
            const date = new Date(p.created_at);
            return date >= start && date <= end;
        });

        const sum = filtered.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
        setCustomRevenue(sum);
    };

    useEffect(() => {
        fetchPayments();

        // Realtime Listener
        const channel = supabase
            .channel('analytics_payments')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'payments' },
                () => fetchPayments()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    return (
        <>
            <PageShell title="Analytics" subtitle="Revenue & Performance Overview">
                <div className="pb-24 space-y-6">

                    {/* Main Stats Grid */}
                    <div className="grid grid-cols-2 gap-4">

                        {/* Total Revenue */}
                        <div className="col-span-2 bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-6 border border-primary/20 shadow-sm">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                                    <IndianRupee className="w-5 h-5 text-primary" />
                                </div>
                                <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Revenue</span>
                            </div>
                            <h2 className="text-3xl font-bold text-primary">₹{totalRevenue.toLocaleString()}</h2>
                        </div>

                        {/* Monthly */}
                        <div className="bg-card rounded-2xl p-4 border border-border/50 shadow-sm">
                            <div className="flex items-center gap-2 mb-2">
                                <Calendar className="w-4 h-4 text-orange-500" />
                                <span className="text-xs font-medium text-muted-foreground">This Month</span>
                            </div>
                            <h3 className="text-xl font-bold">₹{monthlyRevenue.toLocaleString()}</h3>
                        </div>

                        {/* Weekly */}
                        <div className="bg-card rounded-2xl p-4 border border-border/50 shadow-sm">
                            <div className="flex items-center gap-2 mb-2">
                                <TrendingUp className="w-4 h-4 text-green-500" />
                                <span className="text-xs font-medium text-muted-foreground">This Week</span>
                            </div>
                            <h3 className="text-xl font-bold">₹{weeklyRevenue.toLocaleString()}</h3>
                        </div>

                        {/* Daily */}
                        <div className="col-span-2 bg-card rounded-2xl p-4 border border-border/50 shadow-sm flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                                    <DollarSign className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground">Today's Revenue</p>
                                    <h3 className="text-xl font-bold text-blue-700">₹{dailyRevenue.toLocaleString()}</h3>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Custom Date Check */}
                    <div className="bg-card rounded-2xl p-5 border border-border/50 shadow-sm">
                        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Custom Date Range
                        </h3>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Start Date</label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full p-2 rounded-lg border bg-background text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">End Date</label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full p-2 rounded-lg border bg-background text-sm"
                                />
                            </div>
                        </div>

                        <Button onClick={handleCustomCheck} disabled={!startDate || !endDate} className="w-full mb-4">
                            Check Revenue
                        </Button>

                        {customRevenue !== null && (
                            <div className="bg-muted/50 rounded-xl p-4 text-center border border-dashed border-border transition-all">
                                <p className="text-xs text-muted-foreground mb-1">Revenue for selected period</p>
                                <p className="text-2xl font-bold text-foreground">₹{customRevenue.toLocaleString()}</p>
                            </div>
                        )}
                    </div>

                </div>
            </PageShell>
            <AdminBottomNav />
        </>
    );
};

export default AdminAnalytics;
