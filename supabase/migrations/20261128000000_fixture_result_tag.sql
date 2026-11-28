-- Keeps the result tag picked on the result screen (Won / Drawn / Lost /
-- Abandoned). Until now only the score was saved and the tag re-derived from
-- it, so "Abandoned" was lost on save.
--
-- null means "work it out from the score", which is what every existing
-- fixture keeps doing: nothing already saved changes meaning.
--
-- Run this BEFORE merging the abandoned-tag PR: publishing a result writes
-- this column, and fails while it doesn't exist.

alter table fixtures add column if not exists result_tag text;

alter table fixtures drop constraint if exists fixtures_result_tag_check;
alter table fixtures add constraint fixtures_result_tag_check
  check (result_tag is null or result_tag in ('won', 'drawn', 'lost', 'abandoned'));
