-- =====================================================
-- Migration 015: System Settings & Product Catalog
-- =====================================================
-- Creates tables for:
-- - Global system configuration (system_settings)
-- - Dynamic product/SKU catalog (product_catalog)
-- - Data retention policies
-- - Notification configurations
-- =====================================================

-- =====================================================
-- 1. SYSTEM_SETTINGS TABLE
-- =====================================================
-- Stores all global system configuration
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Setting identification
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    value_type TEXT NOT NULL DEFAULT 'string', -- string, number, boolean, json, array

    -- Categorization
    category TEXT NOT NULL, -- general, security, notifications, retention, consent, watermarking, payment
    subcategory TEXT,

    -- Metadata
    label TEXT NOT NULL,
    description TEXT,
    placeholder TEXT,
    help_text TEXT,

    -- Validation
    validation_rules JSONB DEFAULT '{}', -- { required, min, max, pattern, options }
    allowed_values TEXT[], -- For enum-type settings
    default_value TEXT,

    -- UI display
    display_order INTEGER DEFAULT 0,
    is_visible BOOLEAN DEFAULT TRUE,
    is_editable BOOLEAN DEFAULT TRUE,
    requires_restart BOOLEAN DEFAULT FALSE,

    -- Access control
    access_level TEXT DEFAULT 'super_admin', -- super_admin, clinic_admin, public
    sensitive BOOLEAN DEFAULT FALSE, -- Hide value in UI

    -- Change tracking
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Version control
    previous_value TEXT,
    change_reason TEXT,

    CONSTRAINT valid_value_type CHECK (value_type IN ('string', 'number', 'boolean', 'json', 'array', 'date', 'email', 'url')),
    CONSTRAINT valid_category CHECK (category IN (
        'general', 'security', 'notifications', 'retention', 'consent',
        'watermarking', 'payment', 'email', 'features', 'api'
    )),
    CONSTRAINT valid_access_level CHECK (access_level IN ('super_admin', 'clinic_admin', 'public'))
);

-- Indexes
CREATE INDEX idx_system_settings_category ON system_settings(category);
CREATE INDEX idx_system_settings_key ON system_settings(key);
CREATE INDEX idx_system_settings_visible ON system_settings(is_visible) WHERE is_visible = TRUE;

COMMENT ON TABLE system_settings IS 'Global system configuration with version control and validation';
COMMENT ON COLUMN system_settings.sensitive IS 'Whether to hide value in UI (e.g., API keys, secrets)';
COMMENT ON COLUMN system_settings.requires_restart IS 'Whether changing this setting requires system restart';


-- =====================================================
-- 2. PRODUCT_CATALOG TABLE
-- =====================================================
-- Stores dynamic pricing packages/SKUs
CREATE TABLE IF NOT EXISTS product_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Product identification
    sku TEXT NOT NULL UNIQUE, -- e.g., 'TRIAL', 'BASIC', 'STANDARD'
    product_code TEXT NOT NULL, -- Internal code
    name TEXT NOT NULL,
    display_name TEXT,

    -- Pricing
    price DECIMAL(10, 2) NOT NULL,
    currency TEXT DEFAULT 'INR',
    original_price DECIMAL(10, 2), -- For showing discounts
    discount_percentage DECIMAL(5, 2) DEFAULT 0,

    -- Package details
    reports_count INTEGER NOT NULL, -- Number of reports included
    description TEXT,
    short_description TEXT,

    -- Features and benefits
    features JSONB DEFAULT '[]', -- Array of feature strings
    benefits TEXT[],
    limitations TEXT[],

    -- Package type
    package_type TEXT DEFAULT 'standard', -- trial, basic, standard, professional, enterprise, custom
    billing_period TEXT DEFAULT 'one_time', -- one_time, monthly, quarterly, annually
    is_popular BOOLEAN DEFAULT FALSE, -- Highlight as "Most Popular"
    is_recommended BOOLEAN DEFAULT FALSE,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_visible BOOLEAN DEFAULT TRUE,
    is_purchasable BOOLEAN DEFAULT TRUE,

    -- Stock/Availability
    available_quantity INTEGER, -- NULL = unlimited
    max_per_customer INTEGER, -- NULL = unlimited

    -- Display order
    display_order INTEGER DEFAULT 0,
    badge TEXT, -- "Popular", "Best Value", "Enterprise"
    badge_color TEXT DEFAULT '#3B82F6',

    -- Validity
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_until TIMESTAMP WITH TIME ZONE,

    -- Target audience
    target_audience TEXT DEFAULT 'all', -- all, new_customers, existing_customers, enterprise
    min_clinic_size INTEGER, -- Minimum patients/tests required

    -- Payment gateway integration
    razorpay_plan_id TEXT, -- External plan ID if applicable
    stripe_price_id TEXT,

    -- Metadata
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Analytics
    purchase_count INTEGER DEFAULT 0,
    revenue_generated DECIMAL(12, 2) DEFAULT 0,

    -- Additional configuration
    config JSONB DEFAULT '{}',

    CONSTRAINT valid_package_type CHECK (package_type IN (
        'trial', 'basic', 'standard', 'professional', 'enterprise', 'custom'
    )),
    CONSTRAINT valid_billing_period CHECK (billing_period IN (
        'one_time', 'monthly', 'quarterly', 'annually'
    )),
    CONSTRAINT valid_target_audience CHECK (target_audience IN (
        'all', 'new_customers', 'existing_customers', 'enterprise'
    )),
    CONSTRAINT positive_price CHECK (price >= 0),
    CONSTRAINT positive_reports CHECK (reports_count > 0)
);

