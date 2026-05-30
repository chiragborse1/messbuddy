export type MealType = "lunch" | "dinner";
export type MenuSessionStatus = "draft" | "voting_open" | "closed" | "published" | "served";

export interface MenuCatalogItem {
  id: number;
  name: string;
  category: MealType | string;
  image_url?: string | null;
}

export interface MenuSession {
  id: number;
  service_date: string;
  title?: string | null;
  status: MenuSessionStatus;
  voting_closes_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MenuSessionItemRow {
  id: number;
  session_id: number;
  menu_item_id: number;
  meal_type: MealType;
  position: number | null;
  menu_items?: MenuCatalogItem | MenuCatalogItem[] | null;
}

export interface MenuSessionItem {
  id: number;
  sessionId: number;
  menuItemId: number;
  mealType: MealType;
  position: number;
  item: MenuCatalogItem;
  voteCount: number;
  votedByMe: boolean;
}

export const mealTypes: MealType[] = ["lunch", "dinner"];

export const getDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getTodayDateInputValue = () => getDateInputValue(new Date());

export const getTomorrowDateInputValue = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return getDateInputValue(date);
};

export const formatMenuDate = (value?: string | null) => {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export const getSessionStatusLabel = (status?: MenuSessionStatus | string | null) => {
  if (status === "voting_open") return "Voting Open";
  if (status === "closed") return "Voting Closed";
  if (status === "published") return "Published";
  if (status === "served") return "Served";
  return "Draft";
};

export const normalizeMenuItem = (value: MenuCatalogItem | MenuCatalogItem[] | null | undefined): MenuCatalogItem | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
};

export const mapMenuSessionItems = (
  rows: MenuSessionItemRow[],
  voteCountsBySessionItem: Map<number, number>,
  votedSessionItemIds = new Set<number>(),
) => {
  return rows.flatMap((row) => {
    const item = normalizeMenuItem(row.menu_items);
    if (!item) return [];

    return [{
      id: Number(row.id),
      sessionId: Number(row.session_id),
      menuItemId: Number(row.menu_item_id),
      mealType: row.meal_type,
      position: Number(row.position ?? 0),
      item,
      voteCount: voteCountsBySessionItem.get(Number(row.id)) ?? 0,
      votedByMe: votedSessionItemIds.has(Number(row.id)),
    }];
  });
};

export const splitMenuItemsByMeal = (items: MenuSessionItem[]) => ({
  lunch: items.filter((item) => item.mealType === "lunch"),
  dinner: items.filter((item) => item.mealType === "dinner"),
});

export const getWinningSessionItemIds = (items: MenuSessionItem[]) => {
  const maxVotes = Math.max(0, ...items.map((item) => item.voteCount));
  if (maxVotes <= 0) return new Set<number>();
  return new Set(items.filter((item) => item.voteCount === maxVotes).map((item) => item.id));
};

export const getMealTitle = (mealType: MealType) => mealType === "lunch" ? "Lunch" : "Dinner";
