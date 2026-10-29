'use strict';
const { bad } = require('./util');

const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

// Prices come from the prototype. The SERVER is the only source of truth for what a plan costs.
const PLANS = {
  Beginner: { usd: 10, ngn: 5900, features: ['50+ Foundational Lessons', 'Standard Practice Tools', 'Course Completion Medals'], blurb: 'Build your foundation with the essentials of music theory and technique.' },
  Intermediate: { usd: 13, ngn: 7900, features: ['Unlimited Masterclasses', 'Interactive Sheet Music', 'Personalized Progress Tracking'], blurb: 'The complete ecosystem for students serious about artistic mastery.' },
  Advanced: { usd: 15, ngn: 9900, features: ['Monthly 1:1 Virtual Session', 'Performance Video Reviews', 'Career Path Consultation', 'All Pro Plan Features'], blurb: 'Unparalleled access to mentorship and high-level artistic guidance.' },
};
const ANNUAL_FACTOR = 9.6; // 12 months for the price of 9.6 = 20% off

function price(plan, billing) {
  const p = PLANS[plan];
  if (!p) throw bad('invalid_plan', 'Unknown plan.');
  if (billing === 'monthly') return { usd: p.usd, ngn: p.ngn, months: 1 };
  if (billing === 'annual') return { usd: Math.round(p.usd * ANNUAL_FACTOR), ngn: Math.round(p.ngn * ANNUAL_FACTOR), months: 12 };
  throw bad('invalid_billing', 'Billing must be monthly or annual.');
}

const levelIndex = (l) => LEVELS.indexOf(l);

function catalogue() {
  return LEVELS.map((name) => ({
    name,
    blurb: PLANS[name].blurb,
    features: PLANS[name].features,
    monthly: price(name, 'monthly'),
    annual: price(name, 'annual'),
  }));
}

module.exports = { LEVELS, PLANS, price, levelIndex, catalogue };
