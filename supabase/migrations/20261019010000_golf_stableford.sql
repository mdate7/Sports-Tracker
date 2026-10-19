-- Golf: stroke index, playing handicap and Stableford points.
-- Only adds columns; existing rounds keep working with them empty.
--
-- courses.stroke_index_per_hole  saved once per course, like par_per_hole
-- golf_holes.stroke_index        the SI used for that hole in that round
-- golf_details.playing_handicap  entered per round; negative = plus handicap
-- golf_details.stableford_points total for the round (null if it couldn't be
--                                worked out, e.g. no handicap given)

alter table courses      add column if not exists stroke_index_per_hole integer[];
alter table golf_holes   add column if not exists stroke_index integer;
alter table golf_details add column if not exists playing_handicap integer,
                         add column if not exists stableford_points integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'golf_holes_stroke_index_check') then
    alter table golf_holes add constraint golf_holes_stroke_index_check
      check (stroke_index is null or stroke_index between 1 and 18);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'golf_details_playing_handicap_check') then
    alter table golf_details add constraint golf_details_playing_handicap_check
      check (playing_handicap is null or playing_handicap between -10 and 54);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'golf_details_stableford_points_check') then
    alter table golf_details add constraint golf_details_stableford_points_check
      check (stableford_points is null or stableford_points between 0 and 150);
  end if;
end $$;
