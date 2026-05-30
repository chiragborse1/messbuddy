import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  IndianRupee,
  Loader2,
  ReceiptText,
  XCircle,
} from "lucide-react";
import AdminBottomNav from "@/components/AdminBottomNav";
import PageShell from "@/components/PageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type PaymentStatus = "approved" | "pending" | "rejected" | string;

interface PaymentProfile {
  name?: string | null;
  college?: string | null;
  photo_url?: string | null;
}

interface PaymentRecord {
  id: number;
  amount: number | string | null;
  plan_name: string | null;
  status: PaymentStatus | null;
  created_at: string;
  membership_start_date?: string | null;
  transaction_id?: string | null;
  profiles?: PaymentProfile | PaymentProfile[] | null;
}

interface DayStats {
  date: Date;
  payments: PaymentRecord[];
  approvedRevenue: number;
  pendingAmount: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  totalCount: number;
}

const currency = new Intl.NumberFormat("en-IN");

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatReadableDate = (date: Date) =>
  date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });

const getMonthBounds = (monthDate: Date) => {
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
  return { start, end };
};

const buildCalendarGrid = (monthDate: Date) => {
  const { start } = getMonthBounds(monthDate);
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - start.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
};

const isSameDay = (left: Date, right: Date) => formatDateKey(left) === formatDateKey(right);

const isSameMonth = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();

const getProfile = (payment: PaymentRecord) => {
  if (Array.isArray(payment.profiles)) return payment.profiles[0] ?? null;
  return payment.profiles ?? null;
};

const getEmptyStats = (date: Date): DayStats => ({
  date,
  payments: [],
  approvedRevenue: 0,
  pendingAmount: 0,
  approvedCount: 0,
  pendingCount: 0,
  rejectedCount: 0,
  totalCount: 0,
});

const getStatusBadgeClass = (status: PaymentStatus | null) => {
  if (status === "approved") return "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300";
  if (status === "pending") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300";
  if (status === "rejected") return "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300";
  return "border-border bg-muted text-muted-foreground";
};

