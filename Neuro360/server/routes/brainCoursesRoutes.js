const express = require('express');
const { createRoutedClient } = require('../dbRouter');
const { normalizeCoursePayload } = require('../services/brainCoursePurchases');

const REQUIRED_COURSE_FIELDS = ['slug', 'title', 'author', 'category', 'course_url'];

function createBrainCoursesRouter({ stripe, stagingFrontendUrl = process.env.STAGING_FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app' } = {}) {
  const router = express.Router();
  const database = createRoutedClient();

  async function requestUser(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
    const { data: { user }, error } = await database.auth.getUser(token);
    if (error || !user) return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    req.courseUser = user;
    next();
  }

  async function superAdmin(req, res, next) {
    const { data: profile, error } = await database.from('profiles').select('role').eq('id', req.courseUser.id).single();
    if (error || profile?.role !== 'super_admin') return res.status(403).json({ success: false, error: 'Super admin access required' });
    next();
  }

  function courseValues(payload) {
    const normalized = normalizeCoursePayload(payload);
    return {
      ...normalized,
      slug: String(payload.slug || '').trim(),
      title: String(payload.title || '').trim(),
      author: String(payload.author || '').trim(),
      category: String(payload.category || '').trim(),
      thumbnail_url: payload.thumbnail_url ? String(payload.thumbnail_url).trim() : null,
      sort_order: Number.isInteger(Number(payload.sort_order)) ? Number(payload.sort_order) : 0,
      is_visible: payload.is_visible !== false && payload.is_visible !== 'false',
      updated_at: new Date().toISOString(),
    };
  }

  router.get('/', async (_req, res) => {
    const { data, error } = await database.from('brain_courses').select('*').eq('is_visible', true).order('sort_order').order('created_at');
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, courses: data || [] });
  });

  router.get('/access', requestUser, async (req, res) => {
    const { data, error } = await database
      .from('brain_course_purchases')
      .select('course_id')
      .eq('patient_id', req.courseUser.id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, courseIds: (data || []).map(({ course_id: id }) => id) });
  });

  router.post('/:id/checkout', requestUser, async (req, res) => {
    if (!stripe) return res.status(503).json({ success: false, error: 'Stripe is not configured' });
    const { data: course, error } = await database
      .from('brain_courses')
      .select('*')
      .eq('id', req.params.id)
      .eq('is_visible', true)
      .single();
    if (error || !course) return res.status(404).json({ success: false, error: 'Course not found' });
    if (course.is_free || !(Number(course.sale_price) > 0)) return res.status(400).json({ success: false, error: 'This course does not require payment' });

    const { data: existing } = await database
      .from('brain_course_purchases')
      .select('id')
      .eq('patient_id', req.courseUser.id)
      .eq('course_id', course.id)
      .maybeSingle();
    if (existing) return res.status(409).json({ success: false, error: 'Course already purchased', courseUrl: course.course_url });

    try {
      const base = String(req.headers.origin || stagingFrontendUrl).replace(/\/$/, '');
      const returnUrl = `${base}/patient?tab=brain-courses`;
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer_email: req.courseUser.email || undefined,
        success_url: `${returnUrl}&course_payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${returnUrl}&course_payment=cancelled`,
        line_items: [{
          price_data: {
            currency: course.currency.toLowerCase(),
            product_data: { name: course.title, ...(course.thumbnail_url?.startsWith('https://') ? { images: [course.thumbnail_url] } : {}) },
            unit_amount: Math.round(Number(course.sale_price) * 100),
          },
          quantity: 1,
        }],
        metadata: {
          type: 'brain_course',
          course_id: course.id,
          patient_id: req.courseUser.id,
          patient_email: req.courseUser.email || '',
          environment: base === stagingFrontendUrl.replace(/\/$/, '') ? 'staging' : 'production',
        },
      });
      return res.json({ success: true, url: session.url, sessionId: session.id });
    } catch (error) {
      return res.status(502).json({ success: false, error: error.message || 'Could not create checkout session' });
    }
  });

  router.get('/admin', requestUser, superAdmin, async (_req, res) => {
    const { data, error } = await database.from('brain_courses').select('*').order('sort_order').order('created_at');
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, courses: data || [] });
  });

  router.post('/admin', requestUser, superAdmin, async (req, res) => {
    const missing = REQUIRED_COURSE_FIELDS.filter((key) => !String(req.body?.[key] || '').trim());
    if (missing.length) return res.status(400).json({ success: false, error: `Missing required fields: ${missing.join(', ')}` });
    try {
      const { data, error } = await database.from('brain_courses').insert(courseValues(req.body)).select().single();
      if (error) return res.status(error.code === '23505' ? 409 : 400).json({ success: false, error: error.message });
      return res.status(201).json({ success: true, course: data });
    } catch (error) {
      return res.status(400).json({ success: false, error: error.message });
    }
  });

  router.patch('/admin/:id', requestUser, superAdmin, async (req, res) => {
    const { data: existing, error: existingError } = await database.from('brain_courses').select('*').eq('id', req.params.id).single();
    if (existingError || !existing) return res.status(404).json({ success: false, error: 'Course not found' });
    try {
      const values = courseValues({ ...existing, ...req.body });
      const { data, error } = await database.from('brain_courses').update(values).eq('id', existing.id).select().single();
      if (error) return res.status(error.code === '23505' ? 409 : 400).json({ success: false, error: error.message });
      return res.json({ success: true, course: data });
    } catch (error) {
      return res.status(400).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = { createBrainCoursesRouter };
