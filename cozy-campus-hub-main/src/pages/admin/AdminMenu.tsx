import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageShell from "@/components/PageShell";
import AdminBottomNav from "@/components/AdminBottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  Image as ImageIcon,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Trash2,
  Trophy,
  User,
  X,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import {
  formatMenuDate,
  getMealTitle,
  getSessionStatusLabel,
  getTomorrowDateInputValue,
  getWinningSessionItemIds,
  mapMenuSessionItems,
  mealTypes,
  MenuCatalogItem,
  MenuSession,
  MenuSessionItem,
  MenuSessionItemRow,
  MenuSessionStatus,
  MealType,
  splitMenuItemsByMeal,
} from "@/lib/menu";

type AdminMenuCache = {
  selectedDate: string;
  session: MenuSession | null;
  sessionItems: MenuSessionItem[];
  catalog: MenuCatalogItem[];
};

type EditingItemState = {
  sessionItemId: number;
  menuItemId: number;
  name: string;
  imageUrl: string;
};

const sessionSelect = "id, service_date, title, status, voting_closes_at, created_at, updated_at";
const itemSelect = "id, session_id, menu_item_id, meal_type, position, menu_items(id, name, category, image_url)";
const initialSelectedCatalogIds: Record<MealType, string> = { lunch: "", dinner: "" };
const initialNewItems: Record<MealType, string> = { lunch: "", dinner: "" };

let cachedAdminMenuData: AdminMenuCache | null = null;

const getStatusClass = (status?: MenuSessionStatus | string | null) => {
  if (status === "voting_open") return "bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-300";
  if (status === "closed") return "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300";
  if (status === "published") return "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-300";
  if (status === "served") return "bg-muted text-muted-foreground border-border";
  return "bg-slate-500/10 text-slate-700 border-slate-500/20 dark:text-slate-300";
};

