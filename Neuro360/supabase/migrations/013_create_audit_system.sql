-- =====================================================
-- Migration 013: Audit System Tables
-- =====================================================
-- Creates comprehensive audit logging system for:
-- - System-wide activity tracking (audit_logs)
-- - Report download tracking (download_logs)
-- - Patient portal access tracking (access_logs)
-- =====================================================

-- =====================================================
-- 1. AUDIT_LOGS TABLE
-- =====================================================
-- Tracks all system-wide user actions for compliance
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User identification
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    user_role TEXT, -- super_admin, clinic_admin, clinician, technician, patient

    -- Action details
    action TEXT NOT NULL, -- e.g., 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'DOWNLOAD'
    entity_type TEXT NOT NULL, -- e.g., 'clinic', 'patient', 'report', 'payment', 'user'
    entity_id TEXT, -- ID of the affected entity

    -- Change tracking
    old_value JSONB, -- Previous state of the entity
    new_value JSONB, -- New state of the entity
    changes JSONB, -- Specific fields that changed

    -- Request metadata
    ip_address TEXT,
    user_agent TEXT,
    request_method TEXT, -- GET, POST, PUT, DELETE
    request_url TEXT,

    -- Additional context
    description TEXT,
    severity TEXT DEFAULT 'info', -- info, warning, error, critical
    status TEXT DEFAULT 'success', -- success, failure, pending

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Indexes for fast querying
    CONSTRAINT valid_action CHECK (action IN (
        'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'VIEW',
        'DOWNLOAD', 'UPLOAD', 'EXPORT', 'IMPORT', 'ACTIVATE', 'DEACTIVATE'
    )),
    CONSTRAINT valid_severity CHECK (severity IN ('info', 'warning', 'error', 'critical'))
);

-- Indexes for performance
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_user_role ON audit_logs(user_role);
CREATE INDEX idx_audit_logs_severity ON audit_logs(severity);

-- Full-text search index for descriptions
CREATE INDEX idx_audit_logs_description_search ON audit_logs USING GIN(to_tsvector('english', description));

COMMENT ON TABLE audit_logs IS 'System-wide audit trail for all user actions and data changes';
COMMENT ON COLUMN audit_logs.old_value IS 'JSONB snapshot of entity state before change';
COMMENT ON COLUMN audit_logs.new_value IS 'JSONB snapshot of entity state after change';
COMMENT ON COLUMN audit_logs.changes IS 'JSONB object showing specific fields that changed';


-- =====================================================
-- 2. DOWNLOAD_LOGS TABLE
-- =====================================================
-- Tracks all report downloads with consent information
CREATE TABLE IF NOT EXISTS download_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Report and user references
    report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,

    -- Downloader information
    downloaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    downloader_role TEXT, -- clinic_admin, clinician, patient, super_admin
    downloader_email TEXT,

    -- Consent information
    consent_accepted BOOLEAN DEFAULT FALSE,
    consent_version TEXT, -- Version of consent text accepted
    consent_timestamp TIMESTAMP WITH TIME ZONE,
    consent_id UUID, -- Reference to consent_records table (will be created in next migration)

    -- Download details
    file_name TEXT,
    file_path TEXT,
    file_size BIGINT, -- File size in bytes
    download_method TEXT DEFAULT 'direct', -- direct, email, api

    -- Request metadata
    ip_address TEXT,
    user_agent TEXT,
    device_type TEXT, -- mobile, tablet, desktop
    browser TEXT,

    -- Status and validation
    download_status TEXT DEFAULT 'completed', -- initiated, in_progress, completed, failed
    error_message TEXT,

    -- Timestamps
    initiated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Compliance flags
    hipaa_compliant BOOLEAN DEFAULT TRUE,
    encrypted BOOLEAN DEFAULT TRUE,
    watermarked BOOLEAN DEFAULT TRUE,

    CONSTRAINT valid_download_status CHECK (download_status IN ('initiated', 'in_progress', 'completed', 'failed')),
    CONSTRAINT valid_downloader_role CHECK (downloader_role IN ('super_admin', 'clinic_admin', 'clinician', 'technician', 'patient'))
);

-- Indexes for performance
CREATE INDEX idx_download_logs_report_id ON download_logs(report_id);
CREATE INDEX idx_download_logs_patient_id ON download_logs(patient_id);
CREATE INDEX idx_download_logs_clinic_id ON download_logs(clinic_id);
CREATE INDEX idx_download_logs_downloaded_by ON download_logs(downloaded_by);
CREATE INDEX idx_download_logs_initiated_at ON download_logs(initiated_at DESC);
CREATE INDEX idx_download_logs_consent_accepted ON download_logs(consent_accepted);
CREATE INDEX idx_download_logs_downloader_role ON download_logs(downloader_role);

COMMENT ON TABLE download_logs IS 'Tracks all report downloads with consent and compliance metadata';
COMMENT ON COLUMN download_logs.consent_version IS 'Version identifier of the consent text that was accepted';
COMMENT ON COLUMN download_logs.hipaa_compliant IS 'Flag indicating if download met HIPAA compliance requirements';


-- =====================================================
-- 3. ACCESS_LOGS TABLE
-- =====================================================
-- Tracks patient portal access and data viewing
CREATE TABLE IF NOT EXISTS access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User identification
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    user_email TEXT,
    user_role TEXT DEFAULT 'patient',

    -- Access details
    action TEXT NOT NULL, -- VIEW_DASHBOARD, VIEW_REPORT, VIEW_PROFILE, UPDATE_PROFILE
    resource_type TEXT, -- report, profile, consent, appointment
    resource_id UUID, -- ID of the accessed resource
    resource_name TEXT,

    -- Session information
    session_id TEXT,
    session_duration INTEGER, -- Duration in seconds

    -- Request metadata
    ip_address TEXT,
    user_agent TEXT,
    device_type TEXT,
    browser TEXT,
    operating_system TEXT,
    location_country TEXT,
    location_city TEXT,

    -- Access status
    access_granted BOOLEAN DEFAULT TRUE,
    denial_reason TEXT,

    -- Security flags
    mfa_verified BOOLEAN DEFAULT FALSE,
    suspicious_activity BOOLEAN DEFAULT FALSE,
    risk_score INTEGER DEFAULT 0, -- 0-100, higher = more risky

    -- Timestamps
    accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT valid_access_action CHECK (action IN (
        'VIEW_DASHBOARD', 'VIEW_REPORT', 'VIEW_PROFILE', 'UPDATE_PROFILE',
        'DOWNLOAD_REPORT', 'REQUEST_APPOINTMENT', 'ACCEPT_CONSENT',
        'VIEW_CONSENT', 'VIEW_HISTORY', 'SEARCH', 'FILTER'
    ))
);

-- Indexes for performance
CREATE INDEX idx_access_logs_user_id ON access_logs(user_id);
CREATE INDEX idx_access_logs_patient_id ON access_logs(patient_id);
CREATE INDEX idx_access_logs_action ON access_logs(action);
CREATE INDEX idx_access_logs_resource_type ON access_logs(resource_type);
CREATE INDEX idx_access_logs_accessed_at ON access_logs(accessed_at DESC);
CREATE INDEX idx_access_logs_suspicious ON access_logs(suspicious_activity) WHERE suspicious_activity = TRUE;
CREATE INDEX idx_access_logs_risk_score ON access_logs(risk_score) WHERE risk_score > 50;

COMMENT ON TABLE access_logs IS 'Tracks patient portal access and resource viewing for security and compliance';
COMMENT ON COLUMN access_logs.risk_score IS 'Calculated risk score based on access patterns (0-100)';
COMMENT ON COLUMN access_logs.suspicious_activity IS 'Flagged if access pattern is deemed suspicious';


-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all audit tables
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE download_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;


-- ========== AUDIT_LOGS RLS POLICIES ==========

-- Super admins can view all audit logs
DROP POLICY IF EXISTS "Super admins can view all audit logs" ON audit_logs;
CREATE POLICY "Super admins can view all audit logs"
    ON audit_logs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'super_admin'
        )
    );

-- Super admins can insert audit logs
DROP POLICY IF EXISTS "Super admins can insert audit logs" ON audit_logs;
CREATE POLICY "Super admins can insert audit logs"
    ON audit_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'super_admin'
        )
    );

-- System can insert audit logs (for service accounts)
DROP POLICY IF EXISTS "Service can insert audit logs" ON audit_logs;
CREATE POLICY "Service can insert audit logs"
    ON audit_logs
    FOR INSERT
    TO service_role
    WITH CHECK (true);


-- ========== DOWNLOAD_LOGS RLS POLICIES ==========

-- Super admins can view all download logs
DROP POLICY IF EXISTS "Super admins can view all download logs" ON download_logs;
CREATE POLICY "Super admins can view all download logs"
    ON download_logs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'super_admin'
        )
    );

-- Clinic admins can view their clinic's download logs
DROP POLICY IF EXISTS "Clinic admins can view their clinic download logs" ON download_logs;
CREATE POLICY "Clinic admins can view their clinic download logs"
    ON download_logs
    FOR SELECT
    TO authenticated
    USING (
        clinic_id IN (
            SELECT id FROM clinics
            WHERE clinics.id::TEXT = auth.jwt()->>'organization_id'
        )
    );

-- Patients can view their own download logs
DROP POLICY IF EXISTS "Patients can view their own download logs" ON download_logs;
CREATE POLICY "Patients can view their own download logs"
    ON download_logs
    FOR SELECT
    TO authenticated
    USING (
        patient_id IN (
            SELECT id FROM patients
            WHERE patients.id = auth.uid()::UUID
        )
    );

-- System can insert download logs
DROP POLICY IF EXISTS "System can insert download logs" ON download_logs;
CREATE POLICY "System can insert download logs"
    ON download_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (true);


-- ========== ACCESS_LOGS RLS POLICIES ==========

-- Super admins can view all access logs
DROP POLICY IF EXISTS "Super admins can view all access logs" ON access_logs;
CREATE POLICY "Super admins can view all access logs"
    ON access_logs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'super_admin'
        )
    );

-- Patients can view their own access logs
DROP POLICY IF EXISTS "Patients can view their own access logs" ON access_logs;
CREATE POLICY "Patients can view their own access logs"
    ON access_logs
    FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
    );

-- System can insert access logs
DROP POLICY IF EXISTS "System can insert access logs" ON access_logs;
CREATE POLICY "System can insert access logs"
    ON access_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (true);


-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to automatically log database changes
CREATE OR REPLACE FUNCTION log_database_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert audit log entry
    INSERT INTO audit_logs (
        user_id,
        user_email,
        action,
        entity_type,
        entity_id,
        old_value,
        new_value,
        description
    ) VALUES (
        auth.uid(),
        auth.jwt()->>'email',
        TG_OP, -- INSERT, UPDATE, or DELETE
        TG_TABLE_NAME,
        COALESCE(NEW.id::TEXT, OLD.id::TEXT),
        CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END,
        TG_OP || ' on ' || TG_TABLE_NAME
    );

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_database_change IS 'Trigger function to automatically log database changes to audit_logs table';


-- =====================================================
-- SUMMARY VIEW FOR REPORTING
-- =====================================================

-- View to summarize download activity by clinic
CREATE OR REPLACE VIEW download_summary_by_clinic AS
SELECT
    c.id AS clinic_id,
    c.name AS clinic_name,
    COUNT(dl.id) AS total_downloads,
    COUNT(dl.id) FILTER (WHERE dl.consent_accepted = TRUE) AS downloads_with_consent,
    COUNT(dl.id) FILTER (WHERE dl.download_status = 'completed') AS completed_downloads,
    COUNT(dl.id) FILTER (WHERE dl.download_status = 'failed') AS failed_downloads,
    COUNT(DISTINCT dl.patient_id) AS unique_patients,
    MIN(dl.initiated_at) AS first_download,
    MAX(dl.initiated_at) AS last_download
FROM clinics c
LEFT JOIN download_logs dl ON c.id = dl.clinic_id
GROUP BY c.id, c.name;

COMMENT ON VIEW download_summary_by_clinic IS 'Summary view of download activity aggregated by clinic';


-- View to identify suspicious access patterns
CREATE OR REPLACE VIEW suspicious_access_summary AS
SELECT
    user_id,
    user_email,
    COUNT(*) AS suspicious_access_count,
    AVG(risk_score) AS avg_risk_score,
    MAX(risk_score) AS max_risk_score,
    array_agg(DISTINCT action) AS suspicious_actions,
    array_agg(DISTINCT ip_address) AS ip_addresses,
    MIN(accessed_at) AS first_suspicious_access,
    MAX(accessed_at) AS last_suspicious_access
FROM access_logs
WHERE suspicious_activity = TRUE
GROUP BY user_id, user_email
ORDER BY suspicious_access_count DESC;

COMMENT ON VIEW suspicious_access_summary IS 'Summary of users with suspicious access patterns for security monitoring';


-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Grant select permissions on views to authenticated users
GRANT SELECT ON download_summary_by_clinic TO authenticated;
GRANT SELECT ON suspicious_access_summary TO authenticated;

-- Grant execute permissions on helper functions
GRANT EXECUTE ON FUNCTION log_database_change TO authenticated;


-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- This migration creates:
-- ✅ audit_logs table - System-wide activity tracking
-- ✅ download_logs table - Report download tracking with consent
-- ✅ access_logs table - Patient portal access tracking
-- ✅ RLS policies for data security
-- ✅ Helper functions for automatic logging
-- ✅ Summary views for reporting
-- =====================================================
