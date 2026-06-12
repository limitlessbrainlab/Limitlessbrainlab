-- =====================================================
-- Migration 014: Consent Management System
-- =====================================================
-- Creates comprehensive consent management for:
-- - Consent template versioning (consent_templates)
-- - Patient consent acceptance tracking (consent_records)
-- - Consent history and audit trail
-- =====================================================

-- =====================================================
-- 1. CONSENT_TEMPLATES TABLE
-- =====================================================
-- Stores different versions of consent text and terms
CREATE TABLE IF NOT EXISTS consent_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Template identification
    template_code TEXT NOT NULL UNIQUE, -- e.g., 'REPORT_DOWNLOAD', 'DATA_SHARING', 'HIPAA_CONSENT'
    version TEXT NOT NULL, -- e.g., 'v1.0', 'v1.1', 'v2.0'
    version_number INTEGER NOT NULL DEFAULT 1,

    -- Content
    title TEXT NOT NULL,
    content TEXT NOT NULL, -- Full consent text (can be HTML/Markdown)
    summary TEXT, -- Short summary for display
    language TEXT DEFAULT 'en', -- en, es, fr, etc.

    -- Template type and category
    consent_type TEXT NOT NULL, -- report_access, data_sharing, treatment, research, marketing
    category TEXT DEFAULT 'required', -- required, optional, informational
    scope TEXT DEFAULT 'patient', -- patient, clinic, system

    -- Status and lifecycle
    status TEXT DEFAULT 'draft', -- draft, active, deprecated, archived
    is_active BOOLEAN DEFAULT FALSE,
    requires_signature BOOLEAN DEFAULT FALSE,

    -- Metadata
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    activated_at TIMESTAMP WITH TIME ZONE,
    deprecated_at TIMESTAMP WITH TIME ZONE,

    -- Compliance and legal
    legal_basis TEXT, -- HIPAA, GDPR, CCPA, etc.
    retention_period INTEGER, -- Days to retain consent records
    effective_date DATE,
    expiration_date DATE,

    -- Additional configuration
    config JSONB DEFAULT '{}', -- Custom configuration options

    CONSTRAINT valid_consent_type CHECK (consent_type IN (
        'report_access', 'data_sharing', 'treatment', 'research', 'marketing', 'terms_of_service', 'privacy_policy'
    )),
    CONSTRAINT valid_status CHECK (status IN ('draft', 'active', 'deprecated', 'archived')),
    CONSTRAINT valid_category CHECK (category IN ('required', 'optional', 'informational')),
    CONSTRAINT valid_scope CHECK (scope IN ('patient', 'clinic', 'system')),
    CONSTRAINT unique_active_template UNIQUE (template_code, is_active)
);

-- Indexes for performance
CREATE INDEX idx_consent_templates_code ON consent_templates(template_code);
CREATE INDEX idx_consent_templates_active ON consent_templates(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_consent_templates_type ON consent_templates(consent_type);
CREATE INDEX idx_consent_templates_status ON consent_templates(status);
CREATE INDEX idx_consent_templates_version ON consent_templates(version_number DESC);

-- Full-text search for content
CREATE INDEX idx_consent_templates_content_search ON consent_templates USING GIN(to_tsvector('english', content));

COMMENT ON TABLE consent_templates IS 'Stores versioned consent templates and terms of service';
COMMENT ON COLUMN consent_templates.template_code IS 'Unique identifier for the consent template type';
COMMENT ON COLUMN consent_templates.version IS 'Human-readable version string (e.g., v1.0)';
COMMENT ON COLUMN consent_templates.is_active IS 'Only one template per code can be active at a time';


-- =====================================================
-- 2. CONSENT_RECORDS TABLE
-- =====================================================
-- Tracks patient consent acceptances with full audit trail
CREATE TABLE IF NOT EXISTS consent_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    consent_template_id UUID REFERENCES consent_templates(id) ON DELETE RESTRICT,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,

    -- User who accepted (might be different from patient for proxy consents)
    accepted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    accepted_by_role TEXT, -- patient, guardian, legal_representative, proxy

    -- Consent details
    template_code TEXT NOT NULL,
    template_version TEXT NOT NULL,
    consent_text TEXT NOT NULL, -- Full text that was shown to user (snapshot)

    -- Acceptance information
    accepted BOOLEAN NOT NULL,
    acceptance_method TEXT DEFAULT 'digital', -- digital, paper, verbal, electronic_signature

    -- Digital signature
    digital_signature TEXT, -- Base64 encoded signature image or electronic signature
    signature_timestamp TIMESTAMP WITH TIME ZONE,
    signature_ip_address TEXT,

    -- Acceptance metadata
    ip_address TEXT,
    user_agent TEXT,
    device_type TEXT,
    location_data JSONB, -- { country, city, coordinates }

    -- Session and context
    session_id TEXT,
    context TEXT, -- e.g., 'report_download', 'patient_registration', 'data_access'
    related_resource_type TEXT, -- report, appointment, medical_record
    related_resource_id UUID,

    -- Timestamps
    accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE, -- For time-limited consents
    revoked_at TIMESTAMP WITH TIME ZONE,

    -- Revocation details
    revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    revocation_reason TEXT,

    -- Status tracking
    status TEXT DEFAULT 'active', -- active, expired, revoked, superseded

    -- Witness information (for important consents)
    witness_name TEXT,
    witness_signature TEXT,
    witness_timestamp TIMESTAMP WITH TIME ZONE,

    -- Compliance flags
    gdpr_compliant BOOLEAN DEFAULT TRUE,
    hipaa_compliant BOOLEAN DEFAULT TRUE,
    legally_binding BOOLEAN DEFAULT TRUE,

    -- Additional metadata
    metadata JSONB DEFAULT '{}',

    CONSTRAINT valid_acceptance_method CHECK (acceptance_method IN (
        'digital', 'paper', 'verbal', 'electronic_signature', 'proxy'
    )),
    CONSTRAINT valid_consent_status CHECK (status IN ('active', 'expired', 'revoked', 'superseded')),
    CONSTRAINT valid_accepted_by_role CHECK (accepted_by_role IN (
        'patient', 'guardian', 'legal_representative', 'proxy', 'power_of_attorney'
    ))
);

