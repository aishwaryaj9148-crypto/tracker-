/**
 * transactions.js — Transaction Domain Logic, Calculations, Validation & History View
 * ---------------------------------------------------------------------------
 * Pure calculation and filtering helpers are strictly decoupled from LocalStorage.
 */

export const CATEGORIES = {
  expense: [
    'Food',
    'Housing',
    'Transportation',
    'Utilities',
    'Healthcare',
    'Entertainment',
    'Shopping',
    'Education',
    'Other',
  ],
  income: ['Salary', 'Freelance', 'Investments', 'Business', 'Gifts', 'Other'],
};

export const CATEGORY_COLORS = {
  Food: '#1d4ed8',
  Housing: '#0f766e',
  Transportation: '#d97706',
  Utilities: '#6366f1',
  Healthcare: '#dc2626',
  Entertainment: '#7c3aed',
  Shopping: '#db2777',
  Education: '#0284c7',
  Salary: '#16a34a',
  Freelance: '#059669',
  Investments: '#0d9488',
  Business: '#2563eb',
  Gifts: '#9333ea',
  Other: '#64748b',
};

/**
 * Escapes HTML special characters to prevent XSS in template strings.
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formats a number as USD currency with consistent two-decimal precision.
 */
export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  const abs = Math.abs(num);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return num < 0 ? `-${formatted}` : formatted;
}

/**
 * Formats YYYY-MM-DD into a compact readable date (e.g., "Nov 13, 2026").
 */
export function formatDisplayDate(dateStr) {
  if (!dateStr) return '—';
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return dateStr;
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(dt);
}

/**
 * Formats YYYY-MM into "November 2026".
 */
export function formatMonthLabel(monthKey) {
  if (!monthKey || monthKey === 'all') return 'All Time';
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  const dt = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(dt);
}

/**
 * Returns YYYY-MM for today in local time.
 */
export function getCurrentMonthKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Returns YYYY-MM-DD for today in local time.
 */
export function getTodayDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Pure calculation: Total Income, Total Expenses, and Total Balance.
 * Total Balance = Total Income - Total Expenses.
 */
export function calculateTotals(transactions) {
  let totalIncome = 0;
  let totalExpenses = 0;
  let incomeCount = 0;
  let expenseCount = 0;

  for (const tx of transactions) {
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'income') {
      totalIncome += amt;
      incomeCount += 1;
    } else {
      totalExpenses += amt;
      expenseCount += 1;
    }
  }

  return {
    totalIncome: Number(totalIncome.toFixed(2)),
    totalExpenses: Number(totalExpenses.toFixed(2)),
    totalBalance: Number((totalIncome - totalExpenses).toFixed(2)),
    incomeCount,
    expenseCount,
  };
}

/**
 * Pure filter: returns transactions matching a specific YYYY-MM month key (or all if 'all').
 */
export function filterByMonth(transactions, monthKey) {
  if (!monthKey || monthKey === 'all') return [...transactions];
  return transactions.filter((tx) => typeof tx.date === 'string' && tx.date.startsWith(monthKey));
}

/**
 * Pure calculation: groups expense transactions by category, sorted highest to lowest.
 */
