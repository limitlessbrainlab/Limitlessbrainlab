import React from 'react';
import { Atom, Zap, Microscope, Scale, ArrowRight, Sun } from 'lucide-react';

// CERA System by CeraThrive — affiliate storefront link
const BUY_URL = 'https://www.svife.com/product/the-cera-system/?ref=2450';

const BuyNowButton = ({ className = '' }) => (
  <a
    href={BUY_URL}
    target="_blank"
    rel="noopener noreferrer sponsored"
    className={`inline-flex items-center gap-2 bg-gradient-to-r from-rose-500 to-orange-500 text-white text-sm sm:text-base font-semibold px-6 py-3 rounded-full shadow-lg shadow-rose-500/25 hover:shadow-xl hover:shadow-rose-500/35 hover:scale-[1.02] transition-all ${className}`}
  >
    Buy Now
    <ArrowRight className="h-4 w-4" />
  </a>
);

const benefits = [
  {
    icon: Atom,
    title: 'Improve Your Gut-Brain Connection',
    text: 'Cerathrive helps stimulate energy in the gut and brain. This supports the signals that keep digestion, mood, and focus in sync.',
  },
  {
    icon: Zap,
    title: 'Boost Cellular Energy in the Body + Brain',
    text: 'Red & near infrared light can penetrate deep into the tissues and the skull. This helps cells produce more ATP enhancing focus and clear thinking.',
  },
  {
    icon: Microscope,
    title: 'Support a Healthy Microbiome',
    text: 'More than just light, this therapy helps create conditions where good bacteria can thrive, supporting a strong gut lining and digestive well-being.',
  },
  {
    icon: Scale,
    title: 'Support Natural Inflammatory Balance',
    text: 'PBM, a special type of red light therapy used in the CERA System, helps the body stay balanced. It supports healthy inflammation control and natural recovery.',
  },
];

const Cera = () => {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      {/* Hero band */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="grid md:grid-cols-2 gap-6 items-center p-6 sm:p-8">
          <div>
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-rose-500/10 to-orange-500/10 text-rose-600 dark:text-rose-400 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
              <Sun className="h-3.5 w-3.5" />
              CERA by CeraThrive
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3">
              Red Light Therapy for the Gut-Brain Axis
            </h1>
            <p className="text-gray-600 dark:text-gray-300 text-sm sm:text-base mb-5">
              The CERA System pairs a headband and body pad that deliver red &amp; near-infrared
              light — powering the mitochondria in your gut and brain so they work together.
            </p>
            <BuyNowButton />
          </div>
          <img
            src="/cera/product-duo.jpg"
            alt="The CERA System — headband and body pad"
            className="w-full h-56 sm:h-72 object-cover rounded-xl"
            loading="lazy"
          />
        </div>
      </div>

      {/* Section 1 — light: The Hidden Cost of Indoor Living */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="grid md:grid-cols-2 gap-6 items-center p-6 sm:p-8">
          <img
            src="/cera/man-couch.jpg"
            alt="Man relaxing on a couch wearing the CERA headband and body band"
            className="w-full h-64 sm:h-80 object-cover rounded-xl"
            loading="lazy"
          />
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-4">
              The Hidden Cost of Indoor Living on Your Gut &amp; Brain
            </h2>
            <div className="space-y-3 text-gray-600 dark:text-gray-300 text-sm sm:text-base">
              <p>Most of us spend 90% of our time indoors under blue light instead of sunlight.</p>
              <p>Without natural light, hormone production is disrupted and cells lose energy. Inflammation builds quietly.</p>
              <p>The gut lining weakens, and the immune system sends stress signals to the brain.</p>
              <p>The result is often brain fog, low mood, poor focus, and fatigue.</p>
              <p className="font-bold text-gray-900 dark:text-white">CeraThrive was built with this in mind.</p>
              <p>It's made for anyone who wants to feel calmer, clearer, and more balanced.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2 — dark: When Your Cells Recharge */}
      <div className="rounded-2xl overflow-hidden bg-gray-950 text-white shadow-lg">
        <div className="grid md:grid-cols-2 gap-6 items-center p-6 sm:p-10">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              When Your <span className="text-rose-400">Cells Recharge</span>
              <br />...Everything Works Better
            </h2>
            <p className="text-gray-300 text-sm sm:text-base mb-6">
              Powering the mitochondria inside your gut and brain helps them work together.
              Your brain switches from tired to alive. The world feels sharper, steadier, and
              easier to take in.
            </p>
            <BuyNowButton />
          </div>
          <img
            src="/cera/woman-balcony.jpg"
            alt="Woman relaxing on a balcony wearing the CERA headband"
            className="w-full h-64 sm:h-80 object-cover rounded-xl"
            loading="lazy"
          />
        </div>

        {/* Benefits grid */}
        <div className="px-6 sm:px-10 pb-8 sm:pb-10">
          <div className="grid sm:grid-cols-2 gap-5">
            {benefits.map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="bg-white/[0.06] border border-white/10 rounded-xl p-5 hover:bg-white/[0.09] transition-colors"
              >
                <div className="inline-flex items-center justify-center h-11 w-11 rounded-lg bg-gradient-to-br from-rose-500 to-orange-500 mb-4">
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="font-bold text-white mb-2">{title}</h3>
                <p className="text-gray-300 text-sm leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer CTA */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm p-6 sm:p-8 text-center">
        <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-2">
          Ready to feel calmer, clearer, and more balanced?
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-5">
          Get the CERA System from CeraThrive. Checkout opens in a new window.
        </p>
        <BuyNowButton />
        <p className="text-gray-400 dark:text-gray-500 text-xs mt-4">
          The CERA System is sold by CeraThrive (cerathrive.com). Limitless Brain Lab earns a
          commission on purchases made through this link.
        </p>
      </div>

    </div>
  );
};

export default Cera;

