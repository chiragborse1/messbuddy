import { useCallback, useEffect, useMemo, useState } from "react";
import PageShell from "@/components/PageShell";
import StudentBottomNav from "@/components/StudentBottomNav";
import { Check, Clock, Image as ImageIcon, Loader2, Search, Trophy, Utensils } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import {
  formatMenuDate,
  getMealTitle,
  getSessionStatusLabel,
  getTodayDateInputValue,
  getWinningSessionItemIds,
  mapMenuSessionItems,
  MealType,
  MenuSession,
  MenuSessionItem,
  MenuSessionItemRow,
  splitMenuItemsByMeal,
} from "@/lib/menu";

type StudentMenuCache = {
  userId: string | null;
  session: MenuSession | null;
  sessionItems: MenuSessionItem[];
};

const sessionSelect = "id, service_date, title, status, voting_closes_at, created_at, updated_at";
const itemSelect = "id, session_id, menu_item_id, meal_type, position, menu_items(id, name, category, image_url)";

let cachedStudentMenuData: StudentMenuCache | null = null;

const StudentMenu = () => {
  const { user } = useUser();
  const cachedForUser = cachedStudentMenuData?.userId === (user?.id ?? null) ? cachedStudentMenuData : null;
  const [session, setSession] = useState<MenuSession | null>(cachedForUser?.session ?? null);
  const [sessionItems, setSessionItems] = useState<MenuSessionItem[]>(cachedForUser?.sessionItems ?? []);
  const [loading, setLoading] = useState(!cachedForUser);
  const [votingItemId, setVotingItemId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const groupedItems = useMemo(() => splitMenuItemsByMeal(sessionItems), [sessionItems]);
  const votingOpen = session?.status === "voting_open";

  const applyMenuData = useCallback((nextSession: MenuSession | null, nextItems: MenuSessionItem[]) => {
    cachedStudentMenuData = {
      userId: user?.id ?? null,
      session: nextSession,
      sessionItems: nextItems,
    };
    setSession(nextSession);
    setSessionItems(nextItems);
  }, [user?.id]);

  const loadSessionItems = useCallback(async (sessionId: number) => {
    const { data, error } = await supabase
      .from("menu_session_items")
      .select(itemSelect)
      .eq("session_id", sessionId)
      .order("meal_type", { ascending: true })
      .order("position", { ascending: true })
      .order("id", { ascending: true });

    if (error) throw error;

    const rows = (data || []) as MenuSessionItemRow[];
    if (rows.length === 0) return [];

    const itemIds = rows.map((row) => row.id);
    const [statsResult, votesResult] = await Promise.all([
      supabase
        .from("menu_session_item_stats")
        .select("session_item_id, vote_count")
        .eq("session_id", sessionId)
        .in("session_item_id", itemIds),
      user?.id
        ? supabase
          .from("menu_votes")
          .select("session_item_id")
          .eq("session_id", sessionId)
          .eq("user_id", user.id)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (statsResult.error) throw statsResult.error;
    if (votesResult.error) throw votesResult.error;

    const voteCounts = new Map((statsResult.data || []).map((stat: any) => [Number(stat.session_item_id), Number(stat.vote_count) || 0]));
    const votedIds = new Set((votesResult.data || []).map((vote: any) => Number(vote.session_item_id)));
    return mapMenuSessionItems(rows, voteCounts, votedIds);
  }, [user?.id]);

  const fetchMenu = useCallback(async (silent = false) => {
    const hasCurrentUserCache = cachedStudentMenuData?.userId === (user?.id ?? null);
    const showInitialLoader = !silent && !hasCurrentUserCache;
    if (showInitialLoader) setLoading(true);

    try {
      const { data: sessions, error } = await supabase
        .from("menu_sessions")
        .select(sessionSelect)
        .gte("service_date", getTodayDateInputValue())
        .order("service_date", { ascending: true })
        .limit(1);

      if (error) throw error;

      const nextSession = (sessions?.[0] ?? null) as MenuSession | null;
      const nextItems = nextSession ? await loadSessionItems(nextSession.id) : [];
      applyMenuData(nextSession, nextItems);
    } catch (error: any) {
      console.error("Error fetching menu:", error);
      if (!silent) toast({ title: "Failed to load menu", description: error.message, variant: "destructive" });
    } finally {
      if (showInitialLoader) setLoading(false);
    }
  }, [applyMenuData, loadSessionItems, user?.id]);

  useEffect(() => {
    void fetchMenu();

    const channel = supabase
      .channel(`student_menu_sessions_${user?.id || "anonymous"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_sessions" }, () => fetchMenu(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_session_items" }, () => fetchMenu(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_votes" }, () => fetchMenu(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, () => fetchMenu(true))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMenu, user?.id]);

  const handleVote = async (item: MenuSessionItem) => {
    if (!votingOpen || !user) return;
    if (item.votedByMe) return;

    setVotingItemId(item.id);
    try {
      const { error } = await supabase.rpc("vote_for_menu_session_item", {
        p_session_item_id: item.id,
      });

      if (error) throw error;
      toast({ title: "Vote recorded", description: `You voted for ${item.item.name}.` });
      await fetchMenu(true);
    } catch (error: any) {
      toast({ title: "Vote failed", description: error.message || "Could not place vote.", variant: "destructive" });
      await fetchMenu(true);
    } finally {
      setVotingItemId(null);
    }
  };

  const getStatusPanel = () => {
    if (!session) {
      return {
        icon: <Utensils className="w-5 h-5 text-muted-foreground" />,
        title: "No menu prepared yet",
        body: "The admin has not created the next menu session.",
        className: "bg-muted/40 border-border text-muted-foreground",
      };
    }

    if (session.status === "voting_open") {
      return {
        icon: <Clock className="w-5 h-5 text-primary" />,
        title: "Voting is open",
        body: `Choose one lunch and one dinner item for ${formatMenuDate(session.service_date)}.`,
        className: "bg-primary/5 border-primary/10 text-primary",
      };
    }

    if (session.status === "draft") {
      return {
        icon: <Utensils className="w-5 h-5 text-muted-foreground" />,
        title: "Menu is being prepared",
        body: `Voting for ${formatMenuDate(session.service_date)} is not open yet.`,
        className: "bg-muted/40 border-border text-muted-foreground",
      };
    }

    return {
      icon: <Trophy className="w-5 h-5 text-amber-600" />,
      title: getSessionStatusLabel(session.status),
      body: `Results for ${formatMenuDate(session.service_date)} are shown below.`,
      className: "bg-amber-50 border-amber-100 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300",
    };
  };

  const renderMealSection = (mealType: MealType, allItems: MenuSessionItem[]) => {
    const filteredItems = allItems.filter((item) =>
      item.item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const winnerIds = getWinningSessionItemIds(allItems);
    const totalVotes = Math.max(1, allItems.reduce((sum, item) => sum + item.voteCount, 0));
    const myVote = allItems.find((item) => item.votedByMe);

    return (
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4 gap-3">
          <div>
            <h2 className="text-lg font-bold">{getMealTitle(mealType)}</h2>
            {myVote && <p className="text-xs text-muted-foreground mt-0.5">Your vote: {myVote.item.name}</p>}
          </div>
          {!votingOpen && winnerIds.size > 0 && (
            <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900">
              Winner
            </span>
          )}
        </div>

        <div className="space-y-3">
          {filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              {allItems.length === 0 ? `No ${mealType} items available.` : "No items match your search."}
            </div>
          ) : (
            filteredItems.map((item) => {
              const isWinner = !votingOpen && winnerIds.has(item.id);
              const percentage = Math.round((item.voteCount / totalVotes) * 100);
              const disabled = !votingOpen || votingItemId !== null;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleVote(item)}
                  disabled={disabled}
                  className={`w-full relative overflow-hidden rounded-2xl border transition-all text-left group p-4 disabled:cursor-not-allowed ${isWinner
                    ? "bg-amber-50/70 border-amber-200 ring-2 ring-amber-400/20 shadow-sm dark:bg-amber-950/20 dark:border-amber-900"
                    : item.votedByMe
                      ? "bg-primary/5 border-primary ring-1 ring-primary/20"
                      : "bg-card border-border/50 hover:border-primary/30"
                    } ${disabled && !item.votedByMe ? "disabled:opacity-70" : ""}`}
                >
                  <div className="flex items-center gap-4 relative z-10">
                    <div className="w-12 h-12 rounded-xl bg-muted overflow-hidden flex items-center justify-center shrink-0">
                      {item.item.image_url ? (
                        <img src={item.item.image_url} alt={item.item.name} className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>

                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors flex-shrink-0 ${isWinner
                        ? "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300"
                        : item.votedByMe
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                        }`}
                    >
                      {votingItemId === item.id ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : isWinner ? (
                        <Trophy className="w-5 h-5" />
                      ) : item.votedByMe ? (
                        <Check className="w-5 h-5" />
                      ) : (
                        <span className="text-xs font-semibold">{percentage}%</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center gap-2 mb-1">
                        <span className={`font-semibold truncate ${isWinner ? "text-amber-700 dark:text-amber-300" : ""}`}>
                          {item.item.name}
                        </span>
                        {item.votedByMe && <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">Voted</span>}
                      </div>

                      <div className="w-full h-2 bg-muted/50 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${isWinner ? "bg-amber-400" : item.votedByMe ? "bg-primary" : "bg-muted-foreground/30"}`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0 min-w-[3rem]">
                      <span className={`text-lg font-bold block leading-none ${isWinner ? "text-amber-700 dark:text-amber-300" : ""}`}>
                        {item.voteCount}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-medium uppercase">votes</span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>
    );
  };

  if (loading) {
    return (
      <PageShell>
        <div className="flex justify-center items-center h-[60vh]">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
        <StudentBottomNav />
      </PageShell>
    );
  }

  const statusPanel = getStatusPanel();

  return (
    <>
      <PageShell
        title={votingOpen ? "Vote for Menu" : "Menu"}
        subtitle={session ? `${formatMenuDate(session.service_date)} · ${getSessionStatusLabel(session.status)}` : "Waiting for menu"}
      >
        <div className={`rounded-2xl p-4 mb-6 border flex gap-3 ${statusPanel.className}`}>
          <div className="w-10 h-10 rounded-full bg-background/70 flex items-center justify-center flex-shrink-0">
            {statusPanel.icon}
          </div>
          <div>
            <h3 className="font-bold mb-1">{statusPanel.title}</h3>
            <p className="text-sm opacity-80 leading-relaxed">{statusPanel.body}</p>
          </div>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search menu items..."
            className="pl-9 h-12 rounded-xl bg-card border-border/50"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <div className="pb-20">
          {renderMealSection("lunch", groupedItems.lunch)}
          {renderMealSection("dinner", groupedItems.dinner)}
        </div>
      </PageShell>
      <StudentBottomNav />
    </>
  );
};

export default StudentMenu;