-- Indexes for performance
CREATE INDEX idx_consent_records_patient_id ON consent_records(patient_id);
CREATE INDEX idx_consent_records_clinic_id ON consent_records(clinic_id);
CREATE INDEX idx_consent_records_template_id ON consent_records(consent_template_id);
CREATE INDEX idx_consent_records_template_code ON consent_records(template_code);
CREATE INDEX idx_consent_records_accepted_at ON consent_records(accepted_at DESC);
CREATE INDEX idx_consent_records_status ON consent_records(status);
CREATE INDEX idx_consent_records_expires_at ON consent_records(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_consent_records_active ON consent_records(status) WHERE status = 'active';

COMMENT ON TABLE consent_records IS 'Tracks all consent acceptances with full audit trail for compliance';
COMMENT ON COLUMN consent_records.consent_text IS 'Snapshot of exact consent text shown to user for legal proof';
COMMENT ON COLUMN consent_records.digital_signature IS 'Base64 encoded signature image or cryptographic signature';
COMMENT ON COLUMN consent_records.legally_binding IS 'Whether this consent is legally binding based on method and context';


-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE consent_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;


-- ========== CONSENT_TEMPLATES RLS POLICIES ==========

-- Everyone can view active consent templates
DROP POLICY IF EXISTS "Anyone can view active consent templates" ON consent_templates;
CREATE POLICY "Anyone can view active consent templates"
    ON consent_templates
    FOR SELECT
    TO authenticated
    USING (is_active = TRUE);

-- Super admins can view all templates
DROP POLICY IF EXISTS "Super admins can view all consent templates" ON consent_templates;
CREATE POLICY "Super admins can view all consent templates"
    ON consent_templates
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'super_admin'
        )
    );

-- Super admins can insert/update/delete templates
DROP POLICY IF EXISTS "Super admins can manage consent templates" ON consent_templates;
CREATE POLICY "Super admins can manage consent templates"
    ON consent_templates
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


-- ========== CONSENT_RECORDS RLS POLICIES ==========

-- Patients can view their own consent records
DROP POLICY IF EXISTS "Patients can view their own consent records" ON consent_records;
CREATE POLICY "Patients can view their own consent records"
    ON consent_records
    FOR SELECT
    TO authenticated
    USING (
        patient_id IN (
            SELECT id FROM patients WHERE patients.id = auth.uid()::UUID
        )
    );

-- Clinic staff can view their clinic's consent records
DROP POLICY IF EXISTS "Clinic staff can view their clinic consent records" ON consent_records;
CREATE POLICY "Clinic staff can view their clinic consent records"
    ON consent_records
    FOR SELECT
    TO authenticated
    USING (
        clinic_id IN (
            SELECT id FROM clinics
            WHERE clinics.id::TEXT = auth.jwt()->>'organization_id'
        )
    );