export function getExpenseCategoryTotals(transactions) {
  const map = new Map();
  let total = 0;

  for (const tx of transactions) {
    if (tx.type !== 'expense') continue;
    const amt = Number(tx.amount) || 0;
    total += amt;
    const current = map.get(tx.category) || { category: tx.category, amount: 0, count: 0 };
    current.amount += amt;
    current.count += 1;
    map.set(tx.category, current);
  }

  return Array.from(map.values())
    .map((item) => ({
      ...item,
      amount: Number(item.amount.toFixed(2)),
      percentage: total > 0 ? Number(((item.amount / total) * 100).toFixed(1)) : 0,
      color: CATEGORY_COLORS[item.category] || CATEGORY_COLORS.Other,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Returns sorted unique YYYY-MM month keys present in transactions, always including current month.
 */
export function getAvailableMonths(transactions) {
  const set = new Set([getCurrentMonthKey()]);
  for (const tx of transactions) {
    if (typeof tx.date === 'string' && tx.date.length >= 7) {
      set.add(tx.date.slice(0, 7));
    }
  }
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

/**
 * Returns all unique categories across both income and expense plus any custom ones in data.
 */
export function getAllCategories(transactions) {
  const set = new Set([...CATEGORIES.expense, ...CATEGORIES.income]);
  for (const tx of transactions) {
    if (tx.category) set.add(tx.category);
  }
  return Array.from(set);
}

/**
 * Pure filtering and sorting for Transaction History.
 */
export function filterAndSortTransactions(
  transactions,
  { search = '', category = 'all', type = 'all', sortBy = 'date-desc', month = 'all' }
) {
  const query = search.trim().toLowerCase();

  const filtered = transactions.filter((tx) => {
    if (month !== 'all' && !tx.date.startsWith(month)) return false;
    if (type !== 'all' && tx.type !== type) return false;
    if (category !== 'all' && tx.category !== category) return false;

    if (query) {
      const hay = `${tx.title} ${tx.category} ${tx.description} ${tx.date}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  return filtered.sort((a, b) => {
    switch (sortBy) {
      case 'date-asc':
        return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
      case 'amount-desc':
        return b.amount - a.amount;
      case 'amount-asc':
        return a.amount - b.amount;
      case 'date-desc':
      default:
        return b.date.localeCompare(a.date) || b.id.localeCompare(a.id);
    }
  });
}

/**
 * Validates transaction form input before saving.
 */
export function validateTransactionInput(data) {
  const errors = {};

  const title = String(data.title || '').trim();
  if (!title) {
    errors.title = 'Please enter a transaction title.';
  } else if (title.length < 2) {
    errors.title = 'Title must be at least 2 characters.';
  }

  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    errors.amount = 'Enter a valid amount greater than zero.';
  } else if (amount > 100000000) {
    errors.amount = 'Amount exceeds maximum allowed value.';
  }

  const category = String(data.category || '').trim();
  if (!category) {
    errors.category = 'Please select a category.';
  }

  const date = String(data.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.date = 'Please choose a valid date.';
  } else {
    const parsed = new Date(`${date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      errors.date = 'Invalid calendar date.';
    }
  }

  if (data.type !== 'income' && data.type !== 'expense') {
    errors.type = 'Transaction type must be income or expense.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Exports filtered transactions to a clean CSV download.
 */
export function exportTransactionsToCsv(transactions) {
  const headers = ['ID', 'Date', 'Title', 'Type', 'Category', 'Amount', 'Description'];
  const escapeCsv = (val) => {
    const s = String(val ?? '').replace(/"/g, '""');
    return `"${s}"`;
  };
  const rows = transactions.map((tx) =>
    [tx.id, tx.date, tx.title, tx.type, tx.category, tx.amount.toFixed(2), tx.description]
      .map(escapeCsv)
      .join(',')
  );

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ledgerflow-transactions-${getTodayDateString()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Renders the Transaction History view table and filter controls.
 */
export function renderTransactionsView({
  transactions,
  filters,
  selectedMonth,
  onEdit,
  onDelete,
}) {
  const categorySelect = document.getElementById('tx-category-filter');
  const tbody = document.getElementById('all-transactions-body');
  const tableEl = document.getElementById('all-transactions-table');
  const emptyEl = document.getElementById('all-transactions-empty');
  const countLabel = document.getElementById('tx-count-label');
  const clearBtn = document.getElementById('tx-clear-filters-btn');

  // Populate category filter options while preserving current selection
  const currentCat = filters.category;
  const allCats = getAllCategories(transactions);
  categorySelect.innerHTML = `<option value="all">All Categories</option>${allCats
    .map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`)
    .join('')}`;
  categorySelect.value = allCats.includes(currentCat) ? currentCat : 'all';

  const list = filterAndSortTransactions(transactions, {
    ...filters,
    month: selectedMonth,
  });

  countLabel.textContent = `${list.length} ${list.length === 1 ? 'transaction' : 'transactions'}`;

  const hasActiveFilters =
    Boolean(filters.search.trim()) ||
    filters.type !== 'all' ||
    filters.category !== 'all' ||
    filters.sortBy !== 'date-desc';
  clearBtn.classList.toggle('hidden', !hasActiveFilters);

  if (list.length === 0) {
    tableEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    tbody.innerHTML = '';
    return;
  }

  tableEl.classList.remove('hidden');
  emptyEl.classList.add('hidden');

  tbody.innerHTML = list
    .map((tx) => {
      const isIncome = tx.type === 'income';
      const sign = isIncome ? '+' : '-';
      const amountClass = isIncome ? 'text-income' : 'text-expense';
      const typeLabel = isIncome ? 'Income' : 'Expense';
      const descHtml = tx.description
        ? `<span class="tx-desc-text" title="${escapeHtml(tx.description)}">${escapeHtml(
            tx.description
          )}</span>`
        : '';

      return `
        <tr>
          <td>
            <div class="tx-title-cell">
              <span class="tx-title-text">${escapeHtml(tx.title)}</span>
              ${descHtml}
            </div>
          </td>
          <td class="tx-category-text">${escapeHtml(tx.category)}</td>
          <td>
            <span class="tx-type-label ${isIncome ? 'text-income' : 'text-expense'}">${typeLabel}</span>
          </td>
          <td class="tx-date-text tabular-nums">${escapeHtml(formatDisplayDate(tx.date))}</td>
          <td class="text-right tx-amount-text tabular-nums ${amountClass}">
            ${sign}${formatCurrency(tx.amount)}
          </td>
          <td class="text-right">
            <div class="row-actions">
              <button
                type="button"
                class="icon-btn icon-btn-sm js-edit-tx"
                data-id="${escapeHtml(tx.id)}"
                aria-label="Edit ${escapeHtml(tx.title)}"
                title="Edit transaction"
              >
                <i data-lucide="pencil"></i>
              </button>
              <button
                type="button"
                class="icon-btn icon-btn-sm icon-btn-danger js-delete-tx"
                data-id="${escapeHtml(tx.id)}"
                aria-label="Delete ${escapeHtml(tx.title)}"
                title="Delete transaction"
              >
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  tbody.querySelectorAll('.js-edit-tx').forEach((btn) => {
    btn.addEventListener('click', () => onEdit(btn.dataset.id));
  });

  tbody.querySelectorAll('.js-delete-tx').forEach((btn) => {
    btn.addEventListener('click', () => onDelete(btn.dataset.id));
  });
}
