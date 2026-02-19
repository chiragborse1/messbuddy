
import { createClient } from '@supabase/supabase-js';

// Load keys from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Supabase URL or Anon Key is missing. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.");
    // Fallback for development/demo only - replace with actual keys
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

// Helper to check user session
export const getUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
};

// Helper to fetch user profile
export const getProfile = async (userId: string) => {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error) {
        console.error('Error fetching profile:', error);
        return null;
    }

    return data;
};
