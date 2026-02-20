import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

export interface UserData {
    id: string;
    name: string;
    email: string;
    mobile: string;
    college: string;
    course: string;
    photo?: string;
    role: "student" | "admin" | "developer";
    status?: "active" | "pending" | "expired" | "approved" | "rejected" | "on-leave" | "suspended" | string;
    daysRemaining?: number; // Calculated or stored
    plan?: string;
    onLeave?: boolean;
    planEndDate?: string;
}

interface UserContextType {
    user: UserData | null;
    loading: boolean;
    login: (userData: UserData) => void;
    logout: () => Promise<void>;
    updateUser: (userData: Partial<UserData>) => Promise<void>;
    refreshProfile: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<UserData | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchProfile = async (userId: string, showToast = false) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (data) {
                // Map DB fields to UserData interface if needed (snake_case to camelCase)
                // Assuming DB uses similar names or we map them here
                setUser({
                    ...data,
                    // map snake_case to camelCase
                    planEndDate: data.plan_end_date,
                    photo: data.photo_url,
                    daysRemaining: (['active', 'approved'].includes(data.status) && data.plan_end_date)
                        ? Math.max(0, Math.ceil((new Date(data.plan_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                        : 0,
                });
                if (showToast) {
                    toast({ title: "Profile Refreshed", description: "Your data is now up-to-date." });
                }
            } else if (error) {
                console.error("Error fetching profile:", error);
                if (showToast) {
                    toast({ title: "Refresh Failed", description: "Could not fetch latest data.", variant: "destructive" });
                }
            }
        } catch (err) {
            console.error(err);
            if (showToast) {
                toast({ title: "Refresh Error", description: "Check your internet connection.", variant: "destructive" });
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Check active session
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                fetchProfile(session.user.id);
            } else {
                setLoading(false);
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session) {
                fetchProfile(session.user.id);
            } else {
                setUser(null);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    // Realtime Profile Updates
    useEffect(() => {
        if (!user?.id) return;

        const channel = supabase
            .channel(`profile_updates_${user.id}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
                () => {
                    fetchProfile(user.id);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id]);

    const login = (userData: UserData) => {
        // Manual override if needed, but usually redundant with onAuthStateChange
        setUser(userData);
    };

    const logout = async () => {
        await supabase.auth.signOut();
        setUser(null);
        localStorage.removeItem("user"); // clear legacy
        toast({ title: "Logged out", description: "See you next time!" });
    };

    const updateUser = async (updates: Partial<UserData>) => {
        if (!user) return;

        // Optimistic update
        setUser({ ...user, ...updates });

        // Map updates to DB columns
        const dbUpdates: any = {};
        if (updates.name) dbUpdates.name = updates.name;
        if (updates.mobile) dbUpdates.mobile = updates.mobile;
        if (updates.college) dbUpdates.college = updates.college;
        if (updates.course) dbUpdates.course = updates.course;
        if (updates.photo) dbUpdates.photo_url = updates.photo;
        if (updates.status) dbUpdates.status = updates.status;
        if (updates.plan) dbUpdates.plan = updates.plan;

        const { error } = await supabase
            .from('profiles')
            .update(dbUpdates)
            .eq('id', user.id);

        if (error) {
            console.error("Error updating profile:", error);
            toast({
                title: "Update failed",
                description: error.message,
                variant: "destructive"
            });
            // Revert optimistic update? For now, we leave it or refetch
            fetchProfile(user.id);
        } else {
            toast({ title: "Profile updated" });
        }
    };

    const refreshProfile = async () => {
        if (user) await fetchProfile(user.id, true);
    }

    return (
        <UserContext.Provider value={{ user, loading, login, logout, updateUser, refreshProfile }}>
            {children}
        </UserContext.Provider>
    );
};

export const useUser = () => {
    const context = useContext(UserContext);
    if (context === undefined) {
        throw new Error("useUser must be used within a UserProvider");
    }
    return context;
};
