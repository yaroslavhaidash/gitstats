-- GitHub's contribution calendar returns every day of the year, and the snapshot stored all of
-- them: 943 of 1,101 rows carried a zero. Every reader already treats a missing day as zero
-- (`days.get(date) ?? 0`), and the snapshot no longer writes them.
DELETE FROM "daily_contributions" WHERE "contribution_count" = 0;
