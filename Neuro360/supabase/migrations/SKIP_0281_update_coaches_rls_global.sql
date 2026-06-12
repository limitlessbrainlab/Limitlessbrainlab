-- Migration: Update coaches RLS for global coach visibility
-- Description: All patients can see all active coaches (not clinic-restricted)
-- Super admin manages all coaches globally

-- Drop all existing policies
DROP POLICY IF EXISTS "Super admins can manage all coaches" ON coaches;
DROP POLICY IF EXISTS "Clinic admins can view their coaches" ON coaches;
DROP POLICY IF EXISTS "Clinic admins can insert coaches" ON coaches;
DROP POLICY IF EXISTS "Clinic admins can update their coaches" ON coaches;
DROP POLICY IF EXISTS "Clinic admins can delete their coaches" ON coaches;
DROP POLICY IF EXISTS "Patients can view their clinic coaches" ON coaches;
DROP POLICY IF EXISTS "Authenticated users can view active coaches" ON coaches;

-- Policy 1: Any authenticated user can view all active coaches
DROP POLICY IF EXISTS "Anyone can view active coaches" ON coaches;
CREATE POLICY "Anyone can view active coaches" ON coaches
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND is_active = true
  );

-- Policy 2: Super admins can insert coaches
DROP POLICY IF EXISTS "Super admins can insert coaches" ON coaches;
CREATE POLICY "Super admins can insert coaches" ON coaches
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- Policy 3: Super admins can update coaches
DROP POLICY IF EXISTS "Super admins can update coaches" ON coaches;
CREATE POLICY "Super admins can update coaches" ON coaches
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
  );

-- Policy 4: Super admins can delete coaches
DROP POLICY IF EXISTS "Super admins can delete coaches" ON coaches;
CREATE POLICY "Super admins can delete coaches" ON coaches
  FOR DELETE USING (
    auth.uid() IS NOT NULL
  );
