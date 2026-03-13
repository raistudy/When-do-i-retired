import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://khhobnuljlbnosvgeppt.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoaG9ibnVsamxibm9zdmdlcHB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3OTE3NzgsImV4cCI6MjA4ODM2Nzc3OH0.r1Vt3Q58jGhx954a8NScaU6LnLXjx9-Pv70hJB2lBMo";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);