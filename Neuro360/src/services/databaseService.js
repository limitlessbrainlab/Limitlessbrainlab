import { v4 as uuidv4 } from 'uuid';
import SupabaseService from './supabaseService';
import { comparePassword } from '../utils/passwordUtils';

// Enhanced database service - uses Supabase only, no localStorage fallback
class DatabaseService {
  constructor() {
    this.useSupabase = true;
    this.supabaseService = SupabaseService;
    this.checkSupabaseAvailability();
  }

  async checkSupabaseAvailability() {
    try {

      // Test Supabase connection with clinics table (which we know exists)
      const testResult = await this.supabaseService.get('clinics');
      if (testResult !== undefined) {
        this.useSupabase = true;
      } else {
        throw new Error('Supabase connection failed');
      }
    } catch (error) {
      console.error('ERROR: Supabase connection failed:', error);
      throw new Error('Database connection required. Please check your internet connection and try again.');
    }
  }

  // Map legacy table names to Supabase schema
  mapTableName(table) {
    const tableMapping = {
      'clinics': 'clinics',              // Use existing clinics table
      'superAdmins': 'profiles',
      'patients': 'patients',
      'reports': 'reports',              // Fixed: Use 'reports' not 'eeg_reports'
      'subscriptions': 'subscriptions',
      'payments': 'payments',
      'algorithmResults': 'algorithm_results',  // QEEG algorithm processing results
      'clinical_forms': 'clinical_forms',  // Clinical assessment forms
      'clinical_documentation': 'clinical_documentation',  // Clinical documentation form data
      'usage': 'organizations',          // Temporary mapping to existing table
      'alerts': 'organizations'          // Temporary mapping to existing table
    };

    return tableMapping[table] || table;
  }

