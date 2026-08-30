// Engagements: work income as first-class objects (hours × rate per client, or a
// flat annual amount), so the retirement model can answer "what does dropping
// Avance to 10 hours cost me?" directly. Mirrors the CLIENTS table on Business.jsx.
//
// An engagement: { id, label, hoursPerWeek, rate, weeksPerYear, annualAmount, throughAge }
//  - gross/yr = hoursPerWeek × rate × weeksPerYear + annualAmount
//  - active through `throughAge` inclusive (real dollars, so raises ≈ inflation)

import { netFrom1099 } from './tax2026';

export const DEFAULT_ENGAGEMENTS = [
  { id: 'avance', label: 'Avance Care clinical', hoursPerWeek: 10, rate: 250, weeksPerYear: 46, annualAmount: 0, throughAge: 64 },
  { id: 'gma', label: 'Gray Matter retainer', hoursPerWeek: 0, rate: 0, weeksPerYear: 0, annualAmount: 12000, throughAge: 62 },
  { id: 'unc', label: 'UNC Charlotte', hoursPerWeek: 0, rate: 0, weeksPerYear: 0, annualAmount: 10000, throughAge: 64 },
];

export function engagementGross(e) {
  if (!e) return 0;
  return (Number(e.hoursPerWeek) || 0) * (Number(e.rate) || 0) * (Number(e.weeksPerYear) || 0)
    + (Number(e.annualAmount) || 0);
}

export function grossAtAge(engagements, age) {
  return (engagements || []).reduce(
    (s, e) => s + (age <= (Number(e.throughAge) || 0) ? engagementGross(e) : 0), 0);
}

export function hoursPerWeekAtAge(engagements, age) {
  return (engagements || []).reduce(
    (s, e) => s + (age <= (Number(e.throughAge) || 0) ? (Number(e.hoursPerWeek) || 0) : 0), 0);
}

// { age: after-tax work income } for every age in [startAge, endAge].
export function workNetByAge(engagements, startAge, endAge) {
  const out = {};
  if (!engagements?.length) return out;
  for (let age = startAge; age <= endAge; age++) {
    const gross = grossAtAge(engagements, age);
    out[age] = gross > 0 ? netFrom1099(gross).net : 0;
  }
  return out;
}
