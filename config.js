// ============================================================
// Supabase connection config
// Get these two values from: Supabase Dashboard > Project Settings > API
// ============================================================
const SUPABASE_URL = 'ofuxqgjfommudvftgrwh';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mdXhxZ2pmb21tdWR2ZnRncndoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwODkyMTMsImV4cCI6MjEwMTY2NTIxM30.7MsA2vw1g0soLUDP5xJ6mxlRCfhBEKXH0RqGaESUQV8';

// Shared client used by both login.js and app.js
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
