import { useState, useEffect, useRef } from "react";
import PageShell from "@/components/PageShell";
import AdminBottomNav from "@/components/AdminBottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Send, Lock, RotateCcw, Loader2, ChevronDown, ChevronUp, User, Bell } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

const AdminMenu = () => {
  const [lunchItems, setLunchItems] = useState<any[]>([]);
  const [dinnerItems, setDinnerItems] = useState<any[]>([]);
  const [votingOpen, setVotingOpen] = useState(false);
  const [isAutoNotify, setIsAutoNotify] = useState(false);
  const [sendingNotification, setSendingNotification] = useState(false);
  const [loading, setLoading] = useState(true);

  const [newLunch, setNewLunch] = useState("");
  const [newDinner, setNewDinner] = useState("");

  // State for expanding items to see voters
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
  const [voters, setVoters] = useState<any[]>([]);
  const [loadingVoters, setLoadingVoters] = useState(false);
  const expandedItemIdRef = useRef<number | null>(null);

  useEffect(() => {
    expandedItemIdRef.current = expandedItemId;
  }, [expandedItemId]);

  const fetchMenu = async (silent = false) => {
    if (!silent) setLoading(true);
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .order('id', { ascending: true });

    if (data) {
      const lunch = data.filter((i: any) => i.category === 'lunch');
      const dinner = data.filter((i: any) => i.category === 'dinner');
      const configVote = data.find((i: any) => i.category === 'config' && i.name === 'voting_status');
      const configNotify = data.find((i: any) => i.category === 'config' && i.name === 'auto_notification');

      setLunchItems(lunch);
      setDinnerItems(dinner);
      setVotingOpen(configVote ? configVote.votes === 1 : false);
      setIsAutoNotify(configNotify ? configNotify.votes === 1 : false);
    }
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    fetchMenu();

    // 1. Listen for Vote Counts (Menu Items)
    const menuChannel = supabase
      .channel('admin_menu_updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menu_items' },
        () => fetchMenu(true) // Silent update
      )
      .subscribe();

    // 2. Listen for New Voters (Votes Table) to update the expanded list
    const votesChannel = supabase
      .channel('admin_votes_updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'votes' },
        (payload) => {
          // If we are currently viewing the item that just got a vote, refresh the list
          const currentExpandedId = expandedItemIdRef.current;
          if (currentExpandedId && (payload.new as any).menu_item_id === currentExpandedId) {
            fetchVoters(currentExpandedId);
          }
          // Or if a vote was removed
          else if (currentExpandedId && (payload.old as any).menu_item_id === currentExpandedId) {
            fetchVoters(currentExpandedId);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(menuChannel);
      supabase.removeChannel(votesChannel);
    };
  }, []); // Run only once on mount

  // NOTE: react-hooks/exhaustive-deps might warn if we depend on 'expandedItemId' but we want to reset listener? 
  // BETTER APPROACH: Use a ref or just refresh "if expandedItemId matches" logic inside the callback which captures state.
  // But closure staleness is real.
  // Let's keep it simple: Just listen to changes and if expandedItemId is not null, fetchVoters(expandedItemId).


  const fetchVoters = async (itemId: number) => {
    setLoadingVoters(true);
    setVoters([]);

    try {
      // We select user_id from votes, and join profiles to get user details
      const { data, error } = await supabase
        .from('votes')
        .select('user_id, profiles(name, email, photo_url)')
        .eq('menu_item_id', itemId);

      if (error) throw error;

      if (data) {
        // Flatten the structure for easier rendering
        const votersList = data.map((v: any) => ({
          id: v.user_id,
          ...v.profiles // Spread the profile details (name, email, photo)
        }));
        setVoters(votersList);
      }
    } catch (err: any) {
      console.error("Error fetching voters:", err);
      toast({ title: "Failed to load voters", description: err.message, variant: "destructive" });
    } finally {
      setLoadingVoters(false);
    }
  };

  const handleExpand = (itemId: number) => {
    if (expandedItemId === itemId) {
      setExpandedItemId(null);
      setVoters([]);
    } else {
      setExpandedItemId(itemId);
      fetchVoters(itemId);
    }
  };

  const addItem = async (type: "lunch" | "dinner") => {
    const name = type === "lunch" ? newLunch.trim() : newDinner.trim();
    if (!name) return;

    const { error } = await supabase
      .from('menu_items')
      .insert({ name, category: type, votes: 0 });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      if (type === "lunch") setNewLunch("");
      else setNewDinner("");
      fetchMenu();
    }
  };

  const removeItem = async (id: number) => {
    const { error } = await supabase
      .from('menu_items')
      .delete()
      .eq('id', id);

    if (error) {
      console.error("Delete failed:", error);
      toast({
        title: "Delete Failed",
        description: error.message || "Could not delete item. Check if votes exist.",
        variant: "destructive"
      });
    } else {
      fetchMenu();
      toast({ title: "Item Deleted", description: "Menu item removed successfully." });
    }
  };

  const toggleVoting = async (open: boolean) => {
    try {
      // 1. Check if config row exists
      const { data: existingConfig, error: fetchError } = await supabase
        .from('menu_items')
        .select('id')
        .eq('category', 'config')
        .eq('name', 'voting_status')
        .maybeSingle();

      if (fetchError) throw fetchError;

      let error;
      if (existingConfig) {
        // 2. Update existing
        const { error: updateError } = await supabase
          .from('menu_items')
          .update({ votes: open ? 1 : 0 })
          .eq('id', existingConfig.id);
        error = updateError;
      } else {
        // 3. Insert new
        const { error: insertError } = await supabase
          .from('menu_items')
          .insert({ category: 'config', name: 'voting_status', votes: open ? 1 : 0 });
        error = insertError;
      }

      if (error) throw error;

      setVotingOpen(open);
      toast({
        title: open ? "Voting Opened" : "Voting Closed",
        description: open ? "Students can now vote." : "Voting ended.",
      });

      // Notify Students of Menu Results when voting closes
      if (!open) {
        const fetchWinnersAndNotify = async () => {
          try {
            // Fetch top 1 lunch and top 1 dinner
            const { data: winners } = await supabase
              .from('menu_items')
              .select('name, category, image_url')
              .neq('category', 'config')
              .order('votes', { ascending: false });

            if (winners && winners.length > 0) {
              const topLunch = winners.find(i => i.category === 'lunch');
              const topDinner = winners.find(i => i.category === 'dinner');

              let message = "The menu has been decided!";
              if (topLunch && topDinner) {
                message = `Tomorrow's Special:\n🍱 Lunch: ${topLunch.name}\n🍽️ Dinner: ${topDinner.name}`;
              } else if (topLunch) {
                message = `Tomorrow's Lunch: ${topLunch.name}`;
              } else if (topDinner) {
                message = `Tomorrow's Dinner: ${topDinner.name}`;
              }

              supabase.functions.invoke('send-notification', {
                body: {
                  title: "🏆 Voting Results Are In!",
                  body: message,
                  image: topLunch?.image_url || topDinner?.image_url || "",
                  topic: "all_students"
                }
              });
            }
          } catch (e) {
            console.error("Failed to notify menu winners:", e);
          }
        };
        fetchWinnersAndNotify();
      }

      fetchMenu();

    } catch (err: any) {
      console.error("Toggle voting error:", err);
      toast({
        title: "Failed to update voting status",
        description: err.message,
        variant: "destructive"
      });
    }
  };


  const toggleAutoNotify = async (enabled: boolean) => {
    try {
      // Check config
      const { data: config } = await supabase
        .from('menu_items')
        .select('id')
        .eq('category', 'config')
        .eq('name', 'auto_notification')
        .maybeSingle();

      if (config) {
        await supabase.from('menu_items').update({ votes: enabled ? 1 : 0 }).eq('id', config.id);
      } else {
        await supabase.from('menu_items').insert({ category: 'config', name: 'auto_notification', votes: enabled ? 1 : 0 });
      }
      setIsAutoNotify(enabled);
      toast({ title: enabled ? "Auto-Notifications Enabled" : "Auto-Notifications Disabled" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleManualNotification = async () => {
    setSendingNotification(true);
    try {
      // Use direct fetch to diagnose the connection issue
      // The function lives at [SUPABASE_URL]/functions/v1/send-notifications
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const functionUrl = `${supabaseUrl}/functions/v1/send-notifications`;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      console.log("Invoking function at:", functionUrl);

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`, // Essential for Supabase Functions
        },
        body: JSON.stringify({ manual: true }),
      });

      // Handle non-JSON responses (like HTML error pages)
      const contentType = response.headers.get("content-type");
      let data;
      if (contentType && contentType.indexOf("application/json") !== -1) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(`Server returned non-JSON response: ${text || response.statusText}`);
      }

      if (!response.ok) {
        throw new Error(data.error || data.message || `Error ${response.status}: ${JSON.stringify(data)}`);
      }

      const sentCount = data.sent_count || 0;
      toast({
        title: "Notifications Sent",
        description: `Successfully noticed ${sentCount} students expiring soon.`,
        variant: sentCount > 0 ? "default" : "secondary"
      });

    } catch (err: any) {
      console.error("Manual notification error:", err);
      toast({
        title: "Failed to send",
        description: err.message, // This will now show the real error from the server
        variant: "destructive"
      });
    } finally {
      setSendingNotification(false);
    }
  };

  const resetVotes = async () => {
    const { error } = await supabase
      .from('menu_items')
      .update({ votes: 0 })
      .in('category', ['lunch', 'dinner']);

    // Clear votes table as well
    // Note: This requires a policy that allows admins to delete rows in 'votes'
    const { error: votesError } = await supabase.from('votes').delete().neq('id', 0);

    await toggleVoting(false);

    if (!error && !votesError) {
      toast({ title: "Votes Reset", description: "All votes cleared." });
      fetchMenu();
    } else {
      toast({ title: "Reset Partial", description: "Menu votes reset but voter logs might remain." });
      fetchMenu();
    }
  };

  const renderSection = (
    title: string,
    items: any[],
    newItem: string,
    setNewItem: (v: string) => void,
    type: "lunch" | "dinner"
  ) => (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-2">
        <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</Label>
        <span className="text-xs text-muted-foreground">{items.length} items</span>
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const isExpanded = expandedItemId === item.id;
          return (
            <div key={item.id} className={`bg-card rounded-xl border transition-all ${isExpanded ? 'border-primary/50 shadow-md' : 'border-border/50'}`}>
              <div
                className="flex items-center gap-3 p-3 cursor-pointer"
                onClick={() => handleExpand(item.id)}
              >
                <span className="flex-1 text-sm font-medium">{item.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold bg-secondary px-2 py-1 rounded-md">{item.votes} votes</span>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  {!votingOpen && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                      className="text-muted-foreground hover:text-destructive transition-colors px-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Voters List */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-0 border-t border-dashed border-border/50 mt-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider my-2">Voted By ({voters.length})</p>

                  {loadingVoters ? (
                    <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
                  ) : voters.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic pl-1">No votes yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {voters.map((voter, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-muted/50 rounded-full pl-1 pr-3 py-1 border border-border/50">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden border border-background">
                            {voter.photo_url ? (
                              <img src={voter.photo_url} className="w-full h-full object-cover" alt={voter.name} />
                            ) : (
                              <User className="w-3 h-3 text-primary" />
                            )}
                          </div>
                          <span className="text-xs font-medium max-w-[100px] truncate">{voter.name || "Unknown"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!votingOpen && (
          <div className="flex gap-2">
            <Input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Add menu item..."
              className="h-10 rounded-xl"
              onKeyDown={(e) => e.key === "Enter" && addItem(type)}
            />
            <Button size="icon" variant="outline" className="rounded-xl h-10 w-10" onClick={() => addItem(type)}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <PageShell title="Menu Management" subtitle={votingOpen ? "Voting is LIVE 🔴" : "Set tomorrow's menu"}>
        <div className="pb-20">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {renderSection("🍛 Lunch Options", lunchItems, newLunch, setNewLunch, "lunch")}
              {renderSection("🍽️ Dinner Options", dinnerItems, newDinner, setNewDinner, "dinner")}

              <div className="flex flex-col gap-3 mt-8">
                {!votingOpen ? (
                  <Button
                    onClick={() => toggleVoting(true)}
                    className="w-full h-12 rounded-xl font-semibold text-lg"
                  >
                    <Send className="w-5 h-5 mr-2" />
                    Start Voting
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    className="w-full h-12 rounded-xl font-semibold text-lg"
                    onClick={() => toggleVoting(false)}
                  >
                    <Lock className="w-5 h-5 mr-2" />
                    End Voting
                  </Button>
                )}

                {!votingOpen && (
                  <Button variant="outline" className="w-full h-12 rounded-xl" onClick={resetVotes}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Reset Votes
                  </Button>
                )}

                {/* Notification Controls */}
                {/* Notification Controls - DISABLED FOR NOW
                <div className="bg-card rounded-xl p-4 border border-border/50 mt-4 space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Bell className="w-4 h-4 text-purple-600" />
                    Notification Settings
                  </h3>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">Auto-Send at 9 AM</Label>
                      <p className="text-xs text-muted-foreground">Notify students 3 days before expiry</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={isAutoNotify}
                      onChange={(e) => toggleAutoNotify(e.target.checked)}
                      className="w-5 h-5 accent-primary"
                    />
                  </div>

                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={handleManualNotification}
                    disabled={sendingNotification}
                  >
                    {sendingNotification ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                    Send Reminders Now
                  </Button>
                </div>
                */}

              </div>
            </>
          )}
        </div>
      </PageShell>
      <AdminBottomNav />
    </>
  );
};

export default AdminMenu;
