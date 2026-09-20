-- Teachers sign in with their school email address instead of a username, so
-- the column becomes `email` rather than gaining a second identity beside it —
-- two unique keys for one person is two ways to be signed in as them.
--
-- The existing usernames were local parts ("asha"), so the school domain is
-- appended to anything that isn't already an address. If two rows collide once
-- lowercased, recreating the unique index below fails and the migration aborts
-- with both rows intact: that is a duplicate account somebody has to merge by
-- hand, not something to silently resolve here.

DROP INDEX "Teacher_username_key";

ALTER TABLE "Teacher" RENAME COLUMN "username" TO "email";

UPDATE "Teacher"
SET "email" = lower("email") || '@ncfe.ac.in'
WHERE "email" NOT LIKE '%@%';

UPDATE "Teacher" SET "email" = lower(btrim("email"));

CREATE UNIQUE INDEX "Teacher_email_key" ON "Teacher"("email");
