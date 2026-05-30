import { supabase } from "@/lib/supabase";
import {
  getTodayDateInputValue,
  mapMenuSessionItems,
  MenuSession,
  MenuSessionItem,
  MenuSessionItemRow,
} from "@/lib/menu";

const sessionSelect = "id, service_date, title, status, voting_closes_at, created_at, updated_at";
const itemSelect = "id, session_id, menu_item_id, meal_type, position, menu_items(id, name, category, image_url)";

export const fetchNearestMenuSession = async (serviceDate = getTodayDateInputValue()) => {
  const exact = await supabase
    .from("menu_sessions")
    .select(sessionSelect)
    .eq("service_date", serviceDate)
    .maybeSingle();

  if (exact.error) throw exact.error;
  if (exact.data) return exact.data as MenuSession;

  const upcoming = await supabase
    .from("menu_sessions")
    .select(sessionSelect)
    .gte("service_date", serviceDate)
    .order("service_date", { ascending: true })
    .limit(1);

  if (upcoming.error) throw upcoming.error;
  return (upcoming.data?.[0] ?? null) as MenuSession | null;
};

export const fetchMenuSessionItems = async (sessionId: number) => {
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

  const stats = await supabase
    .from("menu_session_item_stats")
    .select("session_item_id, vote_count")
    .eq("session_id", sessionId)
    .in("session_item_id", rows.map((row) => row.id));

  if (stats.error) throw stats.error;

  const voteCounts = new Map((stats.data || []).map((stat: any) => [Number(stat.session_item_id), Number(stat.vote_count) || 0]));
  return mapMenuSessionItems(rows, voteCounts);
};

export const fetchFeaturedMenuItems = async (serviceDate?: string, limit = 3): Promise<MenuSessionItem[]> => {
  const session = await fetchNearestMenuSession(serviceDate);
  if (!session) return [];

  const items = await fetchMenuSessionItems(session.id);
  return [...items]
    .sort((left, right) => right.voteCount - left.voteCount || left.position - right.position)
    .slice(0, limit);
};
