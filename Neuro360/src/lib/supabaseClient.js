import { createClient } from '@supabase/supabase-js';

// Get Supabase configuration from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Please check your .env file.');
}

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    // Must match supabaseService.js — login writes the session under this key
    storageKey: 'neuro360-auth'
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'x-application': 'neuro360'
    }
  }
});

// Export convenience methods
export const auth = supabase.auth;
export const storage = supabase.storage;
export const db = supabase;

export default supabase;
