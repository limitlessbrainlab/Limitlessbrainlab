const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { createRoutedClient } = require('../dbRouter');

const router = express.Router();

const SSO_SECRET = process.env.SHARED_SSO_SECRET;
const DDO_DOCTOR_URL = process.env.DDO_DOCTOR_URL;
const DDO_PATIENT_URL = process.env.DDO_PATIENT_URL;

const supabase = createRoutedClient();

router.post('/generate-token', async (req, res) => {
  try {
    if (!SSO_SECRET) {
      return res.status(500).json({ error: 'SSO not configured' });
    }

    const { userId, email, role, doctorSlug } = req.body;

    if (!userId || !email || !role) {
      return res.status(400).json({ error: 'userId, email, and role are required' });
    }

    // Fetch user from LBW database based on role
    let user;
    if (role === 'patient') {
      const { data } = await supabase
        .from('patients')
        .select('id, full_name, email, phone, date_of_birth, gender')
        .eq('id', userId)
        .eq('email', email)
        .single();
      user = data;
    } else if (role === 'clinic_admin') {
      const { data } = await supabase
        .from('clinics')
        .select('id, name, email, phone, contact_person')
        .eq('id', userId)
        .eq('email', email)
        .single();
      user = data;
    } else if (role === 'super_admin') {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', userId)
        .eq('email', email)
        .single();
      user = data;
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Map LBW roles to DDO roles
    const ddoRole = {
      patient: 'patient',
      clinic_admin: 'doctor',
      super_admin: 'superadmin',
    }[role];

    // Build JWT payload
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.full_name || user.contact_person || user.name,
      role: ddoRole,
      phone: user.phone || null,
      dob: user.date_of_birth || null,
      gender: user.gender || null,
      iss: 'limitlessbrainlab',
      aud: 'ddo',
      jti: crypto.randomUUID(),
    };

    // Include doctor slug for patient booking redirect
    if (ddoRole === 'patient' && doctorSlug) {
      payload.doctor_slug = doctorSlug;
    }

    const token = jwt.sign(payload, SSO_SECRET, { expiresIn: '60s' });

    // Build redirect URL based on role
    const baseUrl = ddoRole === 'patient' ? DDO_PATIENT_URL : DDO_DOCTOR_URL;
    const redirectUrl = `${baseUrl}/auth/sso?token=${encodeURIComponent(token)}`;

    res.json({ success: true, redirectUrl });
  } catch (error) {
    console.error('SSO token generation error:', error);
    res.status(500).json({ error: 'Failed to generate SSO token' });
  }
});

module.exports = router;
