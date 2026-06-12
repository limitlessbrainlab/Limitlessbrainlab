-- =====================================================
-- Migration 016: Clinic Roles & Monthly Statements
-- =====================================================
-- Creates tables for:
-- - Role-based access control for clinic staff (clinic_roles)
-- - Monthly usage statements and invoices (monthly_statements)
-- - Permission management system
-- =====================================================

-- =====================================================
-- 1. CLINIC_ROLES TABLE
-- =====================================================
-- Manages multi-user access within clinics with granular permissions
CREATE TABLE IF NOT EXISTS clinic_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

    -- Role information
    role TEXT NOT NULL, -- owner, clinician, technician, billing_staff, receptionist
    role_name TEXT, -- Custom role name if applicable
    department TEXT, -- neurology, radiology, admin, etc.

    -- User details (denormalized for quick access)
    user_email TEXT NOT NULL,
    user_name TEXT,
    user_phone TEXT,

    -- Permissions (granular access control)
    permissions JSONB NOT NULL DEFAULT '{
        "patients": {
            "view": false,
            "create": false,
            "edit": false,
            "delete": false
        },
        "reports": {
            "view": false,
            "upload": false,
            "download": false,
            "delete": false,
            "request": false
        },
        "payments": {
            "view": false,
            "purchase": false,
            "view_history": false
        },
        "settings": {
            "view": false,
            "edit": false,
            "manage_users": false
        },
        "analytics": {
            "view": false
        }
    }'::JSONB,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_primary BOOLEAN DEFAULT FALSE, -- Primary admin cannot be removed
    email_verified BOOLEAN DEFAULT FALSE,

    -- Invitation details
    invitation_status TEXT DEFAULT 'pending', -- pending, accepted, expired, revoked
    invitation_sent_at TIMESTAMP WITH TIME ZONE,
    invitation_accepted_at TIMESTAMP WITH TIME ZONE,
    invitation_token TEXT UNIQUE,
    invitation_expires_at TIMESTAMP WITH TIME ZONE,

    -- Access tracking
    last_login_at TIMESTAMP WITH TIME ZONE,
    login_count INTEGER DEFAULT 0,
    last_activity_at TIMESTAMP WITH TIME ZONE,

    -- Administrative
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    activated_at TIMESTAMP WITH TIME ZONE,
    deactivated_at TIMESTAMP WITH TIME ZONE,
    deactivation_reason TEXT,

    -- Notes
    notes TEXT,

    CONSTRAINT valid_role CHECK (role IN (
        'owner', 'clinician', 'technician', 'billing_staff', 'receptionist', 'custom'
    )),
    CONSTRAINT valid_invitation_status CHECK (invitation_status IN (
        'pending', 'accepted', 'expired', 'revoked'
    )),
    CONSTRAINT unique_user_per_clinic UNIQUE (clinic_id, user_id)
);

