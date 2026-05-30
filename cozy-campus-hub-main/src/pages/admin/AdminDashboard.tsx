import { useEffect, useState } from "react";
import PageShell from "@/components/PageShell";
import AdminBottomNav from "@/components/AdminBottomNav";
import { Users, IndianRupee, UserPlus, Shield, Loader2, Utensils, Clock, Check, MessageCircle, Bell } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

const AdminDashboard = () => {
  const { user, loading: authLoading } = useUser();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalStudents: 0,
    activeStudents: 0,
    pendingRequests: 0,
    menuItems: 0,
    leaveRequests: 0,
    totalRevenue: 0
  });
  const [messOpen, setMessOpen] = useState(true);
  const [messConfigId, setMessConfigId] = useState<number | null>(null);
  const [mealReady, setMealReady] = useState(false);
  const [mealConfigId, setMealConfigId] = useState<number | null>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  useEffect(() => {
    // 1. Wait for Auth Check
    if (authLoading) return;

    // 2. Redirect if not logged in
    if (!user) {
      navigate("/");
      return;
    }

    const fetchDashboardData = async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        // 1. Fetch Mess Status (Config) & ID
        const { data: configData } = await supabase
          .from('menu_items')
          .select('id, votes')
          .eq('category', 'config')
          .eq('name', 'mess_status')
          .maybeSingle();

        if (configData) {
          setMessOpen(configData.votes === 1);
          setMessConfigId(configData.id);
        } else {
          setMessOpen(true);
        }

        // 1b. Fetch Meal Status (Config)
        const { data: mealData } = await supabase
          .from('menu_items')
          .select('id, votes')
          .eq('category', 'config')
          .eq('name', 'meal_status')
          .maybeSingle();

        if (mealData) {
          setMealReady(mealData.votes === 1);
          setMealConfigId(mealData.id);
        }

        // 2. Fetch Student Counts
        const { count: total } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'student');

        const { count: active } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'student')
          .gt('plan_end_date', new Date().toISOString());

        const { count: pending } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'student')
          .eq('status', 'pending');

        const { count: menuCount } = await supabase
          .from('menu_items')
          .select('*', { count: 'exact', head: true })
          .neq('category', 'config');

        const { count: leaveCount } = await supabase
          .from('leave_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');

        const { data: paymentsData } = await supabase
          .from('payments')
          .select('amount')
          .eq('status', 'approved');

        const revenue = paymentsData?.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0) || 0;

        setStats({
          totalStudents: total || 0,
          activeStudents: active || 0,
          pendingRequests: pending || 0,
          menuItems: menuCount || 0,
          leaveRequests: leaveCount || 0,
          totalRevenue: revenue
        });

      } catch (error) {
        console.error("Dashboard Error:", error);
      } finally {
        if (!silent) setLoading(false);
      }
    };

    fetchDashboardData();

    const realtime = supabase.channel('admin_dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchDashboardData(true))
      .subscribe();

    return () => {
      supabase.removeChannel(realtime);
    };
  }, [user, authLoading, navigate]);

  const toggleMessStatus = async () => {
    const newStatus = !messOpen;
    setMessOpen(newStatus); // Optimistic

    let error = null;

    if (messConfigId) {
      // Update existing
      const { error: updateError } = await supabase
        .from('menu_items')
        .update({ votes: newStatus ? 1 : 0 })
        .eq('id', messConfigId);
      error = updateError;
    } else {
      // Insert new (first time)
      const { data, error: insertError } = await supabase
        .from('menu_items')
        .insert({
          category: 'config',
          name: 'mess_status',
          votes: newStatus ? 1 : 0
        })
        .select()
        .single();

      if (data) setMessConfigId(data.id);
      error = insertError;
    }

    if (error) {
      console.error("Toggle error:", error);
      setMessOpen(!newStatus); // Revert
      toast({ title: "Error", description: error.message || "Failed to update status", variant: "destructive" });
    } else {
      // Send notification if mess is opening/closing
      supabase.functions.invoke('send-notification', {
        body: {
          title: newStatus ? "✅ Mess is now OPEN" : "❌ Mess is now CLOSED",
          body: newStatus ? "Lunch/Dinner is being served. Come on in!" : "The mess is closed for now.",
          topic: "all_students"
        }
      });

      // Send a custom broadcast event to force update immediately
      const channel = supabase.channel('mess_status_updates');
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.send({
            type: 'broadcast',
            event: 'mess_toggled',
            payload: { messOpen: newStatus }
          });
        }
      });

      toast({
        title: newStatus ? "Mess Opened" : "Mess Closed",
        description: newStatus ? "Students can now see the mess is open." : "Students will see the mess is closed."
      });
    }
  };

  const toggleMealStatus = async () => {
    const newStatus = !mealReady;
    setMealReady(newStatus); // Optimistic

    let error = null;

    if (mealConfigId) {
      const { error: updateError } = await supabase
        .from('menu_items')
        .update({ votes: newStatus ? 1 : 0 })
        .eq('id', mealConfigId);
      error = updateError;
    } else {
      const { data, error: insertError } = await supabase
        .from('menu_items')
        .insert({
          category: 'config',
          name: 'meal_status',
          votes: newStatus ? 1 : 0
        })
        .select()
        .single();

      if (data) setMealConfigId(data.id);
      error = insertError;
    }

    if (error) {
      setMealReady(!newStatus);
      toast({ title: "Update Failed", variant: "destructive" });
    } else {
      if (newStatus) {
        // Fetch current menu for a rich notification
        const fetchAndNotify = async () => {
          try {
            const { data: menuItems } = await supabase
              .from('menu_items')
              .select('name, image_url')
              .neq('category', 'config')
              .order('votes', { ascending: false })
              .limit(3);

            let body = "The food is served and hot. Enjoy your meal!";
            let image = "";

            if (menuItems && menuItems.length > 0) {
              const menuNames = menuItems.map(i => i.name).join(", ");
              body = `Today's Special: ${menuNames}. Come and get it!`;
              if (menuItems[0].image_url) image = menuItems[0].image_url;
            }

            supabase.functions.invoke('send-notification', {
              body: {
                title: "🍱 Meal is READY!",
                body: body,
                image: image,
                topic: "all_students"
              }
            });
          } catch (e) {
            console.error("Dashboard notification failed:", e);
          }
        };

        fetchAndNotify();
      }

      // Broadcast meal status change
      const channel = supabase.channel('mess_status_updates');
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.send({
            type: 'broadcast',
            event: 'meal_toggled',
            payload: { mealReady: newStatus }
          });
        }
      });

      toast({ title: newStatus ? "Meal marked as Ready" : "Meal marked as Preparing" });
    }
  };

    // Show nothing while checking auth
    if (authLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

    // Should be handled by useEffect redirect, but just in case
    if (!user) return null;

    const statCards = [
      {
        icon: IndianRupee,
        label: "Total Revenue",
        value: `₹${stats.totalRevenue.toLocaleString()}`,
        color: "text-green-600",
        path: "/admin/analytics" // Ensure this route exists and works
      },
      {
        icon: Users,
        label: "Total Students",
        value: stats.totalStudents,
        color: "text-primary",
        path: "/admin/students"
      },
      {
        icon: Shield,
        label: "Active Memberships",
        value: stats.activeStudents,
        color: "text-green-600",
        path: "/admin/students?tab=Members"
      },
      {
        icon: UserPlus,
        label: "Pending Signups",
        value: stats.pendingRequests,
        color: "text-orange-500",
        path: "/admin/students"
      },
      {
        icon: Utensils,
        label: "Menu Items",
        value: stats.menuItems,
        color: "text-blue-500",
        path: "/admin/menu"
      },
      {
        icon: Clock,
        label: "Leave Requests",
        value: stats.leaveRequests,
        color: "text-purple-500",
        path: "/admin/leaves"
      },
      {
        icon: Bell,
        label: "Notifications",
        value: "Manage",
        color: "text-orange-500",
        path: "/admin/notifications"
      },
      {
        icon: MessageCircle,
        label: "Community Chat",
        value: "Open",
        color: "text-green-500",
        path: "/admin/chat"
      },
    ];

    return (
      <>
        <PageShell>
          <header className="pt-12 pb-2 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Admin Panel</p>
              <h1 className="text-2xl font-bold">{user.name}</h1>
            </div>
            <div
              onClick={() => navigate("/admin/profile")}
              className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden cursor-pointer active:scale-95 transition-transform"
            >
              {user.photo ? (
                <img src={user.photo} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <Shield className="w-6 h-6 text-primary" />
              )}
            </div>
          </header>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Toggles Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {/* Mess Status Toggle */}
                <button
                  onClick={toggleMessStatus}
                  className={`w-full p-4 rounded-2xl flex items-center justify-between border transition-all ${messOpen
                    ? "bg-green-50 border-green-200 text-green-800"
                    : "bg-red-50 border-red-200 text-red-800"
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${messOpen ? "bg-green-100" : "bg-red-100"
                      }`}>
                      {messOpen ? <Utensils className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-lg">{messOpen ? "Mess is Open" : "Mess is Closed"}</p>
                      <p className={`text-xs ${messOpen ? "text-green-600" : "text-red-600"}`}>
                        {messOpen ? "Tap to close mess" : "Tap to open mess"}
                      </p>
                    </div>
                  </div>
                  <div className={`w-12 h-6 rounded-full p-1 transition-colors ${messOpen ? "bg-green-500" : "bg-red-300"
                    }`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${messOpen ? "translate-x-6" : "translate-x-0"
                      }`} />
                  </div>
                </button>

                {/* Meal Status Toggle */}
                <button
                  onClick={toggleMealStatus}
                  className={`w-full p-4 rounded-2xl flex items-center justify-between border transition-all ${mealReady
                    ? "bg-blue-50 border-blue-200 text-blue-800"
                    : "bg-yellow-50 border-yellow-200 text-yellow-800"
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${mealReady ? "bg-blue-100" : "bg-yellow-100"}`}>
                      {mealReady ? <Check className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-lg">{mealReady ? "Meal is Ready" : "Preparing Meal"}</p>
                      <p className="text-xs opacity-80">
                        {mealReady ? "Students notified" : "Mark when ready"}
                      </p>
                    </div>
                  </div>
                  <div className={`w-12 h-6 rounded-full p-1 transition-colors ${mealReady ? "bg-blue-500" : "bg-yellow-300"}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${mealReady ? "translate-x-6" : "translate-x-0"}`} />
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-6 pb-20">
                {statCards.map((stat) => (
                  <button
                    key={stat.label}
                    onClick={() => navigate(stat.path)}
                    className="bg-card rounded-2xl border border-border/50 p-4 shadow-sm text-left hover:border-primary/30 transition-colors"
                  >
                    <stat.icon className={`w-6 h-6 ${stat.color} mb-3`} />
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                  </button>
                ))}
              </div>


            </>
          )}
        </PageShell>
        <AdminBottomNav />
      </>
    );
  };

  export default AdminDashboard;