  // Generic CRUD operations
  // opts (email/columns/limit) are forwarded to supabaseService.get so callers can
  // filter/limit/project server-side instead of scanning whole tables — see login
  // (email filter) and the admin dashboards (columns/limit).
  async get(table, { throwOnError = false, email = null, columns = '*', limit = null } = {}) {
    try {
      const actualTable = this.mapTableName(table);
      const data = await this.supabaseService.get(actualTable, { throwOnError, email, columns, limit });

      // Ensure data is always an array
      if (!data) {
        console.warn(`WARNING: No data returned for ${table}, returning empty array`);
        return [];
      }

      if (!Array.isArray(data)) {
        console.warn(`WARNING: Data for ${table} is not an array:`, typeof data);
        return [];
      }

      // Transform data based on table type
      if (table === 'clinics' && actualTable === 'clinics') {
        // Transform clinics data to camelCase format
        return data.map(clinic => ({
          id: clinic.id,
          name: clinic.name,
          email: clinic.email,
          password: clinic.password,  // SUCCESS: CRITICAL: Include password for login authentication
          plain_password: clinic.plain_password,  // Plaintext retained so credential emails can re-show the current password
          plainPassword: clinic.plain_password,   // camelCase alias for compatibility
          contactPerson: clinic.contact_person,
          contact_person: clinic.contact_person,  // Keep snake_case for compatibility
          clinicName: clinic.clinic_name,
          clinic_name: clinic.clinic_name,  // Keep snake_case for compatibility
          countryCode: clinic.country_code || '+91',  // ✅ Include country code
          country_code: clinic.country_code || '+91',  // Keep snake_case for compatibility
          phone: clinic.phone,
          address: clinic.address,
          clinicType: clinic.clinic_type,
          clinic_type: clinic.clinic_type,
          city: clinic.city,
          logoUrl: clinic.logo_url,
          logo_url: clinic.logo_url,  // Keep snake_case for compatibility
          avatar: clinic.logo_url,  // Map logo_url to avatar
          isActive: clinic.is_active,
          is_active: clinic.is_active,  // Keep snake_case for compatibility
          isActivated: clinic.is_active,  // Legacy compatibility
          reportsUsed: clinic.reports_used,
          reportsAllowed: clinic.reports_allowed,
          subscriptionStatus: clinic.subscription_status,
          subscription_status: clinic.subscription_status,  // Keep snake_case for compatibility
          subscriptionTier: clinic.subscription_tier,
          trialStartDate: clinic.trial_start_date,
          trialEndDate: clinic.trial_end_date,
          originUrl: clinic.origin_url,
          origin_url: clinic.origin_url, // Keep snake_case for login env check
          credentials_updated_at: clinic.credentials_updated_at, // Session-validity baseline (email/password change marker)
          credentialsUpdatedAt: clinic.credentials_updated_at,   // camelCase alias
          createdAt: clinic.created_at,
          updatedAt: clinic.updated_at
        }));
      }

      if (table === 'patients' && actualTable === 'patients') {
        // Extra safety check for patients data
        if (!data || !Array.isArray(data) || data.length === 0) {
          console.warn('WARNING: No patients data to transform, returning empty array');
          console.warn('WARNING: Data value:', data);
          console.warn('WARNING: Is array:', Array.isArray(data));
          console.warn('WARNING: Length:', data?.length);
          return [];
        }


        // Transform patients data to camelCase format
        const transformed = data.map(patient => {
          if (!patient) {
            console.warn('WARNING: Null patient in data array, skipping');
            return null;
          }


          return {
            id: patient.id,
            name: patient.name,
            fullName: patient.full_name || patient.name,
            full_name: patient.full_name || patient.name,  // Keep snake_case for compatibility
            patient_uid: patient.patient_uid || patient.external_id || '',
            external_id: patient.external_id || patient.patient_uid || '',
            email: patient.email,
            phone: patient.phone,
            address: patient.address,
            dateOfBirth: patient.date_of_birth,
            date_of_birth: patient.date_of_birth,  // Keep snake_case for compatibility
            gender: patient.gender,
            clinicId: patient.clinic_id || patient.org_id,
            clinic_id: patient.clinic_id || patient.org_id,  // Keep snake_case for compatibility
            orgId: patient.org_id || patient.clinic_id,
            org_id: patient.org_id || patient.clinic_id,  // Keep snake_case for compatibility
            medicalHistory: patient.medical_history,
            medical_history: patient.medical_history,  // Keep snake_case for compatibility
            emergencyContact: patient.emergency_contact,
            emergency_contact: patient.emergency_contact,  // Keep snake_case for compatibility
            improvementFocus: patient.improvement_focus,
            brainFitnessScore: patient.brain_fitness_score,
            referredBy: patient.referred_by,
            referred_by: patient.referred_by,
            occupation: patient.occupation,
            handedness: patient.handedness,
            originUrl: patient.origin_url,
            origin_url: patient.origin_url, // Keep snake_case for login env check
            createdAt: patient.created_at,
            updatedAt: patient.updated_at
          };
        }).filter(p => p !== null);

        return transformed;
      }

      const result = this.convertToCamelCase(data);

      // Final safety check - ensure result is always an array
      return Array.isArray(result) ? result : [];
    } catch (error) {
      console.error(`ERROR: Failed to get data from ${table}:`, error);
      // Callers that need to tell a read failure apart from an empty table (login)
      // opt in via throwOnError; everyone else keeps the crash-safe empty array.
      if (throwOnError) throw error;
      return [];
    }
  }

  // Alias for `get` — several admin components (AdvancedAnalytics,
  // BrandingConfiguration, AgreementManager) call getAll(). Without this they
  // throw "getAll is not a function" and silently render empty data.
  async getAll(table) {
    return this.get(table);
  }

  // Row count without downloading rows — for dashboard counters. Reuses table mapping.
  async count(table, { throwOnError = false } = {}) {
    const actualTable = this.mapTableName(table);
    return this.supabaseService.count(actualTable, { throwOnError });
  }

  async add(table, item) {
    try {
      const actualTable = this.mapTableName(table);

      // Handle clinic creation specially
      if (table === 'clinics') {
        return await this.createClinic(item);
      }

      // Ensure item has an ID
      if (!item.id) {
        item.id = uuidv4();
      }

      // Filter valid fields based on table
      const filteredItem = this.filterValidFields(actualTable, item);

      // Convert field names to snake_case for Supabase
      const supabaseItem = this.convertToSnakeCase(filteredItem);
      const result = await this.supabaseService.add(actualTable, supabaseItem);

      return this.convertToCamelCase(result);
    } catch (error) {
      console.error(`ERROR: Failed to add to ${table}:`, error);
      throw error;
    }
  }

