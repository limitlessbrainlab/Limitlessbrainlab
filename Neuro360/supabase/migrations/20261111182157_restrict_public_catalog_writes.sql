-- Public catalog reads and form submissions remain available; management is admin-only.
BEGIN;
DO $$
DECLARE tbl text; pol record; catalog boolean; form boolean;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'brain_courses','neurosense_assessments','patient_content_pages','patient_content_sections',
    'patient_content_items','patient_content_settings','brain_parameters','brain_quotes','brain_regions',
    'brain_tips','clinic_locations','coaches','consent_templates','preferred_locations','pricing_config',
    'product_catalog','static_pages','franchise_inquiries','clinic_enquiries','contact_inquiries',
    'demo_report_requests','professional_onboarding','program_inquiries','org_memberships','system_settings'
  ] LOOP
    IF to_regclass('public.'||tbl) IS NULL THEN CONTINUE; END IF;
    form := tbl = ANY(ARRAY['franchise_inquiries','clinic_enquiries','contact_inquiries',
      'demo_report_requests','professional_onboarding','program_inquiries']);
    catalog := NOT form AND tbl NOT IN ('org_memberships','system_settings');
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=tbl LOOP
      EXECUTE format('DROP POLICY %I ON public.%I',pol.policyname,tbl);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
    EXECUTE format('CREATE POLICY admin_manage ON public.%I FOR ALL TO authenticated USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()))',tbl);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon',tbl);
    IF catalog THEN
      EXECUTE format('GRANT SELECT ON public.%I TO anon,authenticated',tbl);
      EXECUTE format('CREATE POLICY catalog_read ON public.%I FOR SELECT TO anon,authenticated USING (true)',tbl);
    ELSIF form THEN
      EXECUTE format('GRANT INSERT ON public.%I TO anon,authenticated',tbl);
      EXECUTE format('CREATE POLICY form_submit ON public.%I FOR INSERT TO anon,authenticated WITH CHECK (true)',tbl);
    END IF;
  END LOOP;
END $$;
COMMIT;