-- Indexes
CREATE INDEX idx_clinic_roles_clinic_id ON clinic_roles(clinic_id);
CREATE INDEX idx_clinic_roles_user_id ON clinic_roles(user_id);
CREATE INDEX idx_clinic_roles_role ON clinic_roles(role);
CREATE INDEX idx_clinic_roles_active ON clinic_roles(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_clinic_roles_primary ON clinic_roles(is_primary) WHERE is_primary = TRUE;
CREATE INDEX idx_clinic_roles_invitation ON clinic_roles(invitation_token) WHERE invitation_token IS NOT NULL;

COMMENT ON TABLE clinic_roles IS 'Manages role-based access control for clinic staff members';
COMMENT ON COLUMN clinic_roles.permissions IS 'JSONB object defining granular permissions for this role';
COMMENT ON COLUMN clinic_roles.is_primary IS 'Primary owner cannot be removed or have permissions changed';


-- =====================================================
-- 2. MONTHLY_STATEMENTS TABLE
-- =====================================================
-- Stores monthly usage statements and invoices
CREATE TABLE IF NOT EXISTS monthly_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Period identification
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
    statement_month INTEGER NOT NULL CHECK (statement_month BETWEEN 1 AND 12),
    statement_year INTEGER NOT NULL CHECK (statement_year >= 2024),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Clinic information (denormalized snapshot)
    clinic_name TEXT NOT NULL,
    clinic_email TEXT NOT NULL,
    clinic_phone TEXT,
    clinic_address TEXT,

    -- Usage summary
    reports_purchased INTEGER NOT NULL DEFAULT 0,
    reports_used INTEGER NOT NULL DEFAULT 0,
    reports_remaining INTEGER NOT NULL DEFAULT 0,
    previous_balance INTEGER, -- Reports carried over from previous month

    -- Financial summary
    total_paid DECIMAL(12, 2) NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'INR',
    payment_count INTEGER DEFAULT 0,

    -- Package breakdown
    packages_purchased JSONB DEFAULT '[]'::JSONB, -- Array of { sku, name, price, reports, date }

    -- Report usage details
    reports_generated JSONB DEFAULT '[]'::JSONB, -- Array of { patient_name, report_type, date }
    daily_usage JSONB DEFAULT '{}'::JSONB, -- Object with date keys and usage counts

    -- Status
    statement_status TEXT DEFAULT 'draft', -- draft, finalized, sent, paid, overdue
    is_finalized BOOLEAN DEFAULT FALSE,

    -- Document generation
    pdf_generated BOOLEAN DEFAULT FALSE,
    pdf_url TEXT,
    pdf_generated_at TIMESTAMP WITH TIME ZONE,

    -- Email delivery
    email_sent BOOLEAN DEFAULT FALSE,
    email_sent_at TIMESTAMP WITH TIME ZONE,
    email_sent_to TEXT,
    email_delivery_status TEXT, -- delivered, bounced, failed

    -- Payment status
    payment_due_date DATE,
    payment_received_date DATE,
    payment_method TEXT, -- razorpay, bank_transfer, check

    -- Administrative
    generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    finalized_at TIMESTAMP WITH TIME ZONE,

    -- Audit trail
    revision_number INTEGER DEFAULT 1,
    previous_version_id UUID REFERENCES monthly_statements(id) ON DELETE SET NULL,

    -- Notes and comments
    internal_notes TEXT,
    public_notes TEXT, -- Visible to clinic

    CONSTRAINT valid_statement_status CHECK (statement_status IN (
        'draft', 'finalized', 'sent', 'paid', 'overdue'
    )),
    CONSTRAINT unique_clinic_month_year UNIQUE (clinic_id, statement_month, statement_year, revision_number)
);

-- Indexes
CREATE INDEX idx_monthly_statements_clinic_id ON monthly_statements(clinic_id);
CREATE INDEX idx_monthly_statements_period ON monthly_statements(statement_year DESC, statement_month DESC);
CREATE INDEX idx_monthly_statements_status ON monthly_statements(statement_status);
CREATE INDEX idx_monthly_statements_finalized ON monthly_statements(is_finalized) WHERE is_finalized = TRUE;
CREATE INDEX idx_monthly_statements_email_sent ON monthly_statements(email_sent) WHERE email_sent = FALSE;
CREATE INDEX idx_monthly_statements_payment_due ON monthly_statements(payment_due_date) WHERE payment_due_date IS NOT NULL;

COMMENT ON TABLE monthly_statements IS 'Monthly usage statements and invoices for clinics';
COMMENT ON COLUMN monthly_statements.revision_number IS 'Version number for amended statements';
COMMENT ON COLUMN monthly_statements.packages_purchased IS 'JSONB array of all packages purchased during the period';


-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE clinic_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_statements ENABLE ROW LEVEL SECURITY;


-- ========== CLINIC_ROLES RLS POLICIES ==========

-- Clinic staff can view roles in their clinic
DROP POLICY IF EXISTS "Clinic staff can view their clinic roles" ON clinic_roles;
CREATE POLICY "Clinic staff can view their clinic roles"
    ON clinic_roles
    FOR SELECT
    TO authenticated
    USING (
        clinic_id IN (
            SELECT id FROM clinics
            WHERE clinics.id::TEXT = auth.jwt()->>'organization_id'
        )
        OR user_id = auth.uid()
    );

-- Clinic owners can manage roles in their clinic
DROP POLICY IF EXISTS "Clinic owners can manage roles" ON clinic_roles;
CREATE POLICY "Clinic owners can manage roles"
    ON clinic_roles
    FOR ALL
    TO authenticated
    USING (
        clinic_id IN (
            SELECT clinic_id FROM clinic_roles
            WHERE user_id = auth.uid()
            AND role = 'owner'
            AND is_active = TRUE
        )
    )
    WITH CHECK (
        clinic_id IN (
            SELECT clinic_id FROM clinic_roles
            WHERE user_id = auth.uid()
            AND role = 'owner'
            AND is_active = TRUE
        )
    );

