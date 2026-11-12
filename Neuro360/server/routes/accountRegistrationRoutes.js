const express = require('express');
const bcrypt = require('bcryptjs');
const { createRoutedClient } = require('../dbRouter');
const DEFAULT_CLINIC_ID = 'e34abedf-9d27-4000-a9c1-b8bad8bc8c30';

function createAccountRegistrationRouter(db = createRoutedClient()) {
  const router = express.Router();
  router.post('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const input = req.body || {};
    const { name, email, password, userType = 'patient' } = input;
    const optional = ['dateOfBirth', 'gender', 'phone', 'countryCode', 'address', 'city', 'clinicName', 'clinicType', 'clinic_type'];
    if (!['patient', 'clinic'].includes(userType) || typeof name !== 'string' || name.trim().length < 2 || name.length > 255 ||
        typeof email !== 'string' || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        typeof password !== 'string' || password.trim().length < 6 || Buffer.byteLength(password.trim()) > 72 ||
        optional.some(key => input[key] != null && (typeof input[key] !== 'string' || input[key].length > 2000)) ||
        (input.dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(input.dateOfBirth)) ||
        (input.gender && !['male', 'female', 'other'].includes(input.gender)) ||
        (userType === 'clinic' && !['lbl_partner', 'lbl_clinic'].includes(input.clinicType || input.clinic_type || 'lbl_partner'))) {
      return res.status(400).json({ message: 'Please enter valid registration details. Passwords must be 6–72 bytes.' });
    }
    if (userType === 'patient' && (!input.dateOfBirth || !input.gender ||
        !Number.isFinite(Date.parse(input.dateOfBirth)) || new Date(input.dateOfBirth).toISOString().slice(0, 10) !== input.dateOfBirth)) {
      return res.status(400).json({ message: 'A valid date of birth and gender are required.' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const literalPattern = value => value.replace(/[\\%_]/g, '\\$&');
    try {
      // shortcut: cross-table duplicate checks can race; use a transactional registry if strict global uniqueness is required.
      for (const table of ['clinics', 'patients', 'profiles']) {
        const { data, error } = await db.from(table).select('id').ilike('email', literalPattern(normalizedEmail)).limit(1);
        if (error) throw error;
        if (data?.length) return res.status(409).json({ message: 'An account with this email already exists. Please try logging in instead.' });
      }
      let clinic = null;
      if (userType === 'patient' && input.clinicName?.trim()) {
        const { data, error } = await db.from('clinics').select('id').ilike('name', literalPattern(input.clinicName.trim())).eq('is_active', true).is('deleted_at', null).limit(2);
        if (error) throw error;
        if (data?.length !== 1) return res.status(400).json({ message: 'This clinic is not available. Please check the clinic name or contact support.' });
        clinic = data[0];
      }
      const credentials = { email: normalizedEmail, password: await bcrypt.hash(password.trim(), 10), plain_password: password.trim() };
      const row = userType === 'clinic' ? {
        ...credentials, name: name.trim(), contact_person: name.trim(), country_code: input.countryCode || '+91',
        phone: input.phone || '', address: input.address || '', city: input.city || '',
        clinic_type: input.clinicType || input.clinic_type || 'lbl_partner', is_active: false,
        reports_used: 0, reports_allowed: 0, subscription_status: 'pending_approval', subscription_tier: 'free'
      } : {
        ...credentials, full_name: name.trim(), date_of_birth: input.dateOfBirth || null, gender: input.gender || null,
        phone: input.phone || null, address: input.address || null,
        org_id: clinic?.id || DEFAULT_CLINIC_ID, clinic_id: clinic?.id || DEFAULT_CLINIC_ID,
        improvement_focus: ['cognitive_enhancement']
      };
      // One insert includes credentials: there is no publicly claimable passwordless account.
      const { data: account, error } = await db.from(userType === 'clinic' ? 'clinics' : 'patients')
        .insert(row).select(userType === 'clinic' ? 'id,name,email' : 'id,full_name,email').single();
      if (error) {
        if (error.code === '23505') return res.status(409).json({ message: 'An account with this email already exists. Please try logging in instead.' });
        throw error;
      }
      return res.status(201).json({ success: true, account });
    } catch {
      console.error('Account registration could not be completed');
      return res.status(503).json({ message: 'Unable to create your account. Please try again.' });
    }
  });
  return router;
}
module.exports = { createAccountRegistrationRouter };
