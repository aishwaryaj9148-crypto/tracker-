/**
 * app.js — Main Application Controller & State Orchestrator
 * ---------------------------------------------------------------------------
 * Wires navigation, modals, filters, forms, and coordinates re-renders
 * across Dashboard, Transactions, Analytics, and Budget modules.
 */

import {
  addTransaction,
  deleteTransaction,
  getBudget,
  getTransactions,
  initializeStorage,
  resetToSampleData,
  saveBudget,
  updateTransaction,
} from './storage.js';
import {
  CATEGORIES,
  calculateTotals,
  escapeHtml,
  exportTransactionsToCsv,
  formatCurrency,
  formatMonthLabel,
  getAvailableMonths,
  getCurrentMonthKey,
  getTodayDateString,
  renderTransactionsView,
  validateTransactionInput,
} from './transactions.js';
import { renderDashboardView } from './dashboard.js';
import { renderAnalyticsView } from './analytics.js';
import { renderBudgetView, validateBudgetLimit } from './budget.js';

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  transactions: 'Transactions',
  analytics: 'Analytics',
  budget: 'Budget Management',
};

const state = {
  activeView: 'dashboard',
  selectedMonth: getCurrentMonthKey(),
  analyticsScope: 'month',
  filters: {
    search: '',
    type: 'all',
    category: 'all',
    sortBy: 'date-desc',
  },
  pendingDeleteId: null,
};

function refreshIcons() {
  if (typeof window.lucide !== 'undefined' && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function showToast(message, isError = false) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast${isError ? ' is-error' : ''}`;
  toast.textContent = message;
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 3200);
}

/**
 * Populates the topbar month selector from all available transaction months.
 */
function syncMonthSelector(transactions) {
  const selectEl = document.getElementById('global-month-select');
  const months = getAvailableMonths(transactions);

  if (state.selectedMonth !== 'all' && !months.includes(state.selectedMonth)) {
    state.selectedMonth = getCurrentMonthKey();
  }

  const optionsHtml = [
    ...months.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(formatMonthLabel(m))}</option>`),
    `<option value="all">All Time</option>`,
  ].join('');

  selectEl.innerHTML = optionsHtml;
  selectEl.value = state.selectedMonth;
}

/**
 * Re-renders the active workspace view from current persisted state.
 */
function renderApp() {
  const transactions = getTransactions();
  const budget = getBudget();

  syncMonthSelector(transactions);

  const sidebarBalanceEl = document.getElementById('sidebar-net-balance');
  if (sidebarBalanceEl) {
    sidebarBalanceEl.textContent = formatCurrency(calculateTotals(transactions).totalBalance);
  }

  if (state.activeView === 'dashboard') {
    renderDashboardView({
      transactions,
      budget,
      selectedMonth: state.selectedMonth,
      onNavigate: navigateTo,
    });
  } else if (state.activeView === 'transactions') {
    renderTransactionsView({
      transactions,
      filters: state.filters,
      selectedMonth: state.selectedMonth,
      onEdit: openEditTransactionModal,
      onDelete: openDeleteModal,
    });
  } else if (state.activeView === 'analytics') {
    renderAnalyticsView({
      transactions,
      selectedMonth: state.selectedMonth,
      analyticsScope: state.analyticsScope,
    });
  } else if (state.activeView === 'budget') {
    renderBudgetView({
      transactions,
      budget,
      selectedMonth: state.selectedMonth,
    });
  }

  refreshIcons();
}

/**
 * Switches between primary workspace views.
 */
function navigateTo(viewKey) {
  if (!VIEW_TITLES[viewKey]) return;
  state.activeView = viewKey;

  document.querySelectorAll('.nav-item').forEach((btn) => {
    const isActive = btn.dataset.view === viewKey;
    btn.classList.toggle('is-active', isActive);
    if (isActive) {
      btn.setAttribute('aria-current', 'page');
    } else {
      btn.removeAttribute('aria-current');
    }
  });

  document.querySelectorAll('.view-section').forEach((section) => {
    section.classList.toggle('is-active', section.id === `view-${viewKey}`);
  });

  document.getElementById('page-title').textContent = VIEW_TITLES[viewKey];
  closeMobileSidebar();

  renderApp();
}

function openMobileSidebar() {
  document.getElementById('app-sidebar').classList.add('is-open');
  document.getElementById('sidebar-backdrop').classList.add('is-open');
}

function closeMobileSidebar() {
  document.getElementById('app-sidebar').classList.remove('is-open');
  document.getElementById('sidebar-backdrop').classList.remove('is-open');
}

/**
 * Populates the Transaction Modal category dropdown based on income vs expense.
 */