  // Filter valid fields for each table
  filterValidFields(table, item) {
    const validFields = {
      'clinics': [
        'id', 'name', 'email', 'contact_person', 'country_code', 'phone', 'address', 'logo_url', 'is_active',
        'clinic_type', 'city',
        'reports_used', 'reports_allowed', 'subscription_status', 'subscription_tier',
        'trial_start_date', 'trial_end_date', 'created_at', 'updated_at',
        'password', // ONLY use password field for authentication
        'plain_password', // Plaintext kept so the approval/credentials email can re-show the clinic's own password
        'credentials_updated_at', // Bumped on email/password change → forces open sessions to re-login
        'smtp_email', 'smtp_password', // Clinic SMTP config for sending emails
        'origin_url' // Environment (production/staging URL) the clinic was created from
        // Note: avatar stored in logo_url field
        // Note: country_code field added for international phone numbers
        // Note: contract_agreed column not yet in DB — do not add here until migration is run
      ],
      'organizations': [
        'id', 'name', 'description', 'website', 'logo_url', 'is_active',
        'created_at', 'updated_at', 'owner_user_id'
      ],
      'profiles': [
        'id', 'role', 'full_name', 'first_name', 'last_name', 'email', 'password', 'phone',
        'avatar', 'avatar_url', 'is_active', 'is_email_verified', 'date_of_birth', 'gender',
        'created_at', 'updated_at'
      ],
      'org_memberships': [
        'org_id', 'user_id', 'role', 'created_at'
      ],
      'patients': [
        'id', 'org_id', 'clinic_id', 'clinic_name', 'owner_user', 'external_id', 'name', 'full_name', 'date_of_birth',
        'gender', 'phone', 'country_code', 'email', 'password', 'address', 'medical_history', 'improvement_focus',
        'brain_fitness_score', 'is_active', 'created_at', 'updated_at',
        'plain_password', // Plaintext kept so credential/email-update emails can re-show the patient's current password
        'credentials_updated_at', // Bumped on email/password change → forces open sessions to re-login
        'profile_image', 'avatar_url',
        'occupation', 'handedness', 'referred_by',
        'origin_url' // Environment (production/staging URL) the patient was created from
      ],
      'reports': [
        // Actual schema from 004_simple_clinic_tables.sql:
        'id', 'clinic_id', 'patient_id', 'file_name', 'file_path',
        'report_data', 'status', 'created_at', 'updated_at'
        // Note: report_type, file_size, etc. should be stored in report_data JSONB
      ],
      'payment_history': [
        'id', 'payment_id', 'order_id', 'signature', 'clinic_id', 'amount', 'currency', 'status',
        'package_id', 'package_name', 'reports', 'plan_details', 'subscription', 'payment_details',
        'provider', 'ip_address', 'user_agent', 'metadata', 'created_at', 'updated_at'
      ],
      'subscriptions': [
        'id', 'clinic_id', 'plan', 'status', 'amount', 'currency', 'package_name', 'payment_method',
        'payment_id', 'reports_allowed', 'environment', 'plan_details', 'subscription', 'payment_details',
        'created_at', 'updated_at'
      ],
      'algorithm_results': [
        'id', 'patient_id', 'patient_name', 'clinic_id',
        'algorithm_name', 'input_data', 'output_data', 'results',
        'canonical_results', 'qeeg_data',
        'eyes_open_file', 'eyes_closed_file', 'pdf_url', 'claude_report_url', 'claude_report_id', 'status', 'error_message',
        'parameter_notes', 'report_mode', 'processed_at', 'processed_by', 'created_at', 'updated_at'
      ],
      'clinical_reports': [
        'id', 'patient_id', 'patient_uid', 'org_id', 'clinic_name',
        'full_name', 'date_of_birth', 'gender', 'handedness', 'occupation',
        'date_of_test', 'referring_physician', 'referral_reason',
        // Clinical History - JSONB fields for checkboxes
        'presenting_complaints', 'symptom_duration', 'past_medical_history',
        'medications', 'family_history', 'lifestyle', 'uploaded_documents',
        // Mental Status Examination
        'appearance_behavior', 'mood_affect', 'thought_process_content',
        'cognitive_assessment', 'insight_judgment',
        // EEG Findings
        'eeg_frequency_bands', 'eeg_connectivity', 'eeg_asymmetry_patterns',
        'eeg_artifact_quality', 'brain_parameters',
        // Clinical Interpretation
        'primary_findings', 'correlations_clinical_eeg', 'differential_considerations',
        // Recommendations
        'lifestyle_modifications', 'cognitive_behavioral_strategies',
        'neurofeedback_protocol', 'pharmacological_considerations',
        'referrals_followup',
        // Timestamps
        'created_at', 'updated_at'
      ],
      'clinical_history': [
        'id', 'patient_id', 'clinic_id', 'past_medical_conditions',
        'current_medications', 'allergies', 'surgeries_procedures', 'hospitalizations',
        'family_medical_history', 'family_psychiatric_history', 'psychiatric_diagnoses',
        'psychiatric_medications', 'therapy_history', 'marital_status', 'living_situation',
        'occupation', 'education_level', 'substance_use', 'sleep_pattern',
        'exercise_frequency', 'diet_description', 'stress_level', 'clinical_notes',
        'important_alerts', 'created_by', 'updated_by', 'created_at', 'updated_at'
      ],
      'clinical_forms': [
        'id', 'patient_id', 'clinic_id', 'form_type', 'form_name', 'form_version',
        'form_data', 'total_score', 'subscale_scores', 'interpretation',
        'severity_level', 'status', 'completed_at', 'reviewed_at',
        'administered_by', 'reviewed_by', 'notes', 'created_at', 'updated_at'
      ],
      'form_templates': [
        'id', 'clinic_id', 'template_name', 'template_description', 'form_type',
        'category', 'template_structure', 'scoring_rules', 'interpretation_guidelines',
        'is_active', 'is_global', 'created_by', 'created_at', 'updated_at'
      ],
      'clinical_assessments': [
        'id', 'patient_id', 'clinic_id', 'assessment_type', 'assessment_date',
        'responses', 'total_score', 'subscale_scores', 'percentile',
        'severity_category', 'interpretation', 'recommendations',
        'administered_by', 'notes', 'created_at', 'updated_at'
      ],
      'workflows': [
        'id', 'patient_id', 'patient_name', 'clinic_id',
        'file_name', 'file_size', 'status', 'steps', 'results',
        'report_id', 'started_at', 'completed_at', 'created_at', 'updated_at'
      ],
      'clinical_documentation': [
        'id', 'patient_id', 'clinic_id', 'patient_name',
        // Recording Protocol fields
        'recording_date', 'duration', 'eyes_open', 'eyes_closed', 'both_conditions',
        'hyperventilation', 'photic_stimulation', 'cognitive_task', 'cognitive_task_details',
        'other_task', 'other_task_details', 'electrode_system',
        // Administrative Details fields
        'reporting_clinician', 'date_of_report', 'institution_name', 'partner_platform',
        'unique_report_id', 'contact_phone', 'contact_email', 'contact_address',
        // File URLs (JSONB)
        'file_urls',
        // Timestamps
        'created_at', 'updated_at'
      ]
    };

    const allowedFields = validFields[table];
    if (!allowedFields) {
      return item; // No filtering if table not defined
    }

    const filteredItem = {};
    for (const [key, value] of Object.entries(item)) {
      const snakeKey = this.toSnakeCase(key);
      if (allowedFields.includes(snakeKey) || allowedFields.includes(key)) {
        filteredItem[key] = value;
      } else {
      }
    }

    return filteredItem;
  }

