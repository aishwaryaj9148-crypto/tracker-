/**
 * storage.js — Centralized Data Persistence Layer (Connected to REST API)
 * ---------------------------------------------------------------------------
 * Replaces browser LocalStorage persistence with async fetch() calls to the
 * Node.js + Express + SQLite backend.
 *
 * In-memory cache is maintained so synchronous calculations in dashboard,
 * transactions, analytics, and budget modules continue to work seamlessly.
 */

const API_BASE = '';

const STORAGE_KEYS = {
  TRANSACTIONS: 'ledgerflow_transactions_v1',
  BUDGET: 'ledgerflow_budget_v1',
  INITIALIZED: 'ledgerflow_initialized_v1',
  MIGRATED: 'ledgerflow_migrated_v1',
};

const DEFAULT_BUDGET = {
  monthlyLimit: 3200,
  updatedAt: new Date().toISOString(),
};

// In-memory cache
let cachedTransactions = [];
let cachedSavingsGoals = [];
const cachedBudgets = new Map(); // key: "YYYY-MM" -> { id, year, month, monthlyLimit, updatedAt }
let currentBudget = { ...DEFAULT_BUDGET };

/**
 * Normalizes a savings goal record from the API.
 */
function normalizeSavingsGoal(raw) {
  return {
    id: String(raw.id || ''),
    goal_name: String(raw.goal_name || '').trim(),
    target_amount: Number(Number(raw.target_amount || 0).toFixed(2)),
    current_amount: Number(Number(raw.current_amount || 0).toFixed(2)),
    target_date: raw.target_date ? String(raw.target_date).trim() : '',
    description: String(raw.description || '').trim(),
    created_at: raw.created_at || '',
  };
}

/**
 * Normalizes a transaction record from the API or LocalStorage.
 */
function normalizeTransaction(raw) {
  return {
    id: String(raw.id || ''),
    title: String(raw.title || '').trim(),
    amount: Number(Number(raw.amount || 0).toFixed(2)),
    category: String(raw.category || 'Other').trim(),
    type: raw.type === 'income' ? 'income' : 'expense',
    date: String(raw.date || ''),
    description: String(raw.description || '').trim(),
    createdAt: raw.created_at || raw.createdAt || '',
  };
}

/**
 * Low-level API request helper with error handling.
 */
async function apiRequest(endpoint, method = 'GET', data = null) {
  const options = {
    method,
    headers: {
      Accept: 'application/json',
    },
  };

  if (data && (method === 'POST' || method === 'PUT')) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(data);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, options);
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = result.error || `Request failed with status ${response.status}`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.response = result;
    throw err;
  }

  return result.data !== undefined ? result.data : result;
}

/**
 * Fetches all transactions from the REST API (newest first).
 */
export async function refreshTransactionsFromApi() {
  const data = await apiRequest('/api/transactions', 'GET');
  cachedTransactions = Array.isArray(data) ? data.map(normalizeTransaction) : [];
  return cachedTransactions;
}

/**
 * Fetches the budget for a specific year and month from the REST API.
 */
export async function loadBudgetForMonth(monthKey) {
  if (!monthKey || monthKey === 'all') {
    return currentBudget;
  }

  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);

  if (!year || !month) return currentBudget;

  try {
    const data = await apiRequest(`/api/budgets/${year}/${month}`, 'GET');
    const budgetObj = {
      id: data.id,
      year: data.year,
      month: data.month,
      monthlyLimit: Number(data.amount),
      updatedAt: data.created_at || new Date().toISOString(),
    };
    cachedBudgets.set(monthKey, budgetObj);
    currentBudget = budgetObj;
    return budgetObj;
  } catch (err) {
    if (err.status === 404) {
      // No custom budget set for this specific month: fall back to current or default limit
      const fallback = {
        monthlyLimit: currentBudget.monthlyLimit || DEFAULT_BUDGET.monthlyLimit,
        updatedAt: new Date().toISOString(),
      };
      cachedBudgets.set(monthKey, fallback);
      return fallback;
    }
    throw err;
  }
}

/**
 * Refreshes all in-memory data from the API.
 */
export async function refreshFromApi(activeMonthKey) {
  await Promise.all([
    refreshTransactionsFromApi(),
    refreshSavingsGoalsFromApi(),
  ]);
  if (activeMonthKey && activeMonthKey !== 'all') {
    await loadBudgetForMonth(activeMonthKey);
  } else {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    await loadBudgetForMonth(currentMonthKey);
  }
}

/**
 * Fetches all savings goals from the REST API.
 */
export async function refreshSavingsGoalsFromApi() {
  const data = await apiRequest('/api/savings-goals', 'GET');
  cachedSavingsGoals = Array.isArray(data) ? data.map(normalizeSavingsGoal) : [];
  return cachedSavingsGoals;
}

/**
 * Returns currently cached savings goals synchronously.
 */
export function getSavingsGoals() {
  return [...cachedSavingsGoals];
}

