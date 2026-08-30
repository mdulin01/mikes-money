export const ALLOWED_EMAILS = ['mdulin@gmail.com'];

// User profile — single-user app, so hardcoded here rather than stored in Firestore.
export const USER_PROFILE = {
  name: 'Mike Dulin',
  birthdate: '1967-01-11',   // YYYY-MM-DD, local
};

export const COLLECTIONS = {
  FINANCE_DATA: 'finances',        // Single user-doc for config/budgets/scenarios
  ACCOUNTS: 'accounts',             // Written by Cloud Functions on Plaid sync
  TRANSACTIONS: 'transactions',     // Written by Cloud Functions; categorization editable
  PLAID_ITEMS: 'plaidItems',        // Link metadata (tokens stored server-side only)
  HOLDINGS: 'holdings',             // Investment positions (ticker, qty, value)
  LIABILITIES: 'liabilities',       // Credit/mortgage/student loan detail
  NET_WORTH_HISTORY: 'netWorthHistory', // Daily snapshots
  DASHBOARD_SNAPSHOTS: 'dashboardSnapshots', // Daily computed dashboard values for Rupert
};

// Single user-doc id
export const USER_DOC_ID = 'user-money-data';

export const SECTIONS = [
  { id: 'dashboard',   label: 'Dashboard',   emoji: '📊' },
  { id: 'accounts',    label: 'Accounts',    emoji: '🏦' },
  { id: 'holdings',    label: 'Holdings',    emoji: '📈' },
  { id: 'allocation',  label: 'Allocate',    emoji: '🥧' },
  { id: 'retirement',  label: 'Retire',      emoji: '🏖️' },
  { id: 'checkup',     label: 'Checkup',     emoji: '🩺' },
  { id: 'transactions', label: 'Txns',       emoji: '💳' },
  { id: 'budgets',     label: 'Budgets',     emoji: '🎯' },
  { id: 'cashflow',    label: 'Cash Flow',   emoji: '💰' },
  { id: 'business',    label: 'Business',    emoji: '💼' },
  { id: 'rent',        label: 'Rentals',     emoji: '🏘️' },
  { id: 'mortgages',   label: 'Mortgages',   emoji: '🏦' },
  { id: 'tax',         label: 'Tax',         emoji: '🧾' },
  { id: 'handoff',     label: 'Handoff',     emoji: '🤝' },
];

// Plaid account types → internal classification
export const ACCOUNT_TYPES = [
  { id: 'depository',   label: 'Cash',        side: 'asset',     emoji: '💵' },
  { id: 'investment',   label: 'Investments', side: 'asset',     emoji: '📈' },
  { id: 'loan',         label: 'Loans',       side: 'liability', emoji: '🧾' },
  { id: 'credit',       label: 'Credit Card', side: 'liability', emoji: '💳' },
  { id: 'mortgage',     label: 'Mortgage',    side: 'liability', emoji: '🏠' },
  { id: 'real-estate',  label: 'Real Estate', side: 'asset',     emoji: '🏘️' },
  { id: 'other',        label: 'Other',       side: 'asset',     emoji: '📦' },
];

// Default spending categories (editable)
export const DEFAULT_CATEGORIES = [
  { id: 'housing',       label: 'Housing',        emoji: '🏠', kind: 'expense' },
  { id: 'utilities',     label: 'Utilities',      emoji: '💡', kind: 'expense' },
  { id: 'groceries',     label: 'Groceries',      emoji: '🛒', kind: 'expense' },
  { id: 'dining',        label: 'Dining Out',     emoji: '🍽️', kind: 'expense' },
  { id: 'transport',     label: 'Transportation', emoji: '🚗', kind: 'expense' },
  { id: 'health',        label: 'Health',         emoji: '❤️', kind: 'expense' },
  { id: 'entertainment', label: 'Entertainment',  emoji: '🎬', kind: 'expense' },
  { id: 'shopping',      label: 'Shopping',       emoji: '🛍️', kind: 'expense' },
  { id: 'travel',        label: 'Travel',         emoji: '✈️', kind: 'expense' },
  { id: 'subscriptions', label: 'Subscriptions',  emoji: '🔁', kind: 'expense' },
  { id: 'insurance',     label: 'Insurance',      emoji: '🛡️', kind: 'expense' },
  { id: 'taxes',         label: 'Taxes',          emoji: '📑', kind: 'expense' },
  { id: 'kids',          label: 'Kids / Family',  emoji: '👨‍👩‍👧', kind: 'expense' },
  { id: 'gifts',         label: 'Gifts / Charity', emoji: '🎁', kind: 'expense' },
  { id: 'fees',          label: 'Fees',           emoji: '💸', kind: 'expense' },
  { id: 'mortgage',      label: 'Mortgage / Interest', emoji: '🏦', kind: 'expense' },
  { id: 'hoa',           label: 'HOA / Dues',     emoji: '🏘️', kind: 'expense' },
  { id: 'maintenance',   label: 'Maintenance / Repairs', emoji: '🔧', kind: 'expense' },
  { id: 'prof-dev',      label: 'Professional Development', emoji: '🎓', kind: 'expense' },
  { id: 'licensing',     label: 'Licensing / Credentials', emoji: '🪪', kind: 'expense' },
  { id: 'other-exp',     label: 'Other',          emoji: '📦', kind: 'expense' },
  { id: 'salary',        label: 'Salary',         emoji: '💰', kind: 'income' },
  { id: 'retirement-inc', label: 'Retirement Income (IRA)', emoji: '🏖️', kind: 'income' },
  { id: 'rental',        label: 'Rental Income',  emoji: '🏘️', kind: 'income' },
  { id: 'investment-inc', label: 'Investment Income', emoji: '📈', kind: 'income' },
  { id: 'other-inc',     label: 'Other Income',   emoji: '💵', kind: 'income' },
  { id: 'transfer',      label: 'Transfer',       emoji: '🔄', kind: 'transfer' },
];

// Tax / ownership class layered on top of categories (Sch C business vs Sch E rental vs personal).
export const CLASSES = [
  { id: 'business',    label: 'Business',           emoji: '💼' },
  { id: 'rental',      label: 'Rental',             emoji: '🏘️' },
  { id: 'personal',    label: 'Personal',           emoji: '🏡' },
  { id: 'work-travel', label: 'Work Travel',        emoji: '✈️' },
  { id: 'split',       label: 'Biz/Rental (50/50)', emoji: '🔀' },
];
