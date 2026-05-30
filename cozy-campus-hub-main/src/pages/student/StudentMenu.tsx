import { useState, useEffect, useCallback } from "react";
import PageShell from "@/components/PageShell";
import StudentBottomNav from "@/components/StudentBottomNav";
import { Check, Trophy, Clock, Loader2, AlertCircle, Search } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";

type StudentMenuCache = {
  lunchItems: any[];
  dinnerItems: any[];
  votingOpen: boolean;
};

let cachedStudentMenuData: StudentMenuCache | null = null;

const StudentMenu = () => {
  const { user } = useUser();
  const [lunchItems, setLunchItems] = useState<any[]>(cachedStudentMenuData?.lunchItems ?? []);
  const [dinnerItems, setDinnerItems] = useState<any[]>(cachedStudentMenuData?.dinnerItems ?? []);
  const [votingOpen, setVotingOpen] = useState(cachedStudentMenuData?.votingOpen ?? false);
  const [votedItems, setVotedItems] = useState<number[]>([]);
  const [loading, setLoading] = useState(!cachedStudentMenuData);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchMenu = useCallback(async (silent = false) => {
    const showInitialLoader = !silent && !cachedStudentMenuData;
    if (showInitialLoader) setLoading(true);
    try {
      // 1. Fetch Menu Items & Config
      const { data: menuData, error: menuError } = await supabase
        .from('menu_items')
        .select('id, name, category, votes, image_url')
        .order('id', { ascending: true });

      if (menuError) throw menuError;

      if (menuData) {
        const lunch = menuData.filter((i: any) => i.category === 'lunch');
        const dinner = menuData.filter((i: any) => i.category === 'dinner');
        const config = menuData.find((i: any) => i.category === 'config' && i.name === 'voting_status');
        const nextData = {
          lunchItems: lunch,
          dinnerItems: dinner,
          votingOpen: config ? config.votes === 1 : false,
        };

        cachedStudentMenuData = nextData;
        setLunchItems(nextData.lunchItems);
        setDinnerItems(nextData.dinnerItems);
        setVotingOpen(nextData.votingOpen);
      }
    } catch (error: any) {
      console.error("Error fetching menu:", error);
      if (!silent) toast({ title: "Failed to load menu", description: error.message, variant: "destructive" });
    } finally {
      if (showInitialLoader) setLoading(false);
    }
  }, []);

  const fetchUserVotes = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data: userVotes, error: votesError } = await supabase
        .from('votes')
        .select('menu_item_id')
        .eq('user_id', user.id);

      if (votesError) {
        console.error("Error fetching votes:", votesError);
      } else if (userVotes) {
        setVotedItems(userVotes.map((v: any) => v.menu_item_id));
      }
    } catch (error) {
      console.error("Error fetching user votes:", error);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchMenu();
    fetchUserVotes();
  }, [fetchMenu, fetchUserVotes]);

  useEffect(() => {
    // Optional: Realtime subscription for live vote counts
    const channel = supabase
      .channel('public:menu_items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => {
        fetchMenu(true); // Silent update ONLY for menu counts
      })
      .subscribe();

    // Cleanup function
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMenu]);

  const handleVote = async (item: any) => {
    if (!votingOpen || !user) return;

    // Prevent clicking the same item if already voted
    if (votedItems.includes(item.id)) return;

    try {
      const { error: voteError } = await supabase.rpc('vote_for_item', {
        item_id: item.id,
        category_name: item.category,
      });

      if (voteError) throw voteError;

      toast({
        title: "Vote Recorded!",
        description: `You voted for ${item.name}`,
      });

      // 5. Force Refresh of Full State
      await Promise.all([
        fetchMenu(true),
        fetchUserVotes()
      ]);

    } catch (error: any) {
      console.error("Voting error:", error);
      toast({
        title: "Vote Failed",
        description: error.message || "Could not place vote.",
        variant: 'destructive',
      });
      // Refresh to ensure we aren't showing bad state
      fetchMenu(true);
      fetchUserVotes();
    }
  };

  const renderMealSection = (title: string, items: any[], type: "lunch" | "dinner") => {
    const totalVotes = items.reduce((a, b) => a + b.votes, 0) || 1;
    const maxVotes = Math.max(...items.map(i => i.votes));
    const winners = items.filter(i => i.votes === maxVotes && maxVotes > 0);

    // Check if user has voted for ANY item in this category
    // We find if any item in this list is in the 'votedItems' array
    const hasVotedInCategory = items.some(i => votedItems.includes(i.id));

    return (
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            {title}
            {!votingOpen && winners.length > 0 && (
              <span className="bg-yellow-100 text-yellow-700 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold border border-yellow-200">
                Winner Decided
              </span>
            )}
          </h2>
        </div>

        <div className="space-y-3">
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm italic">No items available.</p>
          ) : (
            items.map((item) => {
              const isVotedByMe = votedItems.includes(item.id);
              const isWinner = !votingOpen && winners.some(w => w.id === item.id);
              const percentage = Math.round((item.votes / totalVotes) * 100);

              return (
                <button
                  key={item.id}
                  onClick={() => handleVote(item)}
                  // Allow switching: Only disable if voting is strictly CLOSED
                  disabled={!votingOpen}
                  className={`w-full relative overflow-hidden rounded-2xl border transition-all text-left group ${isWinner
                    ? "bg-yellow-50/50 border-yellow-200 ring-2 ring-yellow-400/20 shadow-sm"
                    : isVotedByMe
                      ? "bg-primary/5 border-primary ring-1 ring-primary/20"
                      : "bg-card border-border/50 hover:border-primary/30"
                    } p-4 disabled:opacity-70 disabled:cursor-not-allowed`}
                >    <div className="flex items-center gap-4 relative z-10">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors flex-shrink-0 ${isWinner
                        ? "bg-yellow-100 text-yellow-600"
                        : isVotedByMe
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                        }`}
                    >
                      {isWinner ? <Trophy className="w-5 h-5" /> : isVotedByMe ? <Check className="w-5 h-5" /> : <span className="text-xs font-semibold">{percentage}%</span>}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className={`font-semibold truncate ${isWinner ? "text-yellow-700" : ""}`}>
                          {item.name}
                        </span>
                        {isVotedByMe && <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">Voted</span>}
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-2 bg-muted/50 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${isWinner ? "bg-yellow-400" : isVotedByMe ? "bg-primary" : "bg-muted-foreground/30"
                            }`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0 min-w-[3rem]">
                      <span className={`text-lg font-bold block leading-none ${isWinner ? "text-yellow-700" : ""}`}>
                        {item.votes}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-medium uppercase">votes</span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  };

  const filteredLunch = lunchItems.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredDinner = dinnerItems.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  return (
    <>
      <PageShell
        title={votingOpen ? "Vote for Menu" : "Menu Decided"}
        subtitle={votingOpen ? "Tap to cast your vote 🗳️" : "The results are in! 🏆"}
      >
        {!votingOpen ? (
          <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-2xl p-5 mb-6 border border-yellow-100 shadow-sm">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                <Trophy className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <h3 className="font-bold text-yellow-900 mb-1">Voting is Closed</h3>
                <p className="text-sm text-yellow-700/80 leading-relaxed">
                  The menu has been finalized based on majority votes. Check out the winners below!
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-primary/5 rounded-2xl p-4 mb-6 border border-primary/10 flex items-center gap-3">
            <Clock className="w-5 h-5 text-primary" />
            <p className="text-sm font-medium text-primary">Voting closes at midnight. Cast your vote now!</p>
          </div>
        )}

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search menu items..."
            className="pl-9 h-12 rounded-xl bg-card border-border/50"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="pb-20">
          {renderMealSection("🍛 Lunch", filteredLunch, "lunch")}
          {renderMealSection("🍽️ Dinner", filteredDinner, "dinner")}
        </div>
      </PageShell>
      <StudentBottomNav />
    </>
  );
};

export default StudentMenu;