  async update(table, id, updates) {
    try {
      const actualTable = this.mapTableName(table);

      // Any patients write invalidates the resolvePatientForUser TTL cache —
      // otherwise ProfileGate could read a stale (pre-save) row for up to 30s
      // and wrongly show "Complete Your Profile" right after a save.
      if (actualTable === 'patients' && this._patientResolveCache) {
        this._patientResolveCache.clear();
      }

      // Filter valid fields based on table
      const filteredUpdates = this.filterValidFields(actualTable, updates);
      if (actualTable === 'clinics' && filteredUpdates.email) {
        filteredUpdates.email = filteredUpdates.email.trim().toLowerCase();
      }

      const supabaseUpdates = this.convertToSnakeCase(filteredUpdates);

      const result = await this.supabaseService.update(actualTable, id, supabaseUpdates);

      return this.convertToCamelCase(result);
    } catch (error) {
      console.error(`ERROR: Failed to update ${table}:`, error);
      throw error;
    }
  }

  async delete(table, id) {

    if (!id) {
      throw new Error('Cannot delete: ID is required');
    }

    try {
      const actualTable = this.mapTableName(table);
      const result = await this.supabaseService.delete(actualTable, id);
      return result;
    } catch (error) {
      console.error(`ERROR: Failed to delete from ${table}:`, error);
      throw error;
    }
  }

