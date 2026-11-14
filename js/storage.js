/**
 * storage.js — Centralized Data Persistence Layer
 * ---------------------------------------------------------------------------
 * Currently backed by browser LocalStorage. Designed with clean repository
 * boundaries so every method can be swapped to async REST API calls
 * (Node.js / Express / SQL) without modifying UI components or calculations.
 */

const STORAGE_KEYS = {
  TRANSACTIONS: 'ledgerflow_transactions_v1',
  BUDGET: 'ledgerflow_budget_v1',
  INITIALIZED: 'ledgerflow_initialized_v1',
};

const DEFAULT_BUDGET = {
  monthlyLimit: 3200,
  updatedAt: '2026-11-01T09:00:00.000Z',
};

function getOffsetMonthKey(monthsBack) {
  const now = new Date();
  const dt = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function buildSampleTransactions() {
  const m0 = getOffsetMonthKey(0);
  const m1 = getOffsetMonthKey(1);
  const m2 = getOffsetMonthKey(2);

  return [
    {
      id: 'tx_sample_01',
      title: 'Monthly Salary',
      amount: 5400,
      category: 'Salary',
      type: 'income',
      date: `${m0}-01`,
      description: 'Primary engineering payroll deposit',
    },
    {
      id: 'tx_sample_02',
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: `${m0}-02`,
      description: 'Monthly lease payment',
    },
    {
      id: 'tx_sample_03',
      title: 'Grocery Shopping',
      amount: 215.4,
      category: 'Food',
      type: 'expense',
      date: `${m0}-04`,
      description: 'Weekly fresh produce and pantry staples',
    },
    {
      id: 'tx_sample_04',
      title: 'Freelance UI Audit',
      amount: 750,
      category: 'Freelance',
      type: 'income',
      date: `${m0}-06`,
      description: 'Design systems consulting invoice',
    },
    {
      id: 'tx_sample_05',
      title: 'Electric & Fiber Internet',
      amount: 148.9,
      category: 'Utilities',
      type: 'expense',
      date: `${m0}-08`,
      description: 'Monthly utility and broadband bill',
    },
    {
      id: 'tx_sample_06',
      title: 'Metro Pass & Fuel',
      amount: 118.5,
      category: 'Transportation',
      type: 'expense',
      date: `${m0}-10`,
      description: 'Commuter transit pass and fuel refill',
    },
    {
      id: 'tx_sample_07',
      title: 'Pharmacy & Dental Checkup',
      amount: 165,
      category: 'Healthcare',
      type: 'expense',
      date: `${m0}-11`,
      description: 'Routine dental cleaning copay',
    },
    {
      id: 'tx_sample_08',
      title: 'Whole Foods Market',
      amount: 134.25,
      category: 'Food',
      type: 'expense',
      date: `${m0}-13`,
      description: 'Mid-week groceries and coffee beans',
    },
    {
      id: 'tx_sample_09',
      title: 'Monthly Salary',
      amount: 5400,
      category: 'Salary',
      type: 'income',
      date: `${m1}-01`,
      description: 'Prior month payroll deposit',
    },
    {
      id: 'tx_sample_10',
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: `${m1}-02`,
      description: 'Prior month lease payment',
    },
    {
      id: 'tx_sample_11',
      title: 'Grocery & Dining',
      amount: 490,
      category: 'Food',
      type: 'expense',
      date: `${m1}-14`,
      description: 'Groceries and weekend dinner',
    },
    {
      id: 'tx_sample_12',
      title: 'Cloud & Streaming Subscriptions',
      amount: 64,
      category: 'Entertainment',
      type: 'expense',
      date: `${m1}-19`,
      description: 'Music, film, and cloud storage',
    },
    {
      id: 'tx_sample_13',
      title: 'Monthly Salary',
      amount: 5200,
      category: 'Salary',
      type: 'income',
      date: `${m2}-01`,
      description: 'Payroll deposit',
    },
    {
      id: 'tx_sample_14',
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: `${m2}-02`,
      description: 'Lease payment',
    },
    {
      id: 'tx_sample_15',
      title: 'Technical Books & Course',
      amount: 210,
      category: 'Education',
      type: 'expense',
      date: `${m2}-18`,
      description: 'Systems architecture study materials',
    },
  ];
}

/**
 * Generates a unique transaction identifier.
 */
function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `tx_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Normalizes a raw transaction object into the strict application schema.
 */
function normalizeTransaction(raw) {
  return {
    id: String(raw.id || generateId()),
    title: String(raw.title || '').trim(),
    amount: Number(Number(raw.amount || 0).toFixed(2)),
    category: String(raw.category || 'Other').trim(),
    type: raw.type === 'income' ? 'income' : 'expense',
    date: String(raw.date || ''),
    description: String(raw.description || '').trim(),
  };
}

/**
 * Seeds sample transactions and default budget on very first visit.
 */
export function initializeStorage() {
  try {
    const initialized = localStorage.getItem(STORAGE_KEYS.INITIALIZED);
    if (!initialized) {
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(buildSampleTransactions()));
      localStorage.setItem(STORAGE_KEYS.BUDGET, JSON.stringify(DEFAULT_BUDGET));
      localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
    }
  } catch (err) {
    console.error('Failed to initialize LocalStorage:', err);
  }
}

/**
 * Resets LocalStorage to the curated sample dataset.
 */
export function resetToSampleData() {
  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(buildSampleTransactions()));
  localStorage.setItem(STORAGE_KEYS.BUDGET, JSON.stringify(DEFAULT_BUDGET));
  localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  return getTransactions();
}

/**
 * Retrieves all transactions from LocalStorage.
 * Future API swap: return await fetch('/api/transactions').then(r => r.json());
 */
export function getTransactions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeTransaction);
  } catch (err) {
    console.error('Failed to parse transactions from LocalStorage:', err);
    return [];
  }
}

/**
 * Persists the full transaction collection.
 */
export function saveTransactions(transactions) {
  const normalized = Array.isArray(transactions) ? transactions.map(normalizeTransaction) : [];
  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(normalized));
  return normalized;
}

/**
 * Creates and persists a new transaction.
 * Future API swap: POST /api/transactions
 */
export function addTransaction(transactionInput) {
  const transactions = getTransactions();
  const created = normalizeTransaction({
    ...transactionInput,
    id: generateId(),
  });
  transactions.push(created);
  saveTransactions(transactions);
  return created;
}

/**
 * Updates an existing transaction by ID.
 * Future API swap: PUT /api/transactions/:id
 */
export function updateTransaction(id, updates) {
  const transactions = getTransactions();
  const idx = transactions.findIndex((tx) => tx.id === id);
  if (idx === -1) return null;

  const updated = normalizeTransaction({
    ...transactions[idx],
    ...updates,
    id,
  });
  transactions[idx] = updated;
  saveTransactions(transactions);
  return updated;
}

/**
 * Deletes a transaction by ID.
 * Future API swap: DELETE /api/transactions/:id
 */
export function deleteTransaction(id) {
  const transactions = getTransactions();
  const next = transactions.filter((tx) => tx.id !== id);
  if (next.length === transactions.length) return false;
  saveTransactions(next);
  return true;
}

/**
 * Retrieves monthly budget settings.
 * Future API swap: GET /api/budget
 */
export function getBudget() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BUDGET);
    if (!raw) return { ...DEFAULT_BUDGET };
    const parsed = JSON.parse(raw);
    const limit = Number(parsed.monthlyLimit);
    return {
      monthlyLimit: Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_BUDGET.monthlyLimit,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch (err) {
    console.error('Failed to parse budget from LocalStorage:', err);
    return { ...DEFAULT_BUDGET };
  }
}

/**
 * Saves monthly budget settings.
 * Future API swap: PUT /api/budget
 */
export function saveBudget(monthlyLimit) {
  const numericLimit = Number(Number(monthlyLimit).toFixed(2));
  const payload = {
    monthlyLimit: numericLimit,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEYS.BUDGET, JSON.stringify(payload));
  return payload;
}
