-- Gym sets can now be measured by time and/or distance (a run, a row, a
-- plank) instead of weight × reps. `measure` says which fields apply.
-- Existing rows become 'reps', which is what they all are today.
--
-- Run this BEFORE merging the gym-upgrades PR: the new app code writes these
-- columns, and saves would fail against the old table.

alter table gym_sets
  add column if not exists measure text not null default 'reps',
  add column if not exists duration_seconds integer,
  add column if not exists distance_m integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gym_sets_measure_check') then
    alter table gym_sets add constraint gym_sets_measure_check check (measure in ('reps', 'time'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gym_sets_time_values_check') then
    alter table gym_sets add constraint gym_sets_time_values_check
      check ((duration_seconds is null or duration_seconds >= 0) and (distance_m is null or distance_m >= 0));
  end if;
end $$;