const AdminMenu = () => {
  const [selectedDate, setSelectedDate] = useState(cachedAdminMenuData?.selectedDate ?? getTomorrowDateInputValue());
  const [session, setSession] = useState<MenuSession | null>(cachedAdminMenuData?.session ?? null);
  const [sessionItems, setSessionItems] = useState<MenuSessionItem[]>(cachedAdminMenuData?.sessionItems ?? []);
  const [catalog, setCatalog] = useState<MenuCatalogItem[]>(cachedAdminMenuData?.catalog ?? []);
  const [loading, setLoading] = useState(!cachedAdminMenuData);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
  const [voters, setVoters] = useState<any[]>([]);
  const [loadingVoters, setLoadingVoters] = useState(false);
  const [newItems, setNewItems] = useState<Record<MealType, string>>(initialNewItems);
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<Record<MealType, string>>(initialSelectedCatalogIds);
  const [editingItem, setEditingItem] = useState<EditingItemState | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const groupedItems = useMemo(() => splitMenuItemsByMeal(sessionItems), [sessionItems]);
  const canManageItems = session?.status === "draft" || session?.status === "closed";

  const applyMenuData = useCallback((nextData: AdminMenuCache) => {
    cachedAdminMenuData = nextData;
    setSession(nextData.session);
    setSessionItems(nextData.sessionItems);
    setCatalog(nextData.catalog);
  }, []);

  const loadCatalog = useCallback(async () => {
    const { data, error } = await supabase
      .from("menu_items")
      .select("id, name, category, image_url")
      .in("category", mealTypes)
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;
    return (data || []) as MenuCatalogItem[];
  }, []);

  const ensureSession = useCallback(async (serviceDate: string) => {
    const { data, error } = await supabase
      .from("menu_sessions")
      .select(sessionSelect)
      .eq("service_date", serviceDate)
      .maybeSingle();

    if (error) throw error;
    if (data) return data as MenuSession;

    const { data: created, error: createError } = await supabase
      .from("menu_sessions")
      .insert({
        service_date: serviceDate,
        title: `${formatMenuDate(serviceDate)} menu`,
        status: "draft",
      })
      .select(sessionSelect)
      .single();

    if (createError) {
      if (createError.code === "23505") {
        const { data: existing, error: retryError } = await supabase
          .from("menu_sessions")
          .select(sessionSelect)
          .eq("service_date", serviceDate)
          .single();

        if (retryError) throw retryError;
        return existing as MenuSession;
      }

      throw createError;
    }

    return created as MenuSession;
  }, []);

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

    const { data: stats, error: statsError } = await supabase
      .from("menu_session_item_stats")
      .select("session_item_id, vote_count")
      .eq("session_id", sessionId)
      .in("session_item_id", rows.map((row) => row.id));

    if (statsError) throw statsError;

    const voteCounts = new Map((stats || []).map((stat: any) => [Number(stat.session_item_id), Number(stat.vote_count) || 0]));
    return mapMenuSessionItems(rows, voteCounts);
  }, []);

  const fetchMenu = useCallback(async (serviceDate = selectedDate, silent = false) => {
    const showInitialLoader = !silent && (!cachedAdminMenuData || cachedAdminMenuData.selectedDate !== serviceDate);
    if (showInitialLoader) setLoading(true);

    try {
      const nextSession = await ensureSession(serviceDate);
      const [nextItems, nextCatalog] = await Promise.all([
        loadSessionItems(nextSession.id),
        loadCatalog(),
      ]);

      applyMenuData({
        selectedDate: serviceDate,
        session: nextSession,
        sessionItems: nextItems,
        catalog: nextCatalog,
      });
    } catch (error: any) {
      console.error("Menu fetch error:", error);
      if (!silent) {
        toast({ title: "Failed to load menu", description: error.message, variant: "destructive" });
      }
    } finally {
      if (showInitialLoader) setLoading(false);
    }
  }, [applyMenuData, ensureSession, loadCatalog, loadSessionItems, selectedDate]);

  const scheduleSilentRefresh = useCallback((serviceDate: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      void fetchMenu(serviceDate, true);
    }, 250);
  }, [fetchMenu]);

  useEffect(() => {
    setExpandedItemId(null);
    setVoters([]);
    setEditingItem(null);
    void fetchMenu(selectedDate);

    const channel = supabase
      .channel(`admin_menu_sessions_${selectedDate}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_sessions" }, () => scheduleSilentRefresh(selectedDate))
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_session_items" }, () => scheduleSilentRefresh(selectedDate))
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_votes" }, () => scheduleSilentRefresh(selectedDate))
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, () => scheduleSilentRefresh(selectedDate))
      .subscribe();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchMenu, scheduleSilentRefresh, selectedDate]);

  const fetchVoters = async (sessionItemId: number) => {
    setLoadingVoters(true);
    setVoters([]);

    try {
      const { data, error } = await supabase
        .from("menu_votes")
        .select("user_id, profiles(name, email, photo_url)")
        .eq("session_item_id", sessionItemId)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      setVoters((data || []).map((vote: any) => ({
        id: vote.user_id,
        ...(Array.isArray(vote.profiles) ? vote.profiles[0] : vote.profiles),
      })));
    } catch (error: any) {
      toast({ title: "Failed to load voters", description: error.message, variant: "destructive" });
    } finally {
      setLoadingVoters(false);
    }
  };

  const handleExpand = (item: MenuSessionItem) => {
    setEditingItem(null);
    if (expandedItemId === item.id) {
      setExpandedItemId(null);
      setVoters([]);
      return;
    }

    setExpandedItemId(item.id);
    void fetchVoters(item.id);
  };

  const getNextPosition = (mealType: MealType) => groupedItems[mealType].length + 1;

  const addExistingItem = async (mealType: MealType) => {
    if (!session) return;

    const menuItemId = Number(selectedCatalogIds[mealType]);
    if (!menuItemId) {
      toast({ title: "Pick an item first", variant: "destructive" });
      return;
    }

    setActionLoading(`add-existing-${mealType}`);
    try {
      const { error } = await supabase.from("menu_session_items").insert({
        session_id: session.id,
        menu_item_id: menuItemId,
        meal_type: mealType,
        position: getNextPosition(mealType),
      });

      if (error) throw error;
      setSelectedCatalogIds((current) => ({ ...current, [mealType]: "" }));
      toast({ title: "Item added" });
      await fetchMenu(selectedDate, true);
    } catch (error: any) {
      toast({ title: "Could not add item", description: error.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const createAndAddItem = async (mealType: MealType) => {
    if (!session) return;

    const name = newItems[mealType].trim();
    if (!name) return;

    setActionLoading(`create-${mealType}`);
    try {
      const { data: item, error: itemError } = await supabase
        .from("menu_items")
        .insert({ name, category: mealType, votes: 0 })
        .select("id")
        .single();

      if (itemError) throw itemError;

      const { error: sessionItemError } = await supabase.from("menu_session_items").insert({
        session_id: session.id,
        menu_item_id: item.id,
        meal_type: mealType,
        position: getNextPosition(mealType),
      });

      if (sessionItemError) throw sessionItemError;

      setNewItems((current) => ({ ...current, [mealType]: "" }));
      toast({ title: "New menu item added" });
      await fetchMenu(selectedDate, true);
    } catch (error: any) {
      toast({ title: "Could not create item", description: error.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const removeSessionItem = async (sessionItemId: number) => {
    setActionLoading(`remove-${sessionItemId}`);
    try {
      const { error } = await supabase
        .from("menu_session_items")
        .delete()
        .eq("id", sessionItemId);

      if (error) throw error;
      toast({ title: "Removed from this menu" });
      await fetchMenu(selectedDate, true);
    } catch (error: any) {
      toast({ title: "Remove failed", description: error.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const saveItemEdits = async () => {
    if (!editingItem) return;

    const name = editingItem.name.trim();
    if (!name) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }

    setActionLoading(`edit-${editingItem.sessionItemId}`);
    try {
      const { error } = await supabase
        .from("menu_items")
        .update({
          name,
          image_url: editingItem.imageUrl.trim() || null,
        })
        .eq("id", editingItem.menuItemId);

      if (error) throw error;
      setEditingItem(null);
      toast({ title: "Item updated" });
      await fetchMenu(selectedDate, true);
    } catch (error: any) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const resetSessionVotes = async () => {
    if (!session) return;

    setActionLoading("reset-votes");
    try {
      const { error } = await supabase
        .from("menu_votes")
        .delete()
        .eq("session_id", session.id);

      if (error) throw error;
      toast({ title: "Votes reset", description: "Only this date's votes were cleared." });
      await fetchMenu(selectedDate, true);
      if (expandedItemId) void fetchVoters(expandedItemId);
    } catch (error: any) {
      toast({ title: "Reset failed", description: error.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const notifyWinners = async () => {
    if (!session) return;

    const lunchWinnerIds = getWinningSessionItemIds(groupedItems.lunch);
    const dinnerWinnerIds = getWinningSessionItemIds(groupedItems.dinner);
    const topLunch = groupedItems.lunch.find((item) => lunchWinnerIds.has(item.id));
    const topDinner = groupedItems.dinner.find((item) => dinnerWinnerIds.has(item.id));

    if (!topLunch && !topDinner) return;

    const body = [
      `${formatMenuDate(session.service_date)} menu is decided.`,
      topLunch ? `Lunch: ${topLunch.item.name}` : "",
      topDinner ? `Dinner: ${topDinner.item.name}` : "",
    ].filter(Boolean).join("\n");

    void supabase.functions.invoke("send-notification", {
      body: {
        title: "Voting Results Are In",
        body,
        image: topLunch?.item.image_url || topDinner?.item.image_url || "",
        topic: "all_students",
      },
    });
  };

  const updateSessionStatus = async (status: MenuSessionStatus) => {
    if (!session) return;
    if (status === "voting_open" && (groupedItems.lunch.length === 0 || groupedItems.dinner.length === 0)) {
      toast({
        title: "Add lunch and dinner first",
        description: "Voting should include at least one item in both sections.",
        variant: "destructive",
      });
      return;
    }

    setActionLoading(`status-${status}`);
    try {
      const { error } = await supabase
        .from("menu_sessions")
        .update({
          status,
          voting_closes_at: status === "voting_open" ? new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString() : session.voting_closes_at,
        })
        .eq("id", session.id);

      if (error) throw error;
      if (status === "closed") void notifyWinners();
      toast({ title: getSessionStatusLabel(status) });
      await fetchMenu(selectedDate, true);
    } catch (error: any) {
      toast({ title: "Status update failed", description: error.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const renderVoters = () => {
    if (loadingVoters) {
      return <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>;
    }

    if (voters.length === 0) {
      return <p className="text-xs text-muted-foreground italic">No votes yet.</p>;
    }

    return (
      <div className="flex flex-wrap gap-2">
        {voters.map((voter) => (
          <div key={voter.id} className="flex items-center gap-2 bg-muted/50 rounded-full pl-1 pr-3 py-1 border border-border/50">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden border border-background">
              {voter.photo_url ? (
                <img src={voter.photo_url} className="w-full h-full object-cover" alt={voter.name || "Voter"} />
              ) : (
                <User className="w-3 h-3 text-primary" />
              )}
            </div>
            <span className="text-xs font-medium max-w-[120px] truncate">{voter.name || "Unknown"}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderItemCard = (item: MenuSessionItem, winnerIds: Set<number>) => {
    const isExpanded = expandedItemId === item.id;
    const isEditing = editingItem?.sessionItemId === item.id;
    const isWinner = winnerIds.has(item.id);

    return (
      <div key={item.id} className={`bg-card rounded-xl border transition-all ${isExpanded ? "border-primary/50 shadow-md" : "border-border/50"}`}>
        <button
          type="button"
          className="w-full flex items-center gap-3 p-3 text-left"
          onClick={() => handleExpand(item)}
        >
          <div className="w-11 h-11 rounded-xl bg-muted overflow-hidden flex items-center justify-center shrink-0">
            {item.item.image_url ? (
              <img src={item.item.image_url} alt={item.item.name} className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold truncate">{item.item.name}</span>
              {isWinner && <Trophy className="w-4 h-4 text-amber-500 shrink-0" />}
            </div>
            <p className="text-xs text-muted-foreground">{item.voteCount} vote{item.voteCount === 1 ? "" : "s"}</p>
          </div>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        {isExpanded && (
          <div className="px-3 pb-3 border-t border-dashed border-border/50">
            <div className="py-3">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Voted By ({voters.length})</p>
              {renderVoters()}
            </div>

            {canManageItems && (
              <div className="space-y-3 pt-3 border-t border-border/50">
                {isEditing ? (
                  <>
                    <Input
                      value={editingItem.name}
                      onChange={(event) => setEditingItem((current) => current ? { ...current, name: event.target.value } : current)}
                      className="h-10 rounded-xl"
                      placeholder="Item name"
                    />
                    <Input
                      value={editingItem.imageUrl}
                      onChange={(event) => setEditingItem((current) => current ? { ...current, imageUrl: event.target.value } : current)}
                      className="h-10 rounded-xl"
                      placeholder="Image URL"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" className="rounded-xl gap-2" onClick={saveItemEdits} disabled={actionLoading === `edit-${item.id}`}>
                        {actionLoading === `edit-${item.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-xl gap-2" onClick={() => setEditingItem(null)}>
                        <X className="w-4 h-4" />
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl gap-2"
                      onClick={() => setEditingItem({
                        sessionItemId: item.id,
                        menuItemId: item.menuItemId,
                        name: item.item.name,
                        imageUrl: item.item.image_url || "",
                      })}
                    >
                      <Pencil className="w-4 h-4" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl gap-2 text-destructive hover:text-destructive"
                      onClick={() => removeSessionItem(item.id)}
                      disabled={actionLoading === `remove-${item.id}`}
                    >
                      {actionLoading === `remove-${item.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderMealSection = (mealType: MealType) => {
    const items = groupedItems[mealType];
    const winnerIds = getWinningSessionItemIds(items);
    const availableCatalog = catalog.filter((item) =>
      item.category === mealType && !items.some((sessionItem) => sessionItem.menuItemId === item.id)
    );

    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {getMealTitle(mealType)}
          </Label>
          <span className="text-xs text-muted-foreground">{items.length} items</span>
        </div>

        <div className="space-y-2">
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              No {mealType} items added for this date.
            </div>
          ) : (
            items.map((item) => renderItemCard(item, winnerIds))
          )}
        </div>

        {canManageItems && (
          <div className="rounded-xl border border-border/50 bg-card p-3 space-y-3">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                value={newItems[mealType]}
                onChange={(event) => setNewItems((current) => ({ ...current, [mealType]: event.target.value }))}
                placeholder={`Create ${mealType} item`}
                className="h-10 rounded-xl"
                onKeyDown={(event) => {
                  if (event.key === "Enter") void createAndAddItem(mealType);
                }}
              />
              <Button
                size="icon"
                variant="outline"
                className="rounded-xl h-10 w-10"
                onClick={() => createAndAddItem(mealType)}
                disabled={actionLoading === `create-${mealType}`}
                aria-label={`Create ${mealType} item`}
              >
                {actionLoading === `create-${mealType}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </Button>
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <select
                value={selectedCatalogIds[mealType]}
                onChange={(event) => setSelectedCatalogIds((current) => ({ ...current, [mealType]: event.target.value }))}
                className="h-10 rounded-xl bg-background border border-input px-3 text-sm"
              >
                <option value="">Add saved item...</option>
                {availableCatalog.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl h-10 gap-2"
                onClick={() => addExistingItem(mealType)}
                disabled={!selectedCatalogIds[mealType] || actionLoading === `add-existing-${mealType}`}
              >
                <Plus className="w-4 h-4" />
                Add
              </Button>
            </div>
          </div>
        )}
      </section>
    );
  };

  return (
    <>
      <PageShell
        title="Menu Studio"
        subtitle={session ? `${formatMenuDate(session.service_date)} · ${getSessionStatusLabel(session.status)}` : "Build daily menus"}
        action={
          <Button variant="outline" size="sm" className="gap-2" onClick={() => fetchMenu(selectedDate)} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      >
        <div className="pb-24 space-y-5">
          <section className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Service date</p>
                  <h2 className="font-bold truncate">{formatMenuDate(selectedDate)}</h2>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wide ${getStatusClass(session?.status)}`}>
                {getSessionStatusLabel(session?.status)}
              </span>
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="h-11 rounded-xl"
              />
              <Button variant="outline" className="h-11 rounded-xl" onClick={() => setSelectedDate(getTomorrowDateInputValue())}>
                Tomorrow
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {session?.status !== "voting_open" ? (
                <Button className="rounded-xl gap-2 col-span-2" onClick={() => updateSessionStatus("voting_open")} disabled={actionLoading === "status-voting_open"}>
                  {actionLoading === "status-voting_open" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Open Voting
                </Button>
              ) : (
                <Button variant="destructive" className="rounded-xl gap-2 col-span-2" onClick={() => updateSessionStatus("closed")} disabled={actionLoading === "status-closed"}>
                  {actionLoading === "status-closed" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  Close Voting
                </Button>
              )}

              <Button
                variant="outline"
                className="rounded-xl gap-2"
                onClick={() => updateSessionStatus(session?.status === "published" ? "served" : "published")}
                disabled={!session || session.status === "voting_open" || actionLoading?.startsWith("status-")}
              >
                {session?.status === "published" ? <Check className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {session?.status === "published" ? "Served" : "Publish"}
              </Button>
            </div>

            <Button
              variant="outline"
              className="w-full rounded-xl gap-2"
              onClick={resetSessionVotes}
              disabled={!session || sessionItems.length === 0 || actionLoading === "reset-votes"}
            >
              {actionLoading === "reset-votes" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              Reset Votes For This Date
            </Button>
          </section>

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-6 animate-slide-up">
              {renderMealSection("lunch")}
              {renderMealSection("dinner")}
            </div>
          )}
        </div>
      </PageShell>
      <AdminBottomNav />
    </>
  );
};

export default AdminMenu;