-- Super admins can view and manage all roles
DROP POLICY IF EXISTS "Super admins can manage all roles" ON clinic_roles;
CREATE POLICY "Super admins can manage all roles"
    ON clinic_roles
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'super_admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'super_admin'
        )
    );


-- ========== MONTHLY_STATEMENTS RLS POLICIES ==========

-- Clinics can view their own statements
DROP POLICY IF EXISTS "Clinics can view their own statements" ON monthly_statements;
CREATE POLICY "Clinics can view their own statements"
    ON monthly_statements
    FOR SELECT
    TO authenticated
    USING (
        clinic_id IN (
            SELECT id FROM clinics
            WHERE clinics.id::TEXT = auth.jwt()->>'organization_id'
        )
    );

-- Super admins can view and manage all statements
DROP POLICY IF EXISTS "Super admins can manage all statements" ON monthly_statements;
CREATE POLICY "Super admins can manage all statements"
    ON monthly_statements
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'super_admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'super_admin'
        )
    );


-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to check user permission
CREATE OR REPLACE FUNCTION check_permission(
    user_id_param UUID,
    clinic_id_param UUID,
    permission_path TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    user_permissions JSONB;
    has_permission BOOLEAN;
BEGIN
    -- Get user's permissions
    SELECT permissions INTO user_permissions
    FROM clinic_roles
    WHERE user_id = user_id_param
    AND clinic_id = clinic_id_param
    AND is_active = TRUE
    LIMIT 1;

    -- If no role found, no permission
    IF user_permissions IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Check the specific permission path (e.g., 'patients.view')
    has_permission := COALESCE(
        (user_permissions #>> string_to_array(permission_path, '.'))::BOOLEAN,
        FALSE
    );

    RETURN has_permission;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION check_permission IS 'Checks if user has specific permission for a clinic';


-- Function to get default permissions for a role
CREATE OR REPLACE FUNCTION get_default_permissions(role_type TEXT)
RETURNS JSONB AS $$
BEGIN
    RETURN CASE role_type
        WHEN 'owner' THEN '{
            "patients": {"view": true, "create": true, "edit": true, "delete": true},
            "reports": {"view": true, "upload": true, "download": true, "delete": true, "request": true},
            "payments": {"view": true, "purchase": true, "view_history": true},
            "settings": {"view": true, "edit": true, "manage_users": true},
            "analytics": {"view": true}
        }'::JSONB

        WHEN 'clinician' THEN '{
            "patients": {"view": true, "create": true, "edit": true, "delete": false},
            "reports": {"view": true, "upload": true, "download": true, "delete": false, "request": true},
            "payments": {"view": true, "purchase": false, "view_history": false},
            "settings": {"view": true, "edit": false, "manage_users": false},
            "analytics": {"view": true}
        }'::JSONB

        WHEN 'technician' THEN '{
            "patients": {"view": true, "create": false, "edit": false, "delete": false},
            "reports": {"view": true, "upload": true, "download": true, "delete": false, "request": false},
            "payments": {"view": false, "purchase": false, "view_history": false},
            "settings": {"view": false, "edit": false, "manage_users": false},
            "analytics": {"view": false}
        }'::JSONB

        WHEN 'billing_staff' THEN '{
            "patients": {"view": true, "create": false, "edit": false, "delete": false},
            "reports": {"view": true, "upload": false, "download": false, "delete": false, "request": false},
            "payments": {"view": true, "purchase": true, "view_history": true},
            "settings": {"view": false, "edit": false, "manage_users": false},
            "analytics": {"view": true}
        }'::JSONB

        WHEN 'receptionist' THEN '{
            "patients": {"view": true, "create": true, "edit": true, "delete": false},
            "reports": {"view": true, "upload": false, "download": false, "delete": false, "request": true},
            "payments": {"view": false, "purchase": false, "view_history": false},
            "settings": {"view": false, "edit": false, "manage_users": false},
            "analytics": {"view": false}
        }'::JSONB

        ELSE '{}'::JSONB
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION get_default_permissions IS 'Returns default permission set for a given role type';


-- Function to generate monthly statement
CREATE OR REPLACE FUNCTION generate_monthly_statement(
    clinic_id_param UUID,
    month_param INTEGER,
    year_param INTEGER
)
RETURNS UUID AS $$
DECLARE
    statement_id UUID;
    clinic_info RECORD;
    period_start_date DATE;
    period_end_date DATE;
    purchased_count INTEGER;
    used_count INTEGER;
    total_amount DECIMAL;