const AdminAnalyticsCalendar = () => {
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => today);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchMonthPayments = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    const { start, end } = getMonthBounds(visibleMonth);

    const { data, error } = await supabase
      .from("payments")
      .select(
        `
          id,
          amount,
          plan_name,
          status,
          created_at,
          membership_start_date,
          transaction_id,
          profiles (
            name,
            college,
            photo_url
          )
        `,
      )
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Monthly calendar payments fetch failed:", error);
      setErrorMessage(error.message);
      setPayments([]);
    } else {
      setPayments((data ?? []) as PaymentRecord[]);
    }

    setLoading(false);
  }, [visibleMonth]);

  useEffect(() => {
    fetchMonthPayments();

    const channel = supabase
      .channel("analytics_calendar_payments")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => fetchMonthPayments())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMonthPayments]);

  const dailyStatsByKey = useMemo(() => {
    const map = new Map<string, DayStats>();

    for (const payment of payments) {
      if (!payment.created_at) continue;

      const date = new Date(payment.created_at);
      const key = formatDateKey(date);
      const current = map.get(key) ?? getEmptyStats(date);
      const amount = Number(payment.amount) || 0;
      const status = payment.status ?? "";

      current.payments.push(payment);
      current.totalCount += 1;

      if (status === "approved") {
        current.approvedRevenue += amount;
        current.approvedCount += 1;
      } else if (status === "pending") {
        current.pendingAmount += amount;
        current.pendingCount += 1;
      } else if (status === "rejected") {
        current.rejectedCount += 1;
      }

      map.set(key, current);
    }

    return map;
  }, [payments]);

  const monthSummary = useMemo(() => {
    return payments.reduce(
      (summary, payment) => {
        const amount = Number(payment.amount) || 0;
        const status = payment.status ?? "";

        summary.totalPayments += 1;
        if (status === "approved") {
          summary.approvedRevenue += amount;
          summary.approvedCount += 1;
        } else if (status === "pending") {
          summary.pendingAmount += amount;
          summary.pendingCount += 1;
        } else if (status === "rejected") {
          summary.rejectedCount += 1;
        }

        return summary;
      },
      {
        approvedRevenue: 0,
        pendingAmount: 0,
        approvedCount: 0,
        pendingCount: 0,
        rejectedCount: 0,
        totalPayments: 0,
      },
    );
  }, [payments]);

  const selectedStats = dailyStatsByKey.get(formatDateKey(selectedDate)) ?? getEmptyStats(selectedDate);
  const calendarDays = useMemo(() => buildCalendarGrid(visibleMonth), [visibleMonth]);
  const monthLabel = visibleMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const changeMonth = (offset: number) => {
    const nextMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1);
    setVisibleMonth(nextMonth);
    setSelectedDate(nextMonth);
  };

  const handleSelectDate = (date: Date) => {
    setSelectedDate(date);
    if (!isSameMonth(date, visibleMonth)) {
      setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  };

  const handleToday = () => {
    const nextToday = new Date();
    setVisibleMonth(new Date(nextToday.getFullYear(), nextToday.getMonth(), 1));
    setSelectedDate(nextToday);
  };

  return (
    <>
      <PageShell
        title="Revenue Calendar"
        subtitle="Tap any date to expand daily payment stats"
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/analytics")}>
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        }
      >
        <div className="pb-24 space-y-5">
          <section className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-5 border border-primary/20 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{monthLabel}</p>
                <h2 className="text-3xl font-bold text-primary">₹{currency.format(monthSummary.approvedRevenue)}</h2>
              </div>
              <div className="w-11 h-11 rounded-full bg-primary/15 flex items-center justify-center">
                <CalendarDays className="w-5 h-5 text-primary" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-background/70 border border-border/50 p-3">
                <p className="text-[11px] text-muted-foreground">Approved</p>
                <p className="font-bold">{monthSummary.approvedCount}</p>
              </div>
              <div className="rounded-xl bg-background/70 border border-border/50 p-3">
                <p className="text-[11px] text-muted-foreground">Pending</p>
                <p className="font-bold">{monthSummary.pendingCount}</p>
              </div>
              <div className="rounded-xl bg-background/70 border border-border/50 p-3">
                <p className="text-[11px] text-muted-foreground">Total</p>
                <p className="font-bold">{monthSummary.totalPayments}</p>
              </div>
            </div>
          </section>

          <section className="bg-card rounded-2xl border border-border/50 shadow-sm p-4">
            <div className="flex items-center justify-between gap-2 mb-4">
              <Button variant="outline" size="icon" onClick={() => changeMonth(-1)} aria-label="Previous month">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="text-center">
                <h3 className="font-bold">{monthLabel}</h3>
                <button type="button" onClick={handleToday} className="text-xs text-primary font-semibold">
                  Today
                </button>
              </div>
              <Button variant="outline" size="icon" onClick={() => changeMonth(1)} aria-label="Next month">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {errorMessage && (
              <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="grid grid-cols-7 gap-1.5 mb-2">
              {weekdayLabels.map((day) => (
                <div key={day} className="h-7 flex items-center justify-center text-[11px] font-semibold text-muted-foreground">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {calendarDays.map((date) => {
                const key = formatDateKey(date);
                const stats = dailyStatsByKey.get(key);
                const inVisibleMonth = isSameMonth(date, visibleMonth);
                const selected = isSameDay(date, selectedDate);
                const isToday = isSameDay(date, today);

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSelectDate(date)}
                    className={cn(
                      "min-h-[72px] rounded-xl border p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      inVisibleMonth ? "bg-background border-border/60" : "bg-muted/20 border-border/30 opacity-50",
                      selected && "border-primary bg-primary/10 ring-1 ring-primary/30",
                      !selected && stats?.totalCount && "hover:border-primary/30 hover:bg-primary/5",
                    )}
                    aria-label={`${formatReadableDate(date)}${stats?.totalCount ? `, ${stats.totalCount} payments` : ""}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                          isToday && "bg-primary text-primary-foreground",
                          selected && !isToday && "text-primary",
                        )}
                      >
                        {date.getDate()}
                      </span>
                      {stats?.totalCount ? <span className="w-1.5 h-1.5 rounded-full bg-primary" /> : null}
                    </div>
                    {stats?.approvedRevenue ? (
                      <p className="mt-2 text-[10px] font-bold text-green-600 dark:text-green-400 truncate">
                        ₹{currency.format(stats.approvedRevenue)}
                      </p>
                    ) : (
                      <p className="mt-2 text-[10px] text-muted-foreground/50">No rev.</p>
                    )}
                    {stats?.totalCount ? (
                      <p className="text-[10px] text-muted-foreground truncate">{stats.totalCount} payment{stats.totalCount === 1 ? "" : "s"}</p>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {loading && (
              <div className="mt-4 rounded-xl border border-border/50 bg-muted/30 p-3 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading month stats
              </div>
            )}
          </section>

          <section className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border/60">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Selected Day</p>
              <h3 className="text-lg font-bold">{formatReadableDate(selectedDate)}</h3>
            </div>

            <div className="grid grid-cols-2 gap-3 p-4">
              <div className="rounded-xl bg-green-50 border border-green-100 p-3 dark:bg-green-950/40 dark:border-green-900">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-1">
                  <IndianRupee className="w-4 h-4" />
                  <p className="text-xs font-semibold">Revenue</p>
                </div>
                <p className="text-xl font-bold">₹{currency.format(selectedStats.approvedRevenue)}</p>
              </div>
              <div className="rounded-xl bg-muted/40 border border-border/60 p-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <ReceiptText className="w-4 h-4" />
                  <p className="text-xs font-semibold">Payments</p>
                </div>
                <p className="text-xl font-bold">{selectedStats.totalCount}</p>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 dark:bg-amber-950/40 dark:border-amber-900">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 mb-1">
                  <Clock className="w-4 h-4" />
                  <p className="text-xs font-semibold">Pending</p>
                </div>
                <p className="text-xl font-bold">₹{currency.format(selectedStats.pendingAmount)}</p>
              </div>
              <div className="rounded-xl bg-red-50 border border-red-100 p-3 dark:bg-red-950/40 dark:border-red-900">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-300 mb-1">
                  <XCircle className="w-4 h-4" />
                  <p className="text-xs font-semibold">Rejected</p>
                </div>
                <p className="text-xl font-bold">{selectedStats.rejectedCount}</p>
              </div>
            </div>

            <div className="px-4 pb-4 space-y-3">
              {selectedStats.payments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                  No payments recorded for this date.
                </div>
              ) : (
                selectedStats.payments.map((payment) => {
                  const profile = getProfile(payment);
                  const status = payment.status ?? "unknown";

                  return (
                    <div key={payment.id} className="rounded-xl border border-border/60 bg-background p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{profile?.name || "Unknown Student"}</p>
                          <p className="text-xs text-muted-foreground truncate">{payment.plan_name || "No plan"} • {formatTime(payment.created_at)}</p>
                        </div>
                        <Badge variant="outline" className={cn("capitalize shrink-0", getStatusBadgeClass(status))}>
                          {status === "approved" ? <CheckCircle2 className="w-3 h-3 mr-1" /> : null}
                          {status}
                        </Badge>
                      </div>
                      <div className="flex items-end justify-between gap-3 mt-3 pt-3 border-t border-border/50">
                        <div className="min-w-0">
                          <p className="text-[11px] text-muted-foreground">Amount</p>
                          <p className="font-bold">₹{currency.format(Number(payment.amount) || 0)}</p>
                        </div>
                        {payment.transaction_id ? (
                          <p className="text-[11px] font-mono text-muted-foreground truncate text-right max-w-[45%]">
                            {payment.transaction_id}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </PageShell>
      <AdminBottomNav />
    </>
  );
};

export default AdminAnalyticsCalendar;
