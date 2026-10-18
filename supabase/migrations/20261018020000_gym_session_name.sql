-- Optional name for a gym session ("Push day", "Legs"). Sessions without one
-- are titled by the muscle groups trained. Safe to run whether or not the
-- timed-sets migration (20261018000000) has already been pushed.

alter table gym_details
  add column if not exists name text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gym_details_name_length_check') then
    alter table gym_details add constraint gym_details_name_length_check check (name is null or char_length(name) <= 60);
  end if;
end $$;
