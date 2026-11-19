-- Academic placement fields on students: program, batch (intake), current semester.
-- All nullable so existing roster rows and CSV/ingestion paths keep working.
-- Safe to re-run.
BEGIN;

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS program          TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS batch            TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS current_semester SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'students_current_semester_range'
      AND conrelid = 'public.students'::regclass
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_current_semester_range
      CHECK (current_semester IS NULL OR current_semester BETWEEN 1 AND 12);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_students_program ON public.students(institution_id, program);

COMMIT;

-- Let PostgREST (browser reads) pick up the new columns immediately.
NOTIFY pgrst, 'reload schema';