BEGIN
    -- Get clinic information
    SELECT * INTO clinic_info FROM clinics WHERE id = clinic_id_param;

    -- Calculate period dates
    period_start_date := make_date(year_param, month_param, 1);
    period_end_date := (period_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    -- Calculate reports purchased in this period
    SELECT
        COALESCE(SUM(reports), 0),
        COALESCE(SUM(amount), 0),
        COUNT(*)
    INTO purchased_count, total_amount, used_count
    FROM payment_history
    WHERE clinic_id = clinic_id_param
    AND created_at::DATE BETWEEN period_start_date AND period_end_date;

    -- Calculate reports used
    SELECT COUNT(*) INTO used_count
    FROM reports
    WHERE clinic_id = clinic_id_param
    AND created_at::DATE BETWEEN period_start_date AND period_end_date;

    -- Insert statement
    INSERT INTO monthly_statements (
        clinic_id,
        statement_month,
        statement_year,
        period_start,
        period_end,
        clinic_name,
        clinic_email,
        clinic_phone,
        clinic_address,
        reports_purchased,
        reports_used,
        reports_remaining,
        total_paid,
        payment_count,
        generated_by
    ) VALUES (
        clinic_id_param,
        month_param,
        year_param,
        period_start_date,
        period_end_date,
        clinic_info.name,
        clinic_info.email,
        clinic_info.phone,
        clinic_info.address,
        purchased_count,
        used_count,
        clinic_info.reports_allowed - clinic_info.reports_used,
        total_amount,
        purchased_count,
        auth.uid()
    )
    RETURNING id INTO statement_id;

    RETURN statement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION generate_monthly_statement IS 'Generates monthly usage statement for a clinic';


-- Trigger to update timestamps
CREATE TRIGGER clinic_roles_updated_at
    BEFORE UPDATE ON clinic_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER monthly_statements_updated_at
    BEFORE UPDATE ON monthly_statements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();


-- =====================================================
-- SUMMARY VIEWS FOR REPORTING
-- =====================================================

-- View to show clinic team overview
CREATE OR REPLACE VIEW clinic_team_overview AS
SELECT
    c.id AS clinic_id,
    c.name AS clinic_name,
    COUNT(cr.id) AS total_members,
    COUNT(cr.id) FILTER (WHERE cr.is_active = TRUE) AS active_members,
    COUNT(cr.id) FILTER (WHERE cr.role = 'owner') AS owners,
    COUNT(cr.id) FILTER (WHERE cr.role = 'clinician') AS clinicians,
    COUNT(cr.id) FILTER (WHERE cr.role = 'technician') AS technicians,
    COUNT(cr.id) FILTER (WHERE cr.invitation_status = 'pending') AS pending_invitations
FROM clinics c
LEFT JOIN clinic_roles cr ON c.id = cr.clinic_id
GROUP BY c.id, c.name;

COMMENT ON VIEW clinic_team_overview IS 'Overview of team members for each clinic';


-- View to show statement status overview
CREATE OR REPLACE VIEW statement_status_overview AS
SELECT
    statement_year,
    statement_month,
    COUNT(*) AS total_statements,
    COUNT(*) FILTER (WHERE statement_status = 'draft') AS draft_count,
    COUNT(*) FILTER (WHERE statement_status = 'finalized') AS finalized_count,
    COUNT(*) FILTER (WHERE statement_status = 'sent') AS sent_count,
    COUNT(*) FILTER (WHERE statement_status = 'paid') AS paid_count,
    COUNT(*) FILTER (WHERE statement_status = 'overdue') AS overdue_count,
    SUM(total_paid) AS total_revenue,
    SUM(reports_used) AS total_reports_used
FROM monthly_statements
GROUP BY statement_year, statement_month
ORDER BY statement_year DESC, statement_month DESC;

COMMENT ON VIEW statement_status_overview IS 'Overview of monthly statement statuses and revenue';


-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION check_permission TO authenticated;
GRANT EXECUTE ON FUNCTION get_default_permissions TO authenticated;
GRANT EXECUTE ON FUNCTION generate_monthly_statement TO authenticated;

-- Grant select on views
GRANT SELECT ON clinic_team_overview TO authenticated;
GRANT SELECT ON statement_status_overview TO authenticated;


-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- This migration creates:
-- ✅ clinic_roles table - Role-based access control for clinic staff
-- ✅ monthly_statements table - Monthly usage statements and invoices
-- ✅ RLS policies for security
-- ✅ Helper functions for permissions and statement generation
-- ✅ Default permission sets for different roles
-- ✅ Summary views for reporting
-- =====================================================
