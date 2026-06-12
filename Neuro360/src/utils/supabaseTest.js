// Supabase Connection Test Utility
import supabase from '../lib/supabaseClient';

// Test Supabase connection and configuration
export const testSupabaseConnection = async () => {

  // Get environment variables
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;


  // Check if environment variables are set
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('ERROR: Supabase environment variables are missing!');
    return false;
  }

  // Check if using placeholder values
  if (supabaseUrl === 'https://placeholder.supabase.co' || supabaseAnonKey === 'placeholder-anon-key') {
    console.error('ERROR: Supabase environment variables are using placeholder values!');
    return false;
  }

  try {

    // Test connection by trying to fetch from a system table
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error('ERROR: Supabase connection test failed:', error.message);
      return false;
    }


    // Test database connection by checking if profiles table exists
    try {
      const { error: dbError } = await supabase
        .from('profiles')
        .select('count', { count: 'exact', head: true });

      if (dbError) {
        if (dbError.code === '42P01') {
          console.warn('WARNING: Database tables not found. Please run the migration script.');
        } else {
          console.error('ERROR: Database connection error:', dbError.message);
        }
        return false;
      }


    } catch (dbError) {
      console.error('ERROR: Database test failed:', dbError.message);
      return false;
    }

    return true;

  } catch (error) {
    console.error('ERROR: Supabase client creation failed:', error.message);
    return false;
  }
};

// Export for use in other components
export default testSupabaseConnection;