/**
 * Creates and persists a new savings goal via POST /api/savings-goals.
 */
export async function addSavingsGoal(goalInput) {
  const payload = {
    goal_name: String(goalInput.goal_name || '').trim(),
    target_amount: Number(goalInput.target_amount),
    current_amount: goalInput.current_amount !== undefined && goalInput.current_amount !== ''
      ? Number(goalInput.current_amount)
      : 0,
    target_date: goalInput.target_date ? String(goalInput.target_date).trim() : null,
    description: String(goalInput.description || '').trim(),
  };

  const created = await apiRequest('/api/savings-goals', 'POST', payload);
  const normalized = normalizeSavingsGoal(created);
  cachedSavingsGoals.push(normalized);
  return normalized;
}

/**
 * Updates an existing savings goal via PUT /api/savings-goals/:id.
 */
export async function updateSavingsGoal(id, updates) {
  const payload = {};
  if (updates.goal_name !== undefined) payload.goal_name = String(updates.goal_name).trim();
  if (updates.target_amount !== undefined) payload.target_amount = Number(updates.target_amount);
  if (updates.current_amount !== undefined) payload.current_amount = Number(updates.current_amount);
  if (updates.target_date !== undefined) payload.target_date = updates.target_date ? String(updates.target_date).trim() : null;
  if (updates.description !== undefined) payload.description = String(updates.description).trim();

  const updated = await apiRequest(`/api/savings-goals/${id}`, 'PUT', payload);
  const normalized = normalizeSavingsGoal(updated);

  const idx = cachedSavingsGoals.findIndex((g) => g.id === String(id));
  if (idx !== -1) {
    cachedSavingsGoals[idx] = normalized;
  }
  return normalized;
}

/**
 * Deletes a savings goal via DELETE /api/savings-goals/:id.
 */
export async function deleteSavingsGoal(id) {
  await apiRequest(`/api/savings-goals/${id}`, 'DELETE');
  cachedSavingsGoals = cachedSavingsGoals.filter((g) => g.id !== String(id));
  return true;
}

/**
 * Migrates existing data from LocalStorage to the database via API.
 * Sets a flag in LocalStorage so it only runs once.
 * Preserves the original LocalStorage records as backup.
 */
