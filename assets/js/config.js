// ─────────────────────────────────────────────────────────────────────────────
// Configurazione client Mister Barber
//
// NOTA SICUREZZA — Supabase anon key:
//   La chiave anon è progettata da Supabase per essere pubblica (è un JWT con
//   role "anon"). La sicurezza è garantita dalle RLS policies sul database,
//   non dalla segretezza della chiave. Vedere docs.supabase.com/guides/auth/row-level-security
//
// NOTA SICUREZZA — EmailJS:
//   Le chiavi EmailJS sono state rimosse. L'email di conferma viene ora inviata
//   server-side da /api/book tramite Resend API (chiave in Cloudflare env vars).
// ─────────────────────────────────────────────────────────────────────────────
window.MB_CONFIG = {
  SUPABASE_URL: 'https://ccmpysycifufktbrkiot.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjbXB5c3ljaWZ1Zmt0YnJraW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NjA3NzYsImV4cCI6MjA5NDQzNjc3Nn0.G0qWDUmFHGuVsEqX3TqbW0ztyqxTwyyoPYqmluXGAMA',
  EDGE_FN_URL: 'https://ccmpysycifufktbrkiot.supabase.co/functions/v1/send-notification'
};