function populateCategorySelect(type, selectedCategory = '') {
  const select = document.getElementById('tx-category-input');
  const baseList = CATEGORIES[type] || CATEGORIES.expense;
  const list =
    selectedCategory && !baseList.includes(selectedCategory)
      ? [...baseList, selectedCategory]
      : baseList;
  select.innerHTML = list
    .map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`)
    .join('');

  if (selectedCategory && list.includes(selectedCategory)) {
    select.value = selectedCategory;
  } else {
    select.selectedIndex = 0;
  }
}

function clearTransactionFormErrors() {
  ['title', 'amount', 'category', 'date', 'description'].forEach((field) => {
    const input = document.getElementById(`tx-${field}-input`);
    const err = document.getElementById(`tx-${field}-error`);
    if (input) input.classList.remove('is-invalid');
    if (err) err.textContent = '';
  });
}

function openAddTransactionModal() {
  clearTransactionFormErrors();
  document.getElementById('tx-modal-title').textContent = 'Add Transaction';
  document.getElementById('save-tx-btn').textContent = 'Save Transaction';
  document.getElementById('tx-id-input').value = '';

  const form = document.getElementById('tx-form');
  form.reset();

  const expenseRadio = form.querySelector('input[name="type"][value="expense"]');
  if (expenseRadio) expenseRadio.checked = true;
  populateCategorySelect('expense');

  document.getElementById('tx-date-input').value = getTodayDateString();
  document.getElementById('tx-modal').classList.remove('hidden');
  document.getElementById('tx-title-input').focus();
}

function openEditTransactionModal(id) {
  const tx = getTransactions().find((item) => item.id === id);
  if (!tx) {
    showToast('Transaction could not be found.', true);
    return;
  }

  clearTransactionFormErrors();
  document.getElementById('tx-modal-title').textContent = 'Edit Transaction';
  document.getElementById('save-tx-btn').textContent = 'Update Transaction';
  document.getElementById('tx-id-input').value = tx.id;

  const form = document.getElementById('tx-form');
  const typeRadio = form.querySelector(`input[name="type"][value="${tx.type}"]`);
  if (typeRadio) typeRadio.checked = true;

  populateCategorySelect(tx.type, tx.category);
  document.getElementById('tx-title-input').value = tx.title;
  document.getElementById('tx-amount-input').value = tx.amount.toFixed(2);
  document.getElementById('tx-date-input').value = tx.date;
  document.getElementById('tx-description-input').value = tx.description || '';

  document.getElementById('tx-modal').classList.remove('hidden');
  document.getElementById('tx-title-input').focus();
}

function closeTransactionModal() {
  document.getElementById('tx-modal').classList.add('hidden');
}

function handleTransactionSubmit(event) {
  event.preventDefault();
  clearTransactionFormErrors();

  const form = event.currentTarget;
  const id = document.getElementById('tx-id-input').value.trim();
  const typeInput = form.querySelector('input[name="type"]:checked');

  const payload = {
    title: document.getElementById('tx-title-input').value.trim(),
    amount: document.getElementById('tx-amount-input').value,
    category: document.getElementById('tx-category-input').value,
    type: typeInput ? typeInput.value : 'expense',
    date: document.getElementById('tx-date-input').value,
    description: document.getElementById('tx-description-input').value.trim(),
  };

  const validation = validateTransactionInput(payload);
  if (!validation.valid) {
    Object.entries(validation.errors).forEach(([field, msg]) => {
      const inputEl = document.getElementById(`tx-${field}-input`);
      const errorEl = document.getElementById(`tx-${field}-error`);
      if (inputEl) inputEl.classList.add('is-invalid');
      if (errorEl) errorEl.textContent = msg;
    });
    const firstInvalidField = Object.keys(validation.errors)[0];
    document.getElementById(`tx-${firstInvalidField}-input`)?.focus();
    return;
  }

  if (id) {
    updateTransaction(id, payload);
    showToast('Transaction updated.');
  } else {
    addTransaction(payload);
    showToast(`${payload.type === 'income' ? 'Income' : 'Expense'} added.`);
  }

  // If the new transaction is in a different month and user isn't viewing All Time, switch to its month so they see it immediately
  const txMonth = payload.date.slice(0, 7);
  if (state.selectedMonth !== 'all' && txMonth !== state.selectedMonth) {
    state.selectedMonth = txMonth;
  }

  closeTransactionModal();
  renderApp();
}

function openDeleteModal(id) {
  const tx = getTransactions().find((item) => item.id === id);
  if (!tx) return;

  state.pendingDeleteId = id;
  document.getElementById('delete-modal-message').textContent = `Delete "${tx.title}"? This action cannot be undone.`;
  document.getElementById('delete-modal').classList.remove('hidden');
}

function closeDeleteModal() {
  state.pendingDeleteId = null;
  document.getElementById('delete-modal').classList.add('hidden');
}

function handleConfirmDelete() {
  if (!state.pendingDeleteId) return;
  const deleted = deleteTransaction(state.pendingDeleteId);
  closeDeleteModal();
  if (deleted) {
    showToast('Transaction deleted.');
    renderApp();
  }
}

function handleBudgetSubmit(event) {
  event.preventDefault();
  const inputEl = document.getElementById('budget-limit-input');
  const errorEl = document.getElementById('budget-limit-error');
  inputEl.classList.remove('is-invalid');
  errorEl.textContent = '';

  const check = validateBudgetLimit(inputEl.value);
  if (!check.valid) {
    inputEl.classList.add('is-invalid');
    errorEl.textContent = check.error;
    inputEl.focus();
    return;
  }

  saveBudget(Number(inputEl.value));
  showToast('Monthly budget updated.');
  renderApp();
}

function bindEvents() {
  // Sidebar navigation
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.view));
  });

  document.getElementById('brand-home-link').addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo('dashboard');
  });

  document.getElementById('open-sidebar-btn').addEventListener('click', openMobileSidebar);
  document.getElementById('close-sidebar-btn').addEventListener('click', closeMobileSidebar);
  document.getElementById('sidebar-backdrop').addEventListener('click', closeMobileSidebar);

  // Dashboard shortcuts
  document.getElementById('view-all-transactions-btn').addEventListener('click', () => {
    navigateTo('transactions');
  });
  document.getElementById('manage-budget-btn').addEventListener('click', () => {
    navigateTo('budget');
  });

  // Global Month Selector
  document.getElementById('global-month-select').addEventListener('change', (e) => {
    state.selectedMonth = e.target.value;
    renderApp();
  });

  // Add Transaction Triggers
  document.getElementById('open-add-tx-btn').addEventListener('click', openAddTransactionModal);
  document.querySelectorAll('.empty-add-trigger').forEach((btn) => {
    btn.addEventListener('click', openAddTransactionModal);
  });

  // Transaction Modal Controls
  document.getElementById('close-tx-modal-btn').addEventListener('click', closeTransactionModal);
  document.getElementById('cancel-tx-modal-btn').addEventListener('click', closeTransactionModal);
  document.getElementById('tx-modal').addEventListener('click', (e) => {
    if (e.target.id === 'tx-modal') closeTransactionModal();
  });
  document.getElementById('tx-form').addEventListener('submit', handleTransactionSubmit);

  document.querySelectorAll('#tx-form input[name="type"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      populateCategorySelect(e.target.value);
    });
  });

  // Delete Modal Controls
  document.getElementById('close-delete-modal-btn').addEventListener('click', closeDeleteModal);
  document.getElementById('cancel-delete-btn').addEventListener('click', closeDeleteModal);
  document.getElementById('delete-modal').addEventListener('click', (e) => {
    if (e.target.id === 'delete-modal') closeDeleteModal();
  });
  document.getElementById('confirm-delete-btn').addEventListener('click', handleConfirmDelete);

  // Transaction History Search & Filters
  document.getElementById('tx-search-input').addEventListener('input', (e) => {
    state.filters.search = e.target.value;
    renderApp();
  });

  document.querySelectorAll('[data-type-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filters.type = btn.dataset.typeFilter;
      document.querySelectorAll('[data-type-filter]').forEach((b) => {
        b.classList.toggle('is-active', b === btn);
      });
      renderApp();
    });
  });

  document.getElementById('tx-category-filter').addEventListener('change', (e) => {
    state.filters.category = e.target.value;
    renderApp();
  });

  document.getElementById('tx-sort-select').addEventListener('change', (e) => {
    state.filters.sortBy = e.target.value;
    renderApp();
  });

  document.getElementById('tx-clear-filters-btn').addEventListener('click', () => {
    state.filters = {
      search: '',
      type: 'all',
      category: 'all',
      sortBy: 'date-desc',
    };
    document.getElementById('tx-search-input').value = '';
    document.getElementById('tx-category-filter').value = 'all';
    document.getElementById('tx-sort-select').value = 'date-desc';
    document.querySelectorAll('[data-type-filter]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.typeFilter === 'all');
    });
    renderApp();
  });

  // Analytics Scope Toggle
  document.querySelectorAll('[data-analytics-scope]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.analyticsScope = btn.dataset.analyticsScope;
      document.querySelectorAll('[data-analytics-scope]').forEach((b) => {
        b.classList.toggle('is-active', b === btn);
      });
      renderApp();
    });
  });

  // Budget Form
  document.getElementById('budget-form').addEventListener('submit', handleBudgetSubmit);

  // Sidebar Utilities: CSV Export & Sample Data Reset
  document.getElementById('export-csv-btn').addEventListener('click', () => {
    const transactions = getTransactions();
    if (transactions.length === 0) {
      showToast('No transactions available to export.', true);
      return;
    }
    exportTransactionsToCsv(transactions);
    showToast('Transactions exported to CSV.');
  });

  document.getElementById('reset-sample-btn').addEventListener('click', () => {
    resetToSampleData();
    state.selectedMonth = getCurrentMonthKey();
    showToast('Sample dataset restored.');
    renderApp();
  });

  // Global Escape key closes modals / mobile drawer
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeTransactionModal();
      closeDeleteModal();
      closeMobileSidebar();
    }
  });
}

function bootstrap() {
  initializeStorage();
  bindEvents();
  renderApp();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
