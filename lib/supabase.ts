import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dabpwmhmkodrvakalsnv.supabase.co';

const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhYnB3bWhta29kcnZha2Fsc252Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDgwNDcsImV4cCI6MjA5NTkyNDA0N30.m3Z9hORvSbPVfJwjuyR4vRWcmzNd6y0kPUy3seO12i8';

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);