-- Super admins can view all consent records
DROP POLICY IF EXISTS "Super admins can view all consent records" ON consent_records;
CREATE POLICY "Super admins can view all consent records"
    ON consent_records
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'super_admin'
        )
    );

-- Authenticated users can insert consent records
DROP POLICY IF EXISTS "Authenticated users can create consent records" ON consent_records;
CREATE POLICY "Authenticated users can create consent records"
    ON consent_records
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Patients can update their own consent records (for revocation)
DROP POLICY IF EXISTS "Patients can update their own consent records" ON consent_records;
CREATE POLICY "Patients can update their own consent records"
    ON consent_records
    FOR UPDATE
    TO authenticated
    USING (
        patient_id IN (
            SELECT id FROM patients WHERE patients.id = auth.uid()::UUID
        )
    );


-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to get active consent template by code
CREATE OR REPLACE FUNCTION get_active_consent_template(template_code_param TEXT)
RETURNS consent_templates AS $$
    SELECT *
    FROM consent_templates
    WHERE template_code = template_code_param
    AND is_active = TRUE
    AND status = 'active'
    ORDER BY version_number DESC
    LIMIT 1;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION get_active_consent_template IS 'Retrieves the currently active consent template for a given code';


-- Function to check if patient has valid consent
CREATE OR REPLACE FUNCTION check_patient_consent(
    patient_id_param UUID,
    template_code_param TEXT
)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1
        FROM consent_records
        WHERE patient_id = patient_id_param
        AND template_code = template_code_param
        AND accepted = TRUE
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > NOW())
    );
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION check_patient_consent IS 'Checks if patient has active consent for a specific template';


-- Function to revoke consent
CREATE OR REPLACE FUNCTION revoke_consent(
    consent_record_id_param UUID,
    revocation_reason_param TEXT DEFAULT NULL
)
RETURNS consent_records AS $$
DECLARE
    updated_record consent_records;
BEGIN
    UPDATE consent_records
    SET
        status = 'revoked',
        revoked_at = NOW(),
        revoked_by = auth.uid(),
        revocation_reason = revocation_reason_param
    WHERE id = consent_record_id_param
    AND status = 'active'
    RETURNING * INTO updated_record;

    RETURN updated_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION revoke_consent IS 'Revokes an active consent record';


-- Function to automatically expire old consents
CREATE OR REPLACE FUNCTION expire_old_consents()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE consent_records
    SET status = 'expired'
    WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < NOW();

    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION expire_old_consents IS 'Automatically expires consent records past their expiration date';


-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_consent_template_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER consent_templates_updated_at
    BEFORE UPDATE ON consent_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_consent_template_timestamp();


-- =====================================================
-- SUMMARY VIEWS FOR REPORTING
-- =====================================================

-- View to show consent status by patient
CREATE OR REPLACE VIEW patient_consent_status AS
SELECT
    p.id AS patient_id,
    p.full_name AS patient_name,
    c.id AS clinic_id,
    c.name AS clinic_name,
    ct.template_code,
    ct.title AS consent_title,
    cr.accepted,
    cr.accepted_at,
    cr.expires_at,
    cr.status,
    CASE
        WHEN cr.expires_at IS NULL THEN TRUE
        WHEN cr.expires_at > NOW() THEN TRUE
        ELSE FALSE
    END AS is_valid
FROM patients p
CROSS JOIN consent_templates ct
LEFT JOIN clinics c ON p.clinic_id = c.id
LEFT JOIN consent_records cr ON p.id = cr.patient_id
    AND ct.id = cr.consent_template_id
    AND cr.status = 'active'
WHERE ct.is_active = TRUE;

COMMENT ON VIEW patient_consent_status IS 'Shows consent status for all patients and active consent types';


-- View to show consent compliance summary
CREATE OR REPLACE VIEW consent_compliance_summary AS
SELECT
    c.id AS clinic_id,
    c.name AS clinic_name,
    ct.template_code,
    ct.title AS consent_title,
    COUNT(DISTINCT p.id) AS total_patients,
    COUNT(DISTINCT cr.patient_id) FILTER (WHERE cr.accepted = TRUE AND cr.status = 'active') AS consented_patients,
    COUNT(DISTINCT p.id) - COUNT(DISTINCT cr.patient_id) FILTER (WHERE cr.accepted = TRUE AND cr.status = 'active') AS pending_consents,
    ROUND(
        100.0 * COUNT(DISTINCT cr.patient_id) FILTER (WHERE cr.accepted = TRUE AND cr.status = 'active') /
        NULLIF(COUNT(DISTINCT p.id), 0),
        2
    ) AS consent_compliance_percentage
