// rainbow-rentals connector — talks DIRECTLY to the rainbow-rentals Firebase project
// (rainbow-rentals) from this app via a secondary Firebase app instance.
//
// Auth: rainbow-rentals Firestore rules allow mdulin@gmail.com (email-locked), so we
// sign into that project with the same Google account (one popup, then cached locally).
// ⚠️ One-time console step: rainbow-rentals Firebase → Authentication → Settings →
// Authorized domains must include www.mikesmoney.app + mikes-money.vercel.app,
// or the popup fails with auth/unauthorized-domain.
//
// Data model there (single doc): rentalData/rent = { payments: [...], lastUpdated, updatedBy }
// payment: { id, incomeType:'rent', propertyId (RR id), propertyName, tenantName,
//            month:'YYYY-MM', amount, datePaid:'YYYY-MM-DD', status, notes, ... }
// Synced payments get id `mm-<txnId>` + source:'mikes-money' → idempotent re-syncs.

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const RR_CONFIG = {
  apiKey: 'AIzaSyCHkestt-F4NqtzNmPbMzDwLNQ6g8xFAjM',
  authDomain: 'rainbow-rentals.firebaseapp.com',
  projectId: 'rainbow-rentals',
  storageBucket: 'rainbow-rentals.firebasestorage.app',
  messagingSenderId: '558747458333',
  appId: '1:558747458333:web:3f0483e2d67588473a9ff4',
};

const APP_NAME = 'rainbow-rentals';

function rrApp() {
  return getApps().find(a => a.name === APP_NAME) || initializeApp(RR_CONFIG, APP_NAME);
}

export const rrAuth = () => getAuth(rrApp());
export const rrDb = () => getFirestore(rrApp());

export async function rrSignIn() {
  const auth = rrAuth();
  if (auth.currentUser) return auth.currentUser;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ login_hint: 'mdulin@gmail.com' });
  const res = await signInWithPopup(auth, provider);
  return res.user;
}

export const rrSignOut = () => signOut(rrAuth());

export async function fetchRR() {
  const db = rrDb();
  const [propsSnap, rentSnap] = await Promise.all([
    getDoc(doc(db, 'rentalData', 'properties')),
    getDoc(doc(db, 'rentalData', 'rent')),
  ]);
  return {
    properties: propsSnap.data()?.properties || [],
    payments: rentSnap.data()?.payments || [],
  };
}

// Full-array write (rainbow-rentals keeps all payments in one doc).
export async function writeRRPayments(allPayments) {
  await setDoc(doc(rrDb(), 'rentalData', 'rent'), JSON.parse(JSON.stringify({
    payments: allPayments,
    lastUpdated: new Date().toISOString(),
    updatedBy: 'mikes-money sync',
  })), { merge: true });
}

// --- Liam expense-review queue (rendered on rainbow-rentals' Action Items page) ---
// rentalData/expenseReview = { items: [{ id:'mm-<txnid>', date, amount, description,
//   suggestedPropertyId (RR id|null), reason:'liam'|'tagged-rental', status:'pending'|
//   'approved'|'dismissed', addedAt }], lastUpdated, updatedBy }
export async function fetchRRReview() {
  const snap = await getDoc(doc(rrDb(), 'rentalData', 'expenseReview'));
  return snap.data()?.items || [];
}

export async function writeRRReview(items) {
  await setDoc(doc(rrDb(), 'rentalData', 'expenseReview'), JSON.parse(JSON.stringify({
    items,
    lastUpdated: new Date().toISOString(),
    updatedBy: 'mikes-money sync',
  })), { merge: true });
}

// Auto-match a mikes-money propertyId to a rainbow-rentals property by name/address keywords.
const MAP_HINTS = {
  'north-elm': ['elm'],
  'green-crest': ['green crest', 'greencrest'],
  'brookhurst': ['brookhurst'],
  'prairie-trail': ['prairie'],
  'hillcrest': ['hillcrest'],
};

export function autoMapProperties(rrProperties) {
  const map = {};
  for (const [mmId, hints] of Object.entries(MAP_HINTS)) {
    const hit = rrProperties.find(p => {
      const label = `${p.name || ''} ${p.address || ''}`.toLowerCase();
      return hints.some(h => label.includes(h));
    });
    if (hit) map[mmId] = String(hit.id);
  }
  return map;
}
