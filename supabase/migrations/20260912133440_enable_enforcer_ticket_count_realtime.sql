-- Let the Administrator registry receive ticket and roster changes immediately.
do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'violations'
  ) then
    alter publication supabase_realtime add table public.violations;
  end if;

  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'traffic_enforcers'
  ) then
    alter publication supabase_realtime add table public.traffic_enforcers;
  end if;
end
$$;