FROM clinics c
CROSS JOIN consent_templates ct
LEFT JOIN patients p ON c.id = p.clinic_id
LEFT JOIN consent_records cr ON p.id = cr.patient_id
    AND ct.id = cr.consent_template_id
WHERE ct.is_active = TRUE
GROUP BY c.id, c.name, ct.template_code, ct.title;

COMMENT ON VIEW consent_compliance_summary IS 'Summary of consent compliance rates by clinic and consent type';


-- =====================================================
-- SEED DATA - Default Consent Templates
-- =====================================================

-- Insert default consent template for report downloads
INSERT INTO consent_templates (
    template_code,
    version,
    version_number,
    title,
    content,
    summary,
    consent_type,
    category,
    scope,
    status,
    is_active,
    requires_signature,
    legal_basis,
    effective_date
) VALUES (
    'REPORT_DOWNLOAD',
    'v1.0',
    1,
    'Report Download Consent',
    '<h2>Report Download & Data Access Consent</h2>
<p>By downloading this report, you acknowledge and agree to the following:</p>
<ul>
    <li>This medical report contains sensitive health information protected under HIPAA regulations.</li>
    <li>You are authorized to access this information for legitimate medical or personal purposes.</li>
    <li>You will maintain the confidentiality of this information and not share it without proper authorization.</li>
    <li>The report is for informational purposes and should be reviewed with your healthcare provider.</li>
    <li>NeuroSense360 and the affiliated clinic are not responsible for unauthorized sharing or misuse of this report.</li>
    <li>This download activity will be logged for security and compliance purposes.</li>
</ul>
<p>By clicking "I Accept", you confirm you have read, understood, and agree to these terms.</p>',
    'You must agree to maintain confidentiality and comply with HIPAA regulations to download this report.',
    'report_access',
    'required',
    'patient',
    'active',
    TRUE,
    TRUE,
    'HIPAA, HITECH Act',
    CURRENT_DATE
) ON CONFLICT DO NOTHING;

-- Insert privacy policy consent template
INSERT INTO consent_templates (
    template_code,
    version,
    version_number,
    title,
    content,
    summary,
    consent_type,
    category,
    scope,
    status,
    is_active,
    requires_signature,
    legal_basis,
    effective_date
) VALUES (
    'PRIVACY_POLICY',
    'v1.0',
    1,
    'Privacy Policy Agreement',
    '<h2>NeuroSense360 Privacy Policy</h2>
<p>Last Updated: ' || CURRENT_DATE || '</p>
<h3>Information Collection</h3>
<p>We collect and process the following information:</p>
<ul>
    <li>Personal identification information (name, email, phone number)</li>
    <li>Medical records and EEG test results</li>
    <li>Payment and billing information</li>
    <li>System usage and access logs</li>
</ul>
<h3>Use of Information</h3>
<p>Your information is used for:</p>
<ul>
    <li>Providing medical report analysis services</li>
    <li>Billing and payment processing</li>
    <li>Improving service quality and user experience</li>
    <li>Compliance with legal and regulatory requirements</li>
</ul>
<h3>Data Security</h3>
<p>We implement industry-standard security measures including encryption, access controls, and regular security audits.</p>
<h3>Your Rights</h3>
<p>You have the right to access, correct, delete, or export your personal data at any time.</p>',
    'Review and accept our privacy policy regarding data collection, use, and protection.',
    'privacy_policy',
    'required',
    'system',
    'active',
    TRUE,
    FALSE,
    'HIPAA, GDPR, CCPA',
    CURRENT_DATE
) ON CONFLICT DO NOTHING;


-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Grant permissions on helper functions
GRANT EXECUTE ON FUNCTION get_active_consent_template TO authenticated;
GRANT EXECUTE ON FUNCTION check_patient_consent TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_consent TO authenticated;
GRANT EXECUTE ON FUNCTION expire_old_consents TO service_role;

-- Grant select on views
GRANT SELECT ON patient_consent_status TO authenticated;
GRANT SELECT ON consent_compliance_summary TO authenticated;


-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- This migration creates:
-- ✅ consent_templates table - Versioned consent templates
-- ✅ consent_records table - Patient consent tracking
-- ✅ RLS policies for security
-- ✅ Helper functions for consent management
-- ✅ Summary views for compliance reporting
-- ✅ Default consent templates (Report Download, Privacy Policy)
-- =====================================================