-- Indexes
CREATE INDEX idx_product_catalog_sku ON product_catalog(sku);
CREATE INDEX idx_product_catalog_active ON product_catalog(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_product_catalog_visible ON product_catalog(is_visible) WHERE is_visible = TRUE;
CREATE INDEX idx_product_catalog_package_type ON product_catalog(package_type);
CREATE INDEX idx_product_catalog_price ON product_catalog(price);
CREATE INDEX idx_product_catalog_display_order ON product_catalog(display_order);

COMMENT ON TABLE product_catalog IS 'Dynamic product catalog for report packages and pricing';
COMMENT ON COLUMN product_catalog.is_popular IS 'Display "Most Popular" badge on UI';
COMMENT ON COLUMN product_catalog.purchase_count IS 'Total number of times this package was purchased';


-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_catalog ENABLE ROW LEVEL SECURITY;


-- ========== SYSTEM_SETTINGS RLS POLICIES ==========

-- Super admins can view all settings
DROP POLICY IF EXISTS "Super admins can view all settings" ON system_settings;
CREATE POLICY "Super admins can view all settings"
    ON system_settings
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'super_admin'
        )
    );

-- Public settings visible to everyone
DROP POLICY IF EXISTS "Public settings visible to all" ON system_settings;
CREATE POLICY "Public settings visible to all"
    ON system_settings
    FOR SELECT
    TO authenticated
    USING (access_level = 'public' AND is_visible = TRUE);

-- Super admins can modify settings
DROP POLICY IF EXISTS "Super admins can modify settings" ON system_settings;
CREATE POLICY "Super admins can modify settings"
    ON system_settings
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


-- ========== PRODUCT_CATALOG RLS POLICIES ==========

-- Everyone can view active, visible products
DROP POLICY IF EXISTS "Anyone can view active products" ON product_catalog;
CREATE POLICY "Anyone can view active products"
    ON product_catalog
    FOR SELECT
    TO authenticated
    USING (is_active = TRUE AND is_visible = TRUE);

-- Super admins can view all products
DROP POLICY IF EXISTS "Super admins can view all products" ON product_catalog;
CREATE POLICY "Super admins can view all products"
    ON product_catalog
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'super_admin'
        )
    );

-- Super admins can manage products
DROP POLICY IF EXISTS "Super admins can manage products" ON product_catalog;
CREATE POLICY "Super admins can manage products"
    ON product_catalog
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

-- Function to get setting value
CREATE OR REPLACE FUNCTION get_setting(setting_key TEXT)
RETURNS TEXT AS $$
    SELECT value
    FROM system_settings
    WHERE key = setting_key
    AND is_visible = TRUE
    LIMIT 1;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION get_setting IS 'Retrieves a setting value by key';


-- Function to update setting value
CREATE OR REPLACE FUNCTION update_setting(
    setting_key TEXT,
    new_value TEXT,
    reason TEXT DEFAULT NULL
)
RETURNS system_settings AS $$
DECLARE
    updated_setting system_settings;
BEGIN
    UPDATE system_settings
    SET
        previous_value = value,
        value = new_value,
        updated_by = auth.uid(),
        updated_at = NOW(),
        change_reason = reason
    WHERE key = setting_key
    RETURNING * INTO updated_setting;

    RETURN updated_setting;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_setting IS 'Updates a setting value with change tracking';


