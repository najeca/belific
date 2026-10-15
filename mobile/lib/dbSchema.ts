// The Postgres schema Belific's tables live in, inside the shared Belific
// Landis Proload Supabase project ("public" belongs to Landis). supabase.ts
// passes it to the client, so every table request carries the Accept-Profile
// (reads) or Content-Profile (writes) header that PostgREST needs to find the
// table. The schema must be listed under Data API, Exposed schemas.
export const DB_SCHEMA = 'belific';
