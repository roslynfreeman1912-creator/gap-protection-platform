-- Reload PostgREST schema cache to recognize the self-referential FK
NOTIFY pgrst, 'reload schema';