-- Function to get active products
CREATE OR REPLACE FUNCTION get_active_products()
RETURNS SETOF product_catalog AS $$
    SELECT *
    FROM product_catalog
    WHERE is_active = TRUE
    AND is_visible = TRUE
    AND is_purchasable = TRUE
    AND (valid_from IS NULL OR valid_from <= NOW())
    AND (valid_until IS NULL OR valid_until > NOW())
    ORDER BY display_order ASC, price ASC;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION get_active_products IS 'Returns all currently purchasable products';


-- Function to calculate package savings
CREATE OR REPLACE FUNCTION calculate_savings(product_id UUID)
RETURNS DECIMAL AS $$
    SELECT COALESCE(original_price - price, 0)
    FROM product_catalog
    WHERE id = product_id;
$$ LANGUAGE SQL STABLE;


-- Trigger to auto-calculate discount percentage
CREATE OR REPLACE FUNCTION auto_calculate_discount()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.original_price IS NOT NULL AND NEW.original_price > NEW.price THEN
        NEW.discount_percentage := ROUND(
            ((NEW.original_price - NEW.price) / NEW.original_price * 100)::NUMERIC,
            2
        );
    ELSE
        NEW.discount_percentage := 0;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_discount_percentage
    BEFORE INSERT OR UPDATE OF price, original_price ON product_catalog
    FOR EACH ROW
    EXECUTE FUNCTION auto_calculate_discount();


-- Trigger to update timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_catalog_updated_at
    BEFORE UPDATE ON product_catalog
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER system_settings_updated_at
    BEFORE UPDATE ON system_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();


-- =====================================================
-- SEED DATA - Default System Settings
-- =====================================================

INSERT INTO system_settings (key, value, value_type, category, label, description, default_value) VALUES

-- General Settings
('platform_name', 'NeuroSense360', 'string', 'general', 'Platform Name', 'Display name for the platform', 'NeuroSense360'),
('support_email', 'support@neurosense360.com', 'email', 'general', 'Support Email', 'Contact email for customer support', 'support@neurosense360.com'),
('default_report_limit', '10', 'number', 'general', 'Default Report Limit', 'Default number of reports for new clinics', '10'),
('trial_period_days', '30', 'number', 'general', 'Trial Period (Days)', 'Duration of trial period in days', '30'),
('auto_generate_reports', 'true', 'boolean', 'features', 'Auto-generate Reports', 'Automatically generate reports when EDF files are uploaded', 'true'),

-- Security Settings
('session_timeout_minutes', '60', 'number', 'security', 'Session Timeout (Minutes)', 'User session timeout duration', '60'),
('max_login_attempts', '5', 'number', 'security', 'Max Login Attempts', 'Maximum failed login attempts before lockout', '5'),
('require_strong_passwords', 'true', 'boolean', 'security', 'Require Strong Passwords', 'Enforce strong password policy', 'true'),
('enable_two_factor_auth', 'false', 'boolean', 'security', 'Two-Factor Authentication', 'Require 2FA for admin accounts', 'false'),

-- Notification Settings
('email_notifications_enabled', 'true', 'boolean', 'notifications', 'Email Notifications', 'Send email notifications for important events', 'true'),
('usage_alerts_enabled', 'true', 'boolean', 'notifications', 'Usage Alerts', 'Alert clinics when approaching usage limits', 'true'),
('notification_email_from', 'notifications@neurosense360.com', 'email', 'notifications', 'Notification Email From', 'Sender email for system notifications', 'notifications@neurosense360.com'),
('low_usage_threshold_percentage', '80', 'number', 'notifications', 'Low Usage Threshold (%)', 'Percentage at which to send usage warnings', '80'),
('notification_cadence_hours', '24', 'number', 'notifications', 'Notification Cadence (Hours)', 'Minimum hours between repeated notifications', '24'),

-- Consent Settings
('consent_required_for_download', 'true', 'boolean', 'consent', 'Consent Required for Download', 'Require consent acceptance before report downloads', 'true'),
('digital_signature_required', 'true', 'boolean', 'consent', 'Digital Signature Required', 'Require digital signature for important consents', 'true'),
('consent_expiry_days', '365', 'number', 'consent', 'Consent Expiry (Days)', 'Days until consent expires (0 = never)', '365'),

