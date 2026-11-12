// Explicit projections keep browser reads compatible with column-level credential grants.
export const PUBLIC_COLUMNS = {
  clinics: 'id,name,email,phone,address,logo_url,is_active,reports_used,reports_allowed,subscription_status,subscription_tier,trial_start_date,trial_end_date,created_at,updated_at,contact_person,clinic_name,country_code,smtp_email,city,clinic_type,origin_url,credentials_updated_at,deleted_at',
  patients: 'id,org_id,owner_user,external_id,full_name,date_of_birth,gender,phone,email,address,medical_history,improvement_focus,brain_fitness_score,created_at,updated_at,clinic_id,occupation,handedness,referred_by,name,subscription_tier,subscription_status,dashboard_access,reports_unlocked,origin_url,credentials_updated_at,last_login_at',
  profiles: 'id,role,full_name,phone,avatar_url,created_at,updated_at,email',
};

export const publicColumns = (table) => PUBLIC_COLUMNS[table] || '*';
