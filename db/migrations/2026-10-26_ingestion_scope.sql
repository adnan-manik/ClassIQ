-- External survey response identifiers are unique within an institution.
-- Sharing the global ILS instrument must not make one tenant's imports suppress
-- another tenant's responses. Existing data is retained.
BEGIN;
ALTER TABLE public.survey_responses
  DROP CONSTRAINT IF EXISTS survey_responses_instrument_id_external_response_id_key;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.survey_responses'::regclass
      AND conname = 'uq_survey_response_tenant_external'
  ) THEN
    ALTER TABLE public.survey_responses
      ADD CONSTRAINT uq_survey_response_tenant_external
      UNIQUE (institution_id, instrument_id, external_response_id);
  END IF;
END $$;
COMMIT;