-- Watermarking Settings
('watermark_enabled', 'true', 'boolean', 'watermarking', 'Watermark Enabled', 'Apply watermark to all reports', 'true'),
('watermark_text', 'Powered by NeuroSense360', 'string', 'watermarking', 'Watermark Text', 'Text to display in watermark', 'Powered by NeuroSense360'),
('watermark_position', 'footer-right', 'string', 'watermarking', 'Watermark Position', 'Position of watermark on reports', 'footer-right'),
('cobranding_fee', '299', 'number', 'watermarking', 'Co-branding Fee (INR)', 'Fee for clinic logo co-branding', '299'),

-- Data Retention Settings
('default_retention_days', '2555', 'number', 'retention', 'Default Retention (Days)', 'Default data retention period (7 years)', '2555'),
('auto_delete_expired_data', 'false', 'boolean', 'retention', 'Auto-delete Expired Data', 'Automatically delete data after retention period', 'false'),
('archive_before_delete', 'true', 'boolean', 'retention', 'Archive Before Delete', 'Archive data before permanent deletion', 'true'),

-- Payment Settings
('razorpay_enabled', 'true', 'boolean', 'payment', 'Razorpay Enabled', 'Enable Razorpay payment gateway', 'true'),
('payment_currency', 'INR', 'string', 'payment', 'Payment Currency', 'Default currency for payments', 'INR')

ON CONFLICT (key) DO NOTHING;


-- =====================================================
-- SEED DATA - Default Product Catalog
-- =====================================================

INSERT INTO product_catalog (sku, product_code, name, display_name, price, original_price, reports_count, description, short_description, features, package_type, is_popular, display_order, badge) VALUES

('TRIAL', 'PKG_TRIAL', 'Trial Package', 'Trial', 1, NULL, 5, '5 EEG reports - Perfect for trying our service', 'Try our service',
'["5 EEG Reports", "Full qEEG Analysis", "NeuroSense AI Insights", "Basic Care Plan", "7 Days Validity"]'::JSONB,
'trial', FALSE, 1, NULL),

('BASIC', 'PKG_BASIC', 'Basic Package', 'Basic', 999, 1249, 10, '10 EEG reports - Great for small clinics', 'For small clinics',
'["10 EEG Reports", "Full qEEG Analysis", "NeuroSense AI Insights", "Personalized Care Plans", "90 Days Validity", "Email Support"]'::JSONB,
'basic', FALSE, 2, NULL),

('STANDARD', 'PKG_STANDARD', 'Standard Package', 'Standard', 1999, 2499, 25, '25 EEG reports - Most popular choice for growing practices', 'Most popular',
'["25 EEG Reports", "Full qEEG Analysis", "NeuroSense AI Insights", "Personalized Care Plans", "Advanced Analytics", "180 Days Validity", "Priority Support", "Co-branding Option"]'::JSONB,
'standard', TRUE, 3, 'Most Popular'),

('PROFESSIONAL', 'PKG_PROFESSIONAL', 'Professional Package', 'Professional', 3499, 4999, 50, '50 EEG reports - For growing practices', 'For growing practices',
'["50 EEG Reports", "Full qEEG Analysis", "NeuroSense AI Insights", "Personalized Care Plans", "Advanced Analytics", "Clinic Dashboard", "365 Days Validity", "Priority Support", "Co-branding Included", "API Access"]'::JSONB,
'professional', FALSE, 4, 'Best Value'),

('ENTERPRISE', 'PKG_ENTERPRISE', 'Enterprise Package', 'Enterprise', 5999, 9999, 100, '100 EEG reports - For large hospitals and chains', 'For large hospitals',
'["100 EEG Reports", "Full qEEG Analysis", "NeuroSense AI Insights", "Personalized Care Plans", "Advanced Analytics", "Clinic Dashboard", "Multi-location Support", "Unlimited Validity", "24/7 Priority Support", "Co-branding Included", "API Access", "Dedicated Account Manager", "Custom Integrations"]'::JSONB,
'enterprise', FALSE, 5, 'Enterprise')

ON CONFLICT (sku) DO NOTHING;


-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Grant execute on helper functions
GRANT EXECUTE ON FUNCTION get_setting TO authenticated;
GRANT EXECUTE ON FUNCTION update_setting TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_products TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_savings TO authenticated;


-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- This migration creates:
-- ✅ system_settings table - Global configuration with version control
-- ✅ product_catalog table - Dynamic SKU/pricing management
-- ✅ RLS policies for security
-- ✅ Helper functions for settings and catalog
-- ✅ Auto-calculation triggers for discounts
-- ✅ Default system settings (general, security, notifications, etc.)
-- ✅ Default product catalog (Trial to Enterprise packages)
-- =====================================================
