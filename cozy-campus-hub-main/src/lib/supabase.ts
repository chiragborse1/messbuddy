
import { createClient } from '@supabase/supabase-js';
import { Preferences } from '@capacitor/preferences';

// Load keys from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Supabase URL or Anon Key is missing. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.");
}

// Custom storage adapter for Capacitor
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

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
    auth: {
        storage: capacitorStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
    },
});

// Helper to check user session
export const getUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
};

// Helper to fetch user profile
export const getProfile = async (userId: string) => {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, mobile, college, course, photo_url, role, status, plan, on_leave, plan_start_date, plan_end_date, pending_amount')
        .eq('id', userId)
        .single();

    if (error) {
        console.error('Error fetching profile:', error);
        return null;
    }

    return data;
};