  async findById(table, id) {
    try {
      const actualTable = this.mapTableName(table);
      const result = await this.supabaseService.findById(actualTable, id);
      return this.convertToCamelCase(result);
    } catch (error) {
      console.error(`ERROR: Failed to find by ID in ${table}:`, error);
      throw error;
    }
  }

  async findBy(table, field, value) {
    try {
      const actualTable = this.mapTableName(table);
      const snakeField = this.toSnakeCase(field);
      const results = await this.supabaseService.findBy(actualTable, snakeField, value);

      // Apply patient-specific transformation to ensure name fields are mapped correctly
      if (table === 'patients') {
        return results.map(patient => {
          if (!patient) return null;
          const converted = this.convertToCamelCase(patient);
          // Ensure name is populated from full_name if missing
          converted.name = patient.name || patient.full_name || converted.fullName || 'Unknown';
          converted.fullName = patient.full_name || patient.name || converted.name;
          return converted;
        }).filter(Boolean);
      }

      return results.map(item => this.convertToCamelCase(item));
    } catch (error) {
      console.error(`ERROR: Failed to find by ${field} in ${table}:`, error);
      throw error;
    }
  }

  async findOne(table, field, value) {
    try {
      const actualTable = this.mapTableName(table);
      const snakeField = this.toSnakeCase(field);
      const result = await this.supabaseService.findOne(actualTable, snakeField, value);
      return this.convertToCamelCase(result);
    } catch (error) {
      console.error(`ERROR: Failed to find one in ${table}:`, error);
      throw error;
    }
  }

  // Case-insensitive search by field
  async findByNameIgnoreCase(table, name) {
    try {
      const actualTable = this.mapTableName(table);
      const results = await this.supabaseService.findByNameIgnoreCase(actualTable, name);
      return results.map(item => this.convertToCamelCase(item));
    } catch (error) {
      console.error(`ERROR: Failed to find by name (case-insensitive) in ${table}:`, error);
      throw error;
    }
  }

  // Convert between camelCase and snake_case
  toSnakeCase(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  toCamelCase(str) {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  convertToSnakeCase(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.convertToSnakeCase(item));

    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      const snakeKey = this.toSnakeCase(key);
      converted[snakeKey] = value;
    }
    return converted;
  }

