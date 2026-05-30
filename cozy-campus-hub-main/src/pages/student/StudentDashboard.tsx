import { useEffect } from "react";
import PageShell from "@/components/PageShell";
import StudentBottomNav from "@/components/StudentBottomNav";
import StatusBadge from "@/components/StatusBadge";
import { User, Clock, CalendarDays, Utensils, Check, ChevronRight, MessageCircle, IndianRupee } from "lucide-react";
import { useUser } from "@/hooks/useUser";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";


const StudentDashboard = () => {
  const { user } = useUser();
  const navigate = useNavigate();

  // Determine next meal based on time (cutoff 3 PM)
  const nextMeal = new Date().getHours() < 15 ? "Lunch, 12:30 PM" : "Dinner, 7:30 PM";

  const { data: statusData, refetch } = useQuery({
    queryKey: ['mess-status'],
    queryFn: async () => {
      // Mess Status
      const { data: configData } = await supabase
        .from('menu_items')
        .select('votes')
        .eq('category', 'config')
        .eq('name', 'mess_status')
        .maybeSingle();

      // Meal Status
      const { data: mealData } = await supabase
        .from('menu_items')
        .select('votes')
        .eq('category', 'config')
        .eq('name', 'meal_status')
        .maybeSingle();

      return {
        messOpen: configData ? configData.votes === 1 : true,
        mealReady: mealData ? mealData.votes === 1 : false
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const messOpen = statusData?.messOpen ?? true;
  const mealReady = statusData?.mealReady ?? false;

  useEffect(() => {
    // Listen for changes
    const channel = supabase
      .channel('mess_status_updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menu_items' },
        (payload) => {
          console.log("Realtime table update observed:", payload);
          refetch();
        }
      )
      .on(
        'broadcast',
        { event: 'mess_toggled' },
        (payload) => {
          console.log("Broadcast received: mess_toggled", payload);
          refetch();
        }
      )
      .on(
        'broadcast',
        { event: 'meal_toggled' },
        (payload) => {
          console.log("Broadcast received: meal_toggled", payload);
          refetch();
        }
      )
      .subscribe((status) => {
        console.log("Student Board Channel Status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  if (!user) {
    navigate("/");
    return null;
  }

  return (
    <>
      <PageShell>
        <header className="pt-12 pb-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{user.name}</h1>
          </div>
          <div className="flex items-center gap-3">

            <div
              onClick={() => navigate("/student/profile")}
              className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden cursor-pointer active:scale-95 transition-transform"
            >
              {user.photo ? (
                <img src={user.photo} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <User className="w-6 h-6 text-primary" />
              )}
            </div>
          </div>
        </header>

        {/* Status Grid */}
        <div className="grid grid-cols-2 gap-3 mt-4 mb-4">
          {/* Mess Status */}
          <div className={`rounded-2xl p-3 border flex flex-col justify-between h-28 ${messOpen ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"
            }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${messOpen ? "bg-green-100" : "bg-red-100"
              }`}>
              {messOpen ? <Utensils className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
            </div>
            <div>
              <p className="text-xs font-medium opacity-80 mb-0.5">Mess Status</p>
              <p className="text-sm font-bold leading-tight">{messOpen ? "Open" : "Closed"}</p>
            </div>
          </div>

          {/* Meal Status */}
          <div className={`rounded-2xl p-3 border flex flex-col justify-between h-28 ${mealReady
            ? "bg-blue-50 border-blue-200 text-blue-800"
            : "bg-orange-50 border-orange-200 text-orange-800"
            }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${mealReady ? "bg-blue-100" : "bg-orange-100"}`}>
              {mealReady ? <Check className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
            </div>
            <div>
              <p className="text-xs font-medium opacity-80 mb-0.5">Meal Status</p>
              <p className="text-sm font-bold leading-tight">{mealReady ? "Ready" : "Preparing"}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Status Card Logic */}
          {(() => {
            const isPlanActive = user.plan && (user.daysRemaining && user.daysRemaining > 0);

            return (
              <>
                <div className="bg-card rounded-2xl p-5 border border-border/50 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-muted-foreground">Membership</span>
                    <StatusBadge status={isPlanActive ? "active" : "expired"} />
                  </div>
                  <p className="text-sm text-muted-foreground">{isPlanActive ? user.plan : "No Active Plan"}</p>
                </div>

                {/* Pending balance card */}
                {user.pendingAmount && user.pendingAmount > 0 ? (
                  <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 mb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                          <IndianRupee className="w-5 h-5 text-orange-600" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-orange-800 uppercase">Pending Balance</p>
                          <p className="text-xl font-bold text-orange-900">₹{user.pendingAmount}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => navigate("/student/fees")}
                        className="text-xs font-bold text-orange-600 bg-orange-100 px-3 py-1.5 rounded-lg active:scale-95 transition-all"
                      >
                        PAY NOW
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Days Remaining */}
                <div className={`rounded-2xl p-5 text-primary-foreground ${isPlanActive ? "bg-primary" : "bg-red-500 text-white"}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isPlanActive ? "bg-primary-foreground/15" : "bg-white/20"}`}>
                      <Clock className="w-6 h-6" />
                    </div>
                    <div>
                      {user.onLeave ? (
                        <>
                          <p className="text-2xl font-bold">On Leave</p>
                          <p className="text-sm opacity-80">Days paused</p>
                        </>
                      ) : isPlanActive ? (
                        <>
                          <p className="text-2xl font-bold">{user.daysRemaining || 0} days</p>
                          <p className="text-sm opacity-80">remaining in your plan</p>
                        </>
                      ) : (
                        <>
                          <p className="text-2xl font-bold">No Active Plan</p>
                          <p className="text-sm opacity-80">Please purchase a membership</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </>
            );
          })()}

          {/* Quick Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card rounded-2xl p-3 border border-border/50 shadow-sm flex flex-col justify-center">
              <CalendarDays className="w-5 h-5 text-primary mb-1.5" />
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Plan Duration</p>
              <div className="space-y-1.5 w-full">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-xs text-muted-foreground">Start</span>
                  <span className="font-semibold">{user.planStartDate ? new Date(user.planStartDate).toLocaleDateString("en-GB", { day: '2-digit', month: 'short' }) : "N/A"}</span>
                </div>
                <div className="flex justify-between items-center text-sm pt-1 border-t border-border/50">
                  <span className="text-xs text-muted-foreground">End</span>
                  <span className="font-semibold">{user.planEndDate ? new Date(user.planEndDate).toLocaleDateString("en-GB", { day: '2-digit', month: 'short' }) : "N/A"}</span>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-2xl p-4 border border-border/50 shadow-sm">
              <Clock className="w-5 h-5 text-accent mb-2" />
              <p className="text-xs text-muted-foreground">Next Meal</p>
              <p className="text-sm font-semibold">{nextMeal}</p>
            </div>
          </div>




          {/* Actions Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Community Chat Card */}
            <div
              className="bg-card rounded-2xl p-4 border border-border/50 shadow-sm cursor-pointer active:scale-95 transition-transform"
              onClick={() => navigate("/student/chat")}
            >
              <MessageCircle className="w-5 h-5 text-green-600 mb-2" />
              <p className="text-xs text-muted-foreground">Community Chat</p>
              <p className="text-sm font-semibold">Join Conversation</p>
            </div>

            {/* Feedback Card */}
            <div
              className="bg-card rounded-2xl p-4 border border-border/50 shadow-sm cursor-pointer active:scale-95 transition-transform"
              onClick={() => navigate("/student/feedback")}
            >
              <Utensils className="w-5 h-5 text-yellow-600 mb-2" />
              <p className="text-xs text-muted-foreground">Food Feedback</p>
              <p className="text-sm font-semibold">Rate Today's Meal</p>
            </div>
          </div>
        </div>
      </PageShell >
      <StudentBottomNav />
    </>
  );
};

export default StudentDashboard;
