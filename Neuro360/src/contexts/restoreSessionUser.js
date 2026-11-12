import { PUBLIC_COLUMNS } from '../services/publicColumns.js';

export async function restoreSessionUser(client, cached = null) {
  const { data: auth, error: authError } = await client.auth.getUser();
  const authUser = auth?.user;
  if (authError || !authUser?.id) throw new Error('Invalid or expired session');
  if (cached && !['clinic_admin', 'patient', 'super_admin'].includes(cached.role)) throw new Error('Invalid account role');

  if (!cached || cached.role === 'clinic_admin') {
    const { data: clinic, error } = await client.from('clinics')
      .select(`${PUBLIC_COLUMNS.clinics},auth_user_id`).eq('auth_user_id', authUser.id).maybeSingle();
    if (error) throw error;
    if (clinic) {
      if (clinic.auth_user_id !== authUser.id || (cached && cached.id !== clinic.id) ||
          !clinic.is_active || clinic.deleted_at || clinic.subscription_status === 'pending_approval') {
        throw new Error('Invalid clinic session');
      }
      return {
        id: clinic.id, email: clinic.email, name: clinic.contact_person || clinic.name,
        clinicName: clinic.clinic_name || clinic.name, phone: clinic.phone, address: clinic.address,
        role: 'clinic_admin', avatar: clinic.logo_url, clinicId: clinic.id,
        isActivated: true, credentialsUpdatedAt: clinic.credentials_updated_at || null
      };
    }
    if (cached) throw new Error('Clinic session no longer belongs to this account');
  }

  if (!cached || cached.role === 'super_admin') {
    const { data: profile, error } = await client.from('profiles')
      .select(PUBLIC_COLUMNS.profiles).eq('id', authUser.id).maybeSingle();
    if (error) throw error;
    if (profile?.role === 'super_admin') {
      if (profile.id !== authUser.id || (cached && cached.id !== authUser.id)) throw new Error('Invalid admin identity');
      return { id: authUser.id, email: authUser.email, name: profile.full_name || 'Super Admin',
        role: 'super_admin', avatar: profile.avatar_url, isActivated: true };
    }
    if (cached) throw new Error('Account is not a super admin');
  }

  if (!authUser.email) throw new Error('Patient session has no verified email');
  let query = client.from('patients').select(`${PUBLIC_COLUMNS.patients},auth_user_id`);
  query = cached ? query.eq('id', cached.id) : query
    .ilike('email', authUser.email.replace(/[\\%_]/g, '\\$&'))
    .order('created_at', { ascending: false, nullsFirst: false }).limit(1);
  const { data: patient, error } = await query.maybeSingle();
  if (error) throw error;
  if (!patient || patient.auth_user_id !== authUser.id || (cached && patient.id !== cached.id) ||
      patient.email?.trim().toLowerCase() !== authUser.email.trim().toLowerCase()) {
    throw new Error('Patient session does not belong to this account');
  }
  return {
    id: patient.id, email: patient.email, name: patient.full_name || patient.name,
    phone: patient.phone, address: patient.address, dateOfBirth: patient.date_of_birth,
    gender: patient.gender, role: 'patient', clinicId: patient.clinic_id || patient.org_id,
    patientId: patient.id, externalId: patient.external_id, isActivated: true,
    credentialsUpdatedAt: patient.credentials_updated_at || null
  };
}