  convertToCamelCase(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.convertToCamelCase(item));

    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      const camelKey = this.toCamelCase(key);
      converted[camelKey] = value;
    }
    return converted;
  }

  // Super Admin specific methods
  async authenticateAdmin(email, password) {
    // Check localStorage for super admin (development mode)
    const superAdmins = await this.get('superAdmins');
    const admin = superAdmins.find(a => a.email === email);
    if (admin && await comparePassword(password, admin.password) && admin.isActive) {
      return { ...admin, password: undefined };
    }

    // Try Supabase authentication
    if (this.useSupabase) {
      try {
        const result = await this.supabaseService.signIn(email, password);
        if (result?.user) {
          return {
            id: result.user.id,
            email: result.user.email,
            role: result.user.user_metadata?.role || 'user',
            name: result.user.user_metadata?.name || 'User'
          };
        }
      } catch (error) {
        console.error('Supabase auth failed:', error);
      }
    }

    return null;
  }

  // Patient authentication
  async createPatientAuth(email, password, metadata = {}) {
    const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:5000');
    const baseUrl = apiUrl.replace(/\/api\/?$/, '');

    const response = await fetch(`${baseUrl}/api/create-patient-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, metadata })
    });

    const result = await response.json();

    // If user already exists, treat as success
    if (!response.ok || !result.success) {
      if (result.message && result.message.includes('already been registered')) {
        return { user: null, existing: true };
      }
      throw new Error(result.message || 'Failed to create patient auth');
    }

    return { user: result.user, existing: result.existing || false };
  }

  // Clinic specific methods
  async createClinic(clinicData) {
    try {

      // Create clinic record matching the exact schema
      // Preserve the data passed from authService (including pending approval status)
      const clinicRecord = {
        name: clinicData.name || clinicData.clinicName,
        email: (clinicData.email || '').trim().toLowerCase(),
        password: clinicData.password || '', // ✅ PASSWORD FIELD ADDED - Required for clinic login
        plain_password: clinicData.plain_password || clinicData.plainPassword || null, // Kept so credential emails can re-show the clinic's own password
        contact_person: clinicData.contact_person || clinicData.contactPerson || clinicData.name,
        country_code: clinicData.country_code || clinicData.countryCode || '+91', // ✅ COUNTRY CODE - Save separately
        phone: clinicData.phone || '',
        address: clinicData.address || '',
        logo_url: clinicData.logo_url || clinicData.logoUrl || null,
        is_active: clinicData.is_active !== undefined ? clinicData.is_active : true,
        clinic_type: clinicData.clinic_type || clinicData.clinicType || 'lbl_partner',
        city: clinicData.city || '',
        reports_used: clinicData.reports_used || clinicData.reportsUsed || 0,
        reports_allowed: Number(clinicData.reports_allowed ?? clinicData.reportsAllowed ?? 0) || 0,
        subscription_status: clinicData.subscription_status || clinicData.subscriptionStatus || 'trial',
        subscription_tier: clinicData.subscription_tier || 'free',
        trial_start_date: clinicData.trial_start_date || new Date().toISOString(),
        trial_end_date: clinicData.trial_end_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: clinicData.created_at || clinicData.createdAt || new Date().toISOString(),
        updated_at: clinicData.updated_at || new Date().toISOString(),
        origin_url: clinicData.origin_url || clinicData.originUrl || null // Environment the clinic was created from
      };

      // IMPORTANT: Preserve the ID if provided (for existing clinic records)
      if (clinicData.id) {
        clinicRecord.id = clinicData.id;
      }


      // Use direct Supabase insert to clinics table
      const { data: clinic, error } = await this.supabaseService.supabase
        .from('clinics')
        .insert(clinicRecord)
        .select()
        .single();

      if (error) {
        console.error('ERROR: Supabase insert error:', error);
        throw error;
      }


      // Return in camelCase format for consistency
      return {
        id: clinic.id,
        name: clinic.name,
        email: clinic.email,
        password: clinic.password, // Persisted hash — callers verify it against the plaintext before emailing credentials
        plain_password: clinic.plain_password,
        phone: clinic.phone,
        address: clinic.address,
        logoUrl: clinic.logo_url,
        contactPerson: clinicData.contactPerson,
        isActive: clinic.is_active,
        reportsUsed: clinic.reports_used,
        reportsAllowed: clinic.reports_allowed,
        subscriptionStatus: clinic.subscription_status,
        subscriptionTier: clinic.subscription_tier,
        trialStartDate: clinic.trial_start_date,
        trialEndDate: clinic.trial_end_date,
        createdAt: clinic.created_at,
        updatedAt: clinic.updated_at
        // Note: Using single 'password' field for authentication (adminPassword removed)
      };

    } catch (error) {
      console.error('ERROR: Failed to create clinic:', error);
      throw error;
    }
  }

  async getClinicUsage(clinicId) {
    // Run the two independent lookups concurrently instead of sequentially.
    const [usage, reports] = await Promise.all([
      this.findBy('usage', 'clinicId', clinicId),
      this.findBy('reports', 'clinicId', clinicId),
    ]);

    return {
      totalReports: reports.length,
      reportsThisMonth: reports.filter(r => {
        const reportDate = new Date(r.createdAt);
        const now = new Date();
        return reportDate.getMonth() === now.getMonth() && reportDate.getFullYear() === now.getFullYear();
      }).length,
      usage: usage
    };
  }

  // Patient specific methods
  async getPatientsByClinic(clinicId) {
    return await this.findBy('patients', 'org_id', clinicId);
  }

  // Resolve the patients row for a logged-in portal user.
  // Prefer the row id captured at login (patientId = the password-matched row);
  // fall back to the newest row for the email (server-side filter, created_at DESC).
  // Every portal read path (login, ProfileGate, dashboard) must use this same
  // rule so duplicate-email rows always resolve to the same record.
  async resolvePatientForUser(user) {
    if (!user) return null;
    const rowId = user.patientId || user.id;

    // Short TTL cache: ProfileGate re-runs this on EVERY tab navigation
    // (its effect is keyed on location.pathname) and each call is a full
    // database round trip (~0.3-0.8s for far-away users). 30s is short
    // enough that a just-saved profile is re-read promptly.
    if (!this._patientResolveCache) this._patientResolveCache = new Map();
    const cacheKey = `${rowId || ''}|${(user.email || '').toLowerCase()}`;
    const cached = this._patientResolveCache.get(cacheKey);
    if (cached && Date.now() - cached.at < 30000) return cached.row;

    let row = null;
    if (rowId) {
      try {
        row = await this.findById('patients', rowId);
      } catch (e) {
        // Supabase-Auth UIDs won't match a patients.id — fall through to email
      }
    }
    if (!row && user.email) {
      const rows = await this.get('patients', { email: user.email.trim() });
      row = rows[0] || null;
    }
    if (row) this._patientResolveCache.set(cacheKey, { row, at: Date.now() });
    return row;
  }

  // Reports specific methods
  async getReportsByClinic(clinicId) {
    try {
      if (!clinicId) {
        console.warn('WARNING: getReportsByClinic: No clinicId provided');
        return [];
      }

      // Query reports by clinic_id directly, with fallback for legacy field names
      try {
        const actualTable = this.mapTableName('reports');

        // Single clinic-filtered query. The old second query scanned EVERY
        // null-clinic report row globally and then filtered by report.org_id
        // — a column the live reports table doesn't even have, so it never
        // matched anything and only added a whole-table round trip per load.
        const directRes = await this.supabaseService.supabase
          .from(actualTable).select('*').eq('clinic_id', clinicId);

        if (directRes.error) {
          console.error('ERROR: Error querying reports by clinic_id:', directRes.error);
          return [];
        }
        const clinicReports = [...(directRes.data || [])];

        // Backfill missing clinic_id/patient_id IN MEMORY only (so the list displays
        // correctly). Do NOT write back to the DB on this read path — that issued N
        // sequential UPDATEs on every clinic-detail open. Persistent backfill belongs
        // in a one-off migration, not a read.
        for (const report of clinicReports) {
          if (!report.clinic_id && (report.org_id || report.clinicId)) {
            report.clinic_id = clinicId;
          }
          if (!report.patient_id) {
            if (report.report_data && typeof report.report_data === 'object') {
              const patientIdFromData = report.report_data.patientId || report.report_data.patient_id;
              if (patientIdFromData) report.patient_id = patientIdFromData;
            }
            if (!report.patient_id && report.file_path) {
              // file_path format: reports/{clinicId}/{patientId}/{filename}
              const pathParts = report.file_path.split('/');
              if (pathParts.length >= 3 && pathParts[0] === 'reports') {
                report.patient_id = pathParts[2];
              }
            }
          }
        }

        return clinicReports.map(item => this.convertToCamelCase(item));
      } catch (error) {
        console.error(`ERROR: Error getting reports for clinic ${clinicId}:`, error);
        return [];
      }
    } catch (error) {
      console.error(`ERROR: Outer error getting reports for clinic ${clinicId}:`, error);
      return [];
    }
  }

  async getReportsByPatient(patientId) {
    try {
      if (!patientId) {
        console.warn('WARNING: getReportsByPatient: No patientId provided');
        return [];
      }

      const reports = await this.findBy('reports', 'patient_id', patientId);
      return reports || [];
    } catch (error) {
      console.error(`ERROR: Error getting reports for patient ${patientId}:`, error);
      return [];
    }
  }

  // Batched: fetch reports for MANY patients in a single query (avoids the N+1
  // problem where the UI looped one getReportsByPatient call per patient).
  async getReportsByPatients(patientIds) {
    try {
      const ids = (patientIds || []).filter(Boolean);
      if (ids.length === 0) return [];
      const actualTable = this.mapTableName('reports');
      const { data, error } = await this.supabaseService.supabase
        .from(actualTable)
        .select('*')
        .in('patient_id', ids);
      if (error) {
        console.error('ERROR: getReportsByPatients:', error);
        return [];
      }
      return data || [];
    } catch (error) {
      console.error('ERROR: getReportsByPatients:', error);
      return [];
    }
  }

  async addReport(reportData) {
    const clinicId = reportData.clinicId || reportData.orgId || reportData.org_id;
    const patientId = reportData.patientId || reportData.patient_id || null;
    const fileName = reportData.fileName || reportData.file_name || null;
    const filePath = reportData.filePath || reportData.file_path || null;

    try {
      const actualTable = this.mapTableName('reports');
      const query = this.supabaseService.supabase.from(actualTable).select('*').limit(1);
      if (clinicId) query.eq('clinic_id', clinicId);
      if (patientId) query.eq('patient_id', patientId);
      if (fileName) query.eq('file_name', fileName);
      if (filePath) query.eq('file_path', filePath);

      const { data: existing, error: lookupError } = await query;
      if (lookupError) {
        console.warn('WARNING: Could not check for existing report, inserting anyway:', lookupError.message);
      } else if (existing && existing.length > 0) {
        return this.convertToCamelCase(existing[0]);
      }
    } catch (lookupError) {
      console.warn('WARNING: Report dedupe lookup failed, inserting anyway:', lookupError?.message || lookupError);
    }

    const report = await this.add('reports', reportData);

    // reports_used is metered server-side in /api/qeeg/process on generation;
    // saving a report record here must not consume a credit.

    // Skip usage tracking for now - 'usage' table doesn't exist yet
    // TODO: Create proper usage/analytics table in future

    return report;
  }

  // Analytics methods
  async getAnalytics() {
    const clinics = await this.get('clinics');
    const reports = await this.get('reports');
    const patients = await this.get('patients');

    const activeClinicCount = clinics.filter(c => c.isActive || c.is_active).length;
    const totalReportsCount = reports.length;
    const totalPatientsCount = patients.length;

    const revenueData = await Promise.all(clinics.map(async (clinic) => {
      const subscription = await this.findOne('subscriptions', 'clinicId', clinic.id);
      return subscription && subscription.amount ? subscription.amount : 0;
    }));

    const totalRevenue = revenueData.reduce((acc, amount) => acc + amount, 0);
    const usage = await this.get('usage');

    return {
      activeClinics: activeClinicCount,
      totalReports: totalReportsCount,
      totalPatients: totalPatientsCount,
      monthlyRevenue: totalRevenue,
      recentActivity: usage.slice(-10).reverse()
    };
  }

  // Force refresh data connection
  async refreshConnection() {
    await this.checkSupabaseAvailability();
  }

  // Check and update expired trials
  async checkTrialExpiry(clinicId) {
    try {
      const clinic = await this.findById('clinics', clinicId);
      if (!clinic) return { expired: false, clinic: null };

      // Check if trial has expired
      if (clinic.subscriptionStatus === 'trial' && clinic.trialEndDate) {
        const trialEndDate = new Date(clinic.trialEndDate);
        const now = new Date();

        if (now > trialEndDate) {

          // Update clinic status
          await this.update('clinics', clinicId, {
            subscriptionStatus: 'expired',
            isActive: false
          });

          return {
            expired: true,
            clinic: {
              ...clinic,
              subscriptionStatus: 'expired',
              isActive: false
            },
            expiredAt: trialEndDate
          };
        }
      }

      return { expired: false, clinic };
    } catch (error) {
      console.error('Error checking trial expiry:', error);
      return { expired: false, clinic: null, error };
    }
  }

  // Check all expired trials (can be run periodically)
  async checkAllExpiredTrials() {
    try {

      const clinics = await this.get('clinics');
      const expiredClinics = [];

      for (const clinic of clinics) {
        const result = await this.checkTrialExpiry(clinic.id);
        if (result.expired) {
          expiredClinics.push(clinic);
        }
      }

      return expiredClinics;
    } catch (error) {
      console.error('Error checking expired trials:', error);
      return [];
    }
  }
}

export default new DatabaseService();