async function migrateLocalStorageIfNeeded() {
  const isMigrated = localStorage.getItem(STORAGE_KEYS.MIGRATED);
  if (isMigrated === 'true') {
    return 0;
  }

  let importedCount = 0;

  // 1. Migrate LocalStorage transactions
  try {
    const rawTx = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (rawTx) {
      const parsed = JSON.parse(rawTx);
      if (Array.isArray(parsed) && parsed.length > 0) {
        for (const item of parsed) {
          try {
            await apiRequest('/api/transactions', 'POST', {
              title: item.title,
              amount: item.amount,
              category: item.category,
              type: item.type,
              date: item.date,
              description: item.description || '',
            });
            importedCount++;
          } catch (itemErr) {
            console.warn('Skipping invalid migration item:', item, itemErr);
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to read transactions from LocalStorage for migration:', err);
  }

  // 2. Migrate LocalStorage budget
  try {
    const rawBudget = localStorage.getItem(STORAGE_KEYS.BUDGET);
    if (rawBudget) {
      const parsed = JSON.parse(rawBudget);
      const limit = Number(parsed.monthlyLimit);
      if (Number.isFinite(limit) && limit > 0) {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        try {
          await apiRequest('/api/budgets', 'POST', {
            year,
            month,
            amount: limit,
          });
        } catch (budgetErr) {
          // If conflict (already exists), ignore
          if (budgetErr.status !== 409) {
            console.warn('Could not migrate initial budget limit:', budgetErr);
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to read budget from LocalStorage for migration:', err);
  }

  // Set migrated flag so this migration routine never runs twice
  localStorage.setItem(STORAGE_KEYS.MIGRATED, 'true');
  return importedCount;
}

/**
 * Initializes the data layer: runs migration once, then loads fresh API records.
 */
export async function initializeStorage(activeMonthKey) {
  const importedCount = await migrateLocalStorageIfNeeded();
  await refreshFromApi(activeMonthKey);
  return { importedCount };
}

/**
 * Returns currently cached transactions synchronously.
 */
export function getTransactions() {
  return [...cachedTransactions];
}

/**
 * Creates and persists a new transaction via POST /api/transactions.
 */
export async function addTransaction(transactionInput) {
  const payload = {
    title: String(transactionInput.title || '').trim(),
    amount: Number(transactionInput.amount),
    category: String(transactionInput.category || '').trim(),
    type: transactionInput.type,
    date: String(transactionInput.date || '').trim(),
    description: String(transactionInput.description || '').trim(),
  };

  const created = await apiRequest('/api/transactions', 'POST', payload);
  const normalized = normalizeTransaction(created);
  cachedTransactions.unshift(normalized);
  return normalized;
}

/**
 * Updates an existing transaction via PUT /api/transactions/:id.
 */
export async function updateTransaction(id, updates) {
  const payload = {
    title: String(updates.title || '').trim(),
    amount: Number(updates.amount),
    category: String(updates.category || '').trim(),
    type: updates.type,
    date: String(updates.date || '').trim(),
    description: String(updates.description || '').trim(),
  };

  const updated = await apiRequest(`/api/transactions/${id}`, 'PUT', payload);
  const normalized = normalizeTransaction(updated);

  const idx = cachedTransactions.findIndex((tx) => tx.id === String(id));
  if (idx !== -1) {
    cachedTransactions[idx] = normalized;
  }
  return normalized;
}

/**
 * Deletes a transaction via DELETE /api/transactions/:id.
 */
export async function deleteTransaction(id) {
  await apiRequest(`/api/transactions/${id}`, 'DELETE');
  cachedTransactions = cachedTransactions.filter((tx) => tx.id !== String(id));
  return true;
}

/**
 * Retrieves monthly budget settings synchronously for an active month.
 */
export function getBudget(monthKey) {
  if (monthKey && cachedBudgets.has(monthKey)) {
    return cachedBudgets.get(monthKey);
  }
  return currentBudget;
}

/**
 * Saves monthly budget settings via POST or PUT /api/budgets.
 */
export async function saveBudget(monthlyLimit, targetYear, targetMonth) {
  const numericLimit = Number(Number(monthlyLimit).toFixed(2));
  const now = new Date();
  const year = targetYear || now.getFullYear();
  const month = targetMonth || now.getMonth() + 1;
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;

  const existingInCache = cachedBudgets.get(monthKey);

  let saved;
  if (existingInCache && existingInCache.id) {
    // Update existing budget record
    saved = await apiRequest(`/api/budgets/${existingInCache.id}`, 'PUT', {
      amount: numericLimit,
      year,
      month,
    });
  } else {
    // Attempt to create new budget record
    try {
      saved = await apiRequest('/api/budgets', 'POST', {
        year,
        month,
        amount: numericLimit,
      });
    } catch (err) {
      if (err.status === 409) {
        // Record already exists in DB; fetch it first then update
        const existing = await apiRequest(`/api/budgets/${year}/${month}`, 'GET');
        saved = await apiRequest(`/api/budgets/${existing.id}`, 'PUT', {
          amount: numericLimit,
          year,
          month,
        });
      } else {
        throw err;
      }
    }
  }

  const updatedBudgetObj = {
    id: saved.id,
    year: saved.year,
    month: saved.month,
    monthlyLimit: Number(saved.amount),
    updatedAt: saved.created_at || new Date().toISOString(),
  };

  cachedBudgets.set(monthKey, updatedBudgetObj);
  currentBudget = updatedBudgetObj;
  return updatedBudgetObj;
}

/**
 * Resets database transactions to the initial sample dataset.
 */
export async function resetToSampleData() {
  // 1. Delete all current transactions through the API
  const currentList = [...cachedTransactions];
  for (const item of currentList) {
    try {
      await apiRequest(`/api/transactions/${item.id}`, 'DELETE');
    } catch (e) {
      console.warn('Could not delete item during reset:', item.id, e);
    }
  }

  // 2. Insert sample transactions
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const mPrev = String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, '0');
  const yPrev = now.getMonth() === 0 ? y - 1 : y;

  const samples = [
    { title: 'Monthly Salary', amount: 5400, category: 'Salary', type: 'income', date: `${y}-${m}-01`, description: 'Primary engineering payroll deposit' },
    { title: 'Apartment Rent', amount: 1450, category: 'Housing', type: 'expense', date: `${y}-${m}-02`, description: 'Monthly lease payment' },
    { title: 'Grocery Shopping', amount: 215.40, category: 'Food', type: 'expense', date: `${y}-${m}-04`, description: 'Weekly fresh produce' },
    { title: 'Freelance UI Audit', amount: 750, category: 'Freelance', type: 'income', date: `${y}-${m}-06`, description: 'Design systems consulting invoice' },
    { title: 'Electric & Fiber Internet', amount: 148.90, category: 'Utilities', type: 'expense', date: `${y}-${m}-08`, description: 'Monthly utility bill' },
    { title: 'Metro Pass & Fuel', amount: 118.50, category: 'Transportation', type: 'expense', date: `${y}-${m}-10`, description: 'Commuter transit pass' },
    { title: 'Prior Month Rent', amount: 1450, category: 'Housing', type: 'expense', date: `${yPrev}-${mPrev}-02`, description: 'Prior lease payment' },
    { title: 'Prior Month Salary', amount: 5400, category: 'Salary', type: 'income', date: `${yPrev}-${mPrev}-01`, description: 'Prior payroll deposit' },
  ];

  for (const sample of samples) {
    await apiRequest('/api/transactions', 'POST', sample);
  }

  await refreshTransactionsFromApi();
  return getTransactions();
}
