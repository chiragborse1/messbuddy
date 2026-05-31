
import { createClient } from '@supabase/supabase-js';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import type { UserData } from '@/contexts/user';

// Load keys from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Supabase URL or Anon Key is missing. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.");
}

export const PROFILE_SELECT = 'id, name, email, mobile, college, course, photo_url, role, status, plan, on_leave, plan_start_date, plan_end_date, pending_amount';
const LEGACY_PROFILE_SELECT = 'id, name, email, mobile, college, course, photo_url, role, status, plan';

const isMissingColumnError = (error: any) => error?.code === '42703';

// Custom storage adapter for native Capacitor builds.
const capacitorStorage = {
    getItem: async (key: string) => {
        const { value } = await Preferences.get({ key });
        return value;
    },
    setItem: async (key: string, value: string) => {
        await Preferences.set({ key, value });
    },
    removeItem: async (key: string) => {
        await Preferences.remove({ key });
    },
};

const authStorage = Capacitor.isNativePlatform() ? capacitorStorage : undefined;

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
    auth: {
        ...(authStorage ? { storage: authStorage } : {}),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
    },
});

export const mapProfileRowToUser = (data: any): UserData => ({
    ...data,
    planStartDate: data?.plan_start_date ?? data?.planStartDate,
    planEndDate: data?.plan_end_date ?? data?.planEndDate,
    photo: data?.photo_url ?? data?.photo,
    onLeave: Boolean(data?.on_leave ?? data?.onLeave ?? false),
    pendingAmount: Number(data?.pending_amount ?? data?.pendingAmount ?? 0),
    daysRemaining: (['active', 'approved'].includes(data?.status) && data?.plan_end_date)
        ? Math.max(0, Math.ceil((new Date(data.plan_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : 0,
});

// Helper to check user session
export const getUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
};

// Helper to fetch user profile
export const getProfile = async (userId: string) => {
    let profileResult: { data: any; error: any } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('id', userId)
        .single();

    if (isMissingColumnError(profileResult.error)) {
        const fallback = await supabase
            .from('profiles')
            .select(LEGACY_PROFILE_SELECT)
            .eq('id', userId)
            .single();

        profileResult = { data: fallback.data, error: fallback.error };
    }

    if (profileResult.error) {
        console.error('Error fetching profile:', profileResult.error);
        return null;
    }

    return mapProfileRowToUser(profileResult.data);
};
