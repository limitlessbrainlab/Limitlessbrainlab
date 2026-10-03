import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, GraduationCap, Lock } from 'lucide-react';
import SupabaseService from '../services/supabaseService';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');
const money = (value, currency = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(value || 0));

export function catalogueState(results) {
  const [catalogue, access] = results;
  return { courses: catalogue.status === 'fulfilled' ? catalogue.value : [], owned: new Set(access.status === 'fulfilled' ? access.value : []) };
}

const authHeaders = async () => {
  const { data: { session } } = await SupabaseService.supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
};

export default function BrainCourses() {
  const [courses, setCourses] = useState([]); const [owned, setOwned] = useState(new Set());
  const [category, setCategory] = useState('All'); const [error, setError] = useState(''); const [busy, setBusy] = useState('');
  useEffect(() => {
    void (async () => {
      const headers = await authHeaders();
      const authenticated = Boolean(headers.Authorization);
      const results = await Promise.allSettled([
      fetch(`${API_URL}/brain-courses`).then(async (r) => { if (!r.ok) throw new Error(); return (await r.json()).courses || []; }),
      authenticated ? fetch(`${API_URL}/brain-courses/access`, { headers }).then(async (r) => { if (!r.ok) throw new Error(); return (await r.json()).courseIds || []; }) : Promise.reject(new Error()),
      ]);
      const state = catalogueState(results); setCourses(state.courses); setOwned(state.owned); if (results[0].status === 'rejected') setError('Courses are temporarily unavailable. Please try again.');
    })();
  }, []);
  const categories = useMemo(() => ['All', ...new Set(courses.map((course) => course.category))], [courses]);
  const filtered = category === 'All' ? courses : courses.filter((course) => course.category === category);
  const open = (url) => window.open(url, '_blank', 'noopener,noreferrer');
  const checkout = async (course) => {
    setBusy(course.id); setError('');
    try {
      const headers = await authHeaders();
      if (!headers.Authorization) throw new Error('Your session has expired. Please sign in again.');
      const response = await fetch(`${API_URL}/brain-courses/${course.id}/checkout`, { method: 'POST', headers });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Could not start checkout'); window.location.assign(body.url);
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  };
  return <div className="space-y-5">
    <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] rounded-2xl p-6 text-white"><div className="flex items-center gap-3"><GraduationCap /><div><h1 className="text-2xl font-bold">Brain Courses</h1><p className="text-blue-200">Limitless Brain Academy</p></div></div></div>
    <div className="flex flex-wrap gap-2">{categories.map((value) => <button key={value} onClick={() => setCategory(value)} className={`rounded-full px-4 py-2 text-sm capitalize ${category === value ? 'bg-blue-600 text-white' : 'bg-white border text-gray-700'}`}>{value}</button>)}</div>
    {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">{filtered.map((course) => {
      const unlocked = course.is_free || owned.has(course.id);
      return <article key={course.id} className="overflow-hidden rounded-xl border bg-white shadow-sm"><div className="h-36 bg-[#323956]">{course.thumbnail_url && <img src={course.thumbnail_url} alt="" className="h-full w-full object-cover" />}</div><div className="p-4"><h2 className="font-semibold line-clamp-2">{course.title}</h2><p className="mt-1 text-sm text-gray-500">{course.author}</p><div className="mt-3">{course.is_free ? <span className="font-semibold text-green-700">Free</span> : <><span className="mr-2 text-sm text-gray-400 line-through">{course.original_price && money(course.original_price, course.currency)}</span><span className="font-semibold text-blue-700">{money(course.sale_price, course.currency)}</span></>}</div><button onClick={() => unlocked ? open(course.course_url) : checkout(course)} disabled={busy === course.id} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#323956] px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{unlocked ? <><ExternalLink size={16}/>Open Course</> : <><Lock size={16}/>{busy === course.id ? 'Opening checkout…' : 'Buy Now'}</>}</button></div></article>;
    })}</div>
    <section className="rounded-2xl bg-gradient-to-r from-[#323956] to-[#4a5578] px-6 py-7 text-center text-white">
      <h2 className="text-lg font-bold">Want to explore all courses?</h2>
      <p className="mt-2 text-sm text-blue-100">Visit Limitless Brain Academy for the complete catalog of brain health courses.</p>
      <a href="https://www.limitlessbrainacademy.com/products#nav_bar" target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-[#323956] hover:bg-blue-50">
        <GraduationCap size={18} /> Visit Limitless Brain Academy <ExternalLink size={16} />
      </a>
    </section>
  </div>;
}
