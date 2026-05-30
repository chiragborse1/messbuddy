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

const cachedCalendarPaymentsByMonth = new Map<string, PaymentRecord[]>();

const currency = new Intl.NumberFormat("en-IN");
const compactCurrency = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatMonthKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
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
  const initialVisibleMonth = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today]);
  const initialMonthKey = formatMonthKey(initialVisibleMonth);
  const [visibleMonth, setVisibleMonth] = useState(initialVisibleMonth);
  const [selectedDate, setSelectedDate] = useState(() => today);
  const [payments, setPayments] = useState<PaymentRecord[]>(() => cachedCalendarPaymentsByMonth.get(initialMonthKey) ?? []);
  const [loading, setLoading] = useState(() => !cachedCalendarPaymentsByMonth.has(initialMonthKey));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchMonthPayments = useCallback(async () => {
    const monthKey = formatMonthKey(visibleMonth);
    const cachedPayments = cachedCalendarPaymentsByMonth.get(monthKey);
    const showInitialLoader = !cachedPayments;

    if (cachedPayments) {
      setPayments(cachedPayments);
    } else {
      setPayments([]);
    }

    setLoading(showInitialLoader);
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
      if (!cachedPayments) setPayments([]);
    } else {
      const nextPayments = (data ?? []) as PaymentRecord[];
      cachedCalendarPaymentsByMonth.set(monthKey, nextPayments);
      setPayments(nextPayments);
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
        title="Calendar"
        subtitle="Revenue by day"
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/analytics")}>
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        }
      >
        <div className="pb-24 space-y-4">
          <section className="rounded-[28px] bg-card border border-border/60 shadow-sm p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-red-500 dark:text-red-400">This month</p>
                <h2 className="text-3xl font-bold tracking-tight">₹{currency.format(monthSummary.approvedRevenue)}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{monthSummary.totalPayments} payment records</p>
              </div>
              <div className="w-11 h-11 rounded-full bg-red-50 text-red-500 flex items-center justify-center dark:bg-red-950/50 dark:text-red-300">
                <CalendarDays className="w-5 h-5" />
              </div>
            </div>

            <div className="grid grid-cols-3 divide-x divide-border/70 mt-4 rounded-2xl bg-muted/30 border border-border/50 overflow-hidden">
              <div className="p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Approved</p>
                <p className="font-semibold">{monthSummary.approvedCount}</p>
              </div>
              <div className="p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pending</p>
                <p className="font-semibold">{monthSummary.pendingCount}</p>
              </div>
              <div className="p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Rejected</p>
                <p className="font-semibold">{monthSummary.rejectedCount}</p>
              </div>
            </div>
          </section>

          <section className="bg-card rounded-[28px] border border-border/60 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
              <button
                type="button"
                onClick={handleToday}
                className="h-9 px-3 rounded-full text-sm font-semibold text-red-500 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                Today
              </button>
              <div className="text-center">
                <h3 className="text-xl font-bold tracking-tight">{monthLabel}</h3>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => changeMonth(-1)}
                  aria-label="Previous month"
                  className="h-9 w-9 rounded-full text-red-500 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <ChevronLeft className="w-5 h-5 mx-auto" />
                </button>
                <button
                  type="button"
                  onClick={() => changeMonth(1)}
                  aria-label="Next month"
                  className="h-9 w-9 rounded-full text-red-500 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <ChevronRight className="w-5 h-5 mx-auto" />
                </button>
              </div>
            </div>

            {errorMessage && (
              <div className="mx-4 mb-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="grid grid-cols-7 px-3 py-2 border-y border-border/60 bg-muted/20">
              {weekdayLabels.map((day) => (
                <div key={day} className="h-6 flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 px-3 py-3">
              {calendarDays.map((date) => {
                const key = formatDateKey(date);
                const stats = dailyStatsByKey.get(key);
                const inVisibleMonth = isSameMonth(date, visibleMonth);
                const selected = isSameDay(date, selectedDate);
                const isToday = isSameDay(date, today);
                const hasApproved = Boolean(stats?.approvedCount);
                const hasPending = Boolean(stats?.pendingCount);
                const hasRejected = Boolean(stats?.rejectedCount);

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSelectDate(date)}
                    className={cn(
                      "min-h-[62px] px-1 py-1.5 flex flex-col items-center rounded-2xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:ring-offset-2",
                      inVisibleMonth ? "text-foreground" : "text-muted-foreground/40",
                      !selected && "hover:bg-muted/40",
                      selected && "bg-red-50 dark:bg-red-950/30",
                    )}
                    aria-label={`${formatReadableDate(date)}${stats?.totalCount ? `, ${stats.totalCount} payments` : ""}`}
                  >
                    <span
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold",
                        selected && "bg-red-500 text-white shadow-sm shadow-red-500/20",
                        isToday && !selected && "border border-red-500 text-red-500 dark:border-red-400 dark:text-red-400",
                      )}
                    >
                      {date.getDate()}
                    </span>
                    <div className="h-2.5 mt-1 flex items-center justify-center gap-0.5">
                      {hasApproved && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                      {hasPending && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                      {hasRejected && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                    </div>
                    <span
                      className={cn(
                        "text-[9px] leading-none font-semibold text-muted-foreground truncate max-w-full",
                        stats?.approvedRevenue && "text-green-600 dark:text-green-400",
                      )}
                    >
                      {stats?.approvedRevenue ? `₹${compactCurrency.format(stats.approvedRevenue)}` : ""}
                    </span>
                  </button>
                );
              })}
            </div>

            {loading && (
              <div className="mx-4 mb-4 rounded-2xl border border-border/50 bg-muted/30 p-3 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading month stats
              </div>
            )}
          </section>

          <section className="bg-card rounded-[28px] border border-border/60 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border/60 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-red-500 text-white flex flex-col items-center justify-center shrink-0 shadow-sm shadow-red-500/20">
                  <span className="text-[10px] uppercase leading-none">
                    {selectedDate.toLocaleDateString("en-IN", { weekday: "short" })}
                  </span>
                  <span className="text-xl font-bold leading-none">{selectedDate.getDate()}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground">Selected day</p>
                  <h3 className="text-lg font-bold truncate">{formatReadableDate(selectedDate)}</h3>
                </div>
              </div>
              <p className="text-xl font-bold shrink-0">₹{compactCurrency.format(selectedStats.approvedRevenue)}</p>
            </div>

            <div className="grid grid-cols-4 divide-x divide-border/70 border-b border-border/60 bg-muted/20">
              <div className="p-3">
                <div className="flex items-center gap-1.5 text-green-700 dark:text-green-300 mb-1">
                  <IndianRupee className="w-4 h-4" />
                  <p className="text-[10px] font-semibold">Rev.</p>
                </div>
                <p className="text-sm font-bold">₹{compactCurrency.format(selectedStats.approvedRevenue)}</p>
              </div>
              <div className="p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <ReceiptText className="w-4 h-4" />
                  <p className="text-[10px] font-semibold">Pay</p>
                </div>
                <p className="text-sm font-bold">{selectedStats.totalCount}</p>
              </div>
              <div className="p-3">
                <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300 mb-1">
                  <Clock className="w-4 h-4" />
                  <p className="text-[10px] font-semibold">Pend.</p>
                </div>
                <p className="text-sm font-bold">₹{compactCurrency.format(selectedStats.pendingAmount)}</p>
              </div>
              <div className="p-3">
                <div className="flex items-center gap-1.5 text-red-700 dark:text-red-300 mb-1">
                  <XCircle className="w-4 h-4" />
                  <p className="text-[10px] font-semibold">Reject</p>
                </div>
                <p className="text-sm font-bold">{selectedStats.rejectedCount}</p>
              </div>
            </div>

            <div className="px-4 py-2">
              {selectedStats.payments.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No payments recorded for this date.
                </div>
              ) : (
                selectedStats.payments.map((payment) => {
                  const profile = getProfile(payment);
                  const status = payment.status ?? "unknown";

                  return (
                    <div key={payment.id} className="flex gap-3 py-3 border-b border-border/60 last:border-b-0">
                      <div
                        className={cn(
                          "w-1.5 rounded-full shrink-0",
                          status === "approved" && "bg-green-500",
                          status === "pending" && "bg-amber-500",
                          status === "rejected" && "bg-red-500",
                          !["approved", "pending", "rejected"].includes(status) && "bg-muted-foreground/40",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{profile?.name || "Unknown Student"}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {formatTime(payment.created_at)} • {payment.plan_name || "No plan"}
                            </p>
                          </div>
                          <p className="font-bold shrink-0">₹{currency.format(Number(payment.amount) || 0)}</p>
                        </div>
                        <div className="flex items-center justify-between gap-3 mt-2">
                          <Badge variant="outline" className={cn("capitalize shrink-0", getStatusBadgeClass(status))}>
                            {status === "approved" ? <CheckCircle2 className="w-3 h-3 mr-1" /> : null}
                            {status}
                          </Badge>
                          {payment.transaction_id ? (
                            <p className="text-[11px] font-mono text-muted-foreground truncate text-right">
                              {payment.transaction_id}
                            </p>
                          ) : null}
                        </div>
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
