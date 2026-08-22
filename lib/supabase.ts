import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dabpwmhmkodrvakalsnv.supabase.co';

const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhYnB3bWhta29kcnZha2Fsc252Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDgwNDcsImV4cCI6MjA5NTkyNDA0N30.m3Z9hORvSbPVfJwjuyR4vRWcmzNd6y0kPUy3seO12i8';

/**
 * These four are the library's defaults, set explicitly because the web auth
 * flow depends on them and a silent upstream change would be very hard to
 * trace from the symptom (login "works" but the user is signed out on reload).
 *
 * `detectSessionInUrl` is the one doing real work on web: after Google or a
 * password-reset link redirects back, Supabase reads the tokens out of the URL
 * itself, stores the session, and strips them from the address bar. That is
 * why the callback route below only has to wait for a session rather than
 * parse anything.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Left as the library default. PKCE is generally preferable for an SPA,
    // but it stores a code verifier on the device that started the flow —
    // which breaks the common case of opening a password-reset email on a
    // different device from the one that requested it.
    flowType: 'implicit',
  },
});
