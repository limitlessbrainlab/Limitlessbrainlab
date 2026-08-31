-- Add independent per-currency price visibility flags to neurosense_assessments.
-- Defaults to TRUE so existing rows keep their current behavior (a currency's
-- price row shows whenever the underlying price column is non-null).
ALTER TABLE public.neurosense_assessments
  ADD COLUMN IF NOT EXISTS show_aed_price BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS show_inr_price BOOLEAN DEFAULT TRUE;
