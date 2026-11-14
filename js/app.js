/**
 * app.js — Main Application Controller & State Orchestrator
 * ---------------------------------------------------------------------------
 * Wires navigation, modals, filters, forms, and coordinates re-renders
 * across Dashboard, Transactions, Analytics, and Budget modules.
 */

import {
  addSavingsGoal,
  addTransaction,
  deleteSavingsGoal,
  deleteTransaction,
  getBudget,
  getSavingsGoals,
  getTransactions,
  initializeStorage,
  loadBudgetForMonth,
  resetToSampleData,
  saveBudget,
  updateSavingsGoal,
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
import { renderSavingsView, validateSavingsGoalInput } from './savings.js';

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  transactions: 'Transactions',
  analytics: 'Analytics',
  budget: 'Budget Management',
  savings: 'Savings Goals',
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
  pendingDeleteType: 'transaction',
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

function showLoadingState() {
  document.getElementById('app-loading-state')?.classList.remove('hidden');
}

function hideLoadingState() {
  document.getElementById('app-loading-state')?.classList.add('hidden');
}

function showBackendError(message) {
  const banner = document.getElementById('backend-status-banner');
  const msgEl = document.getElementById('backend-status-message');
  if (banner && msgEl) {
    msgEl.textContent = message;
    banner.classList.remove('hidden');
  }
  showToast(message, true);
  refreshIcons();
}

function hideBackendError() {
  const banner = document.getElementById('backend-status-banner');
  if (banner) {
    banner.classList.add('hidden');
  }
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
  const budget = getBudget(state.selectedMonth);

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
  } else if (state.activeView === 'savings') {
    renderSavingsView({
      goals: getSavingsGoals(),
      onAddMoney: openAddMoneyModal,
      onEdit: openEditSavingsModal,
      onDelete: openDeleteSavingsModal,
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

async function handleTransactionSubmit(event) {
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

  try {
    if (id) {
      await updateTransaction(id, payload);
      showToast('Transaction updated.');
    } else {
      await addTransaction(payload);
      showToast(`${payload.type === 'income' ? 'Income' : 'Expense'} added.`);
    }

    // If the new transaction is in a different month and user isn't viewing All Time, switch to its month so they see it immediately
    const txMonth = payload.date.slice(0, 7);
    if (state.selectedMonth !== 'all' && txMonth !== state.selectedMonth) {
      state.selectedMonth = txMonth;
      await loadBudgetForMonth(state.selectedMonth);
    }

    closeTransactionModal();
    renderApp();
  } catch (err) {
    showToast(err.message || 'Failed to save transaction', true);
  }
}

function openDeleteModal(id) {
  const tx = getTransactions().find((item) => item.id === id);
  if (!tx) return;

  state.pendingDeleteId = id;
  state.pendingDeleteType = 'transaction';
  document.getElementById('delete-modal-title').textContent = 'Delete Transaction';
  document.getElementById('delete-modal-message').textContent = `Delete "${tx.title}"? This action cannot be undone.`;
  document.getElementById('delete-modal').classList.remove('hidden');
}

function openDeleteSavingsModal(id) {
  const goal = getSavingsGoals().find((g) => g.id === id);
  if (!goal) return;

  state.pendingDeleteId = id;
  state.pendingDeleteType = 'savings';
  document.getElementById('delete-modal-title').textContent = 'Delete Savings Goal';
  document.getElementById('delete-modal-message').textContent = `Delete savings goal "${goal.goal_name}"? This action cannot be undone.`;
  document.getElementById('delete-modal').classList.remove('hidden');
}

function closeDeleteModal() {
  state.pendingDeleteId = null;
  state.pendingDeleteType = 'transaction';
  document.getElementById('delete-modal').classList.add('hidden');
}

async function handleConfirmDelete() {
  if (!state.pendingDeleteId) return;
  try {
    if (state.pendingDeleteType === 'savings') {
      await deleteSavingsGoal(state.pendingDeleteId);
      showToast('Savings goal deleted.');
    } else {
      await deleteTransaction(state.pendingDeleteId);
      showToast('Transaction deleted.');
    }
    closeDeleteModal();
    renderApp();
  } catch (err) {
    showToast(err.message || 'Failed to delete record', true);
  }
}

function clearSavingsFormErrors() {
  ['name', 'target', 'current', 'date'].forEach((field) => {
    const input = document.getElementById(`savings-${field}-input`);
    const err = document.getElementById(`savings-${field}-error`);
    if (input) input.classList.remove('is-invalid');
    if (err) err.textContent = '';
  });
}

function openAddSavingsModal() {
  clearSavingsFormErrors();
  document.getElementById('savings-modal-title').textContent = 'New Savings Goal';
  document.getElementById('save-savings-btn').textContent = 'Save Goal';
  document.getElementById('savings-id-input').value = '';

  const form = document.getElementById('savings-form');
  form.reset();

  document.getElementById('savings-modal').classList.remove('hidden');
  document.getElementById('savings-name-input').focus();
}

function openEditSavingsModal(id) {
  const goal = getSavingsGoals().find((g) => g.id === id);
  if (!goal) {
    showToast('Savings goal could not be found.', true);
    return;
  }

  clearSavingsFormErrors();
  document.getElementById('savings-modal-title').textContent = 'Edit Savings Goal';
  document.getElementById('save-savings-btn').textContent = 'Update Goal';
  document.getElementById('savings-id-input').value = goal.id;

  document.getElementById('savings-name-input').value = goal.goal_name;
  document.getElementById('savings-target-input').value = goal.target_amount.toFixed(2);
  document.getElementById('savings-current-input').value = goal.current_amount.toFixed(2);
  document.getElementById('savings-date-input').value = goal.target_date || '';
  document.getElementById('savings-desc-input').value = goal.description || '';

  document.getElementById('savings-modal').classList.remove('hidden');
  document.getElementById('savings-name-input').focus();
}

function closeSavingsModal() {
  document.getElementById('savings-modal').classList.add('hidden');
}

async function handleSavingsSubmit(event) {
  event.preventDefault();
  clearSavingsFormErrors();

  const id = document.getElementById('savings-id-input').value.trim();
  const payload = {
    goal_name: document.getElementById('savings-name-input').value.trim(),
    target_amount: document.getElementById('savings-target-input').value,
    current_amount: document.getElementById('savings-current-input').value,
    target_date: document.getElementById('savings-date-input').value,
    description: document.getElementById('savings-desc-input').value.trim(),
  };

  const validation = validateSavingsGoalInput(payload);
  if (!validation.valid) {
    const fieldMap = {
      goal_name: 'name',
      target_amount: 'target',
      current_amount: 'current',
      target_date: 'date',
    };
    Object.entries(validation.errors).forEach(([field, msg]) => {
      const idKey = fieldMap[field] || field;
      const inputEl = document.getElementById(`savings-${idKey}-input`);
      const errorEl = document.getElementById(`savings-${idKey}-error`);
      if (inputEl) inputEl.classList.add('is-invalid');
      if (errorEl) errorEl.textContent = msg;
    });
    const firstInvalidKey = fieldMap[Object.keys(validation.errors)[0]];
    document.getElementById(`savings-${firstInvalidKey}-input`)?.focus();
    return;
  }

  try {
    if (id) {
      await updateSavingsGoal(id, payload);
      showToast('Savings goal updated.');
    } else {
      await addSavingsGoal(payload);
      showToast('New savings goal created.');
    }
    closeSavingsModal();
    renderApp();
  } catch (err) {
    showToast(err.message || 'Failed to save savings goal', true);
  }
}

function openAddMoneyModal(id) {
  const goal = getSavingsGoals().find((g) => g.id === id);
  if (!goal) return;

  document.getElementById('add-money-id-input').value = goal.id;
  document.getElementById('add-money-goal-name').textContent =
    `Deposit funds toward "${goal.goal_name}" (Target: ${formatCurrency(goal.target_amount)}, Saved so far: ${formatCurrency(goal.current_amount)})`;
  const inputEl = document.getElementById('deposit-amount-input');
  const errEl = document.getElementById('deposit-amount-error');
  inputEl.value = '';
  inputEl.classList.remove('is-invalid');
  errEl.textContent = '';

  document.getElementById('add-money-modal').classList.remove('hidden');
  inputEl.focus();
}

function closeAddMoneyModal() {
  document.getElementById('add-money-modal').classList.add('hidden');
}

async function handleAddMoneySubmit(event) {
  event.preventDefault();
  const id = document.getElementById('add-money-id-input').value.trim();
  const inputEl = document.getElementById('deposit-amount-input');
  const errEl = document.getElementById('deposit-amount-error');
  inputEl.classList.remove('is-invalid');
  errEl.textContent = '';

  const addVal = Number(inputEl.value);
  if (!Number.isFinite(addVal) || addVal <= 0) {
    inputEl.classList.add('is-invalid');
    errEl.textContent = 'Please enter an amount greater than zero.';
    inputEl.focus();
    return;
  }

  const goal = getSavingsGoals().find((g) => g.id === id);
  if (!goal) return;

  try {
    const newCurrent = Number((goal.current_amount + addVal).toFixed(2));
    await updateSavingsGoal(id, { current_amount: newCurrent });
    showToast(`Added ${formatCurrency(addVal)} to "${goal.goal_name}".`);
    closeAddMoneyModal();
    renderApp();
  } catch (err) {
    showToast(err.message || 'Failed to add funds', true);
  }
}

async function handleBudgetSubmit(event) {
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

  try {
    const effectiveMonth = state.selectedMonth === 'all' ? getCurrentMonthKey() : state.selectedMonth;
    const [year, month] = effectiveMonth.split('-').map(Number);
    await saveBudget(Number(inputEl.value), year, month);
    showToast('Monthly budget updated.');
    renderApp();
  } catch (err) {
    showToast(err.message || 'Failed to save budget', true);
  }
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
  document.getElementById('global-month-select').addEventListener('change', async (e) => {
    state.selectedMonth = e.target.value;
    if (state.selectedMonth !== 'all') {
      try {
        await loadBudgetForMonth(state.selectedMonth);
      } catch (err) {
        console.warn('Could not load budget for month:', err);
      }
    }
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

  // Savings Goal Triggers & Controls
  document.getElementById('open-add-goal-btn')?.addEventListener('click', openAddSavingsModal);
  document.getElementById('empty-add-goal-btn')?.addEventListener('click', openAddSavingsModal);
  document.getElementById('close-savings-modal-btn')?.addEventListener('click', closeSavingsModal);
  document.getElementById('cancel-savings-modal-btn')?.addEventListener('click', closeSavingsModal);
  document.getElementById('savings-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'savings-modal') closeSavingsModal();
  });
  document.getElementById('savings-form')?.addEventListener('submit', handleSavingsSubmit);

  // Add Money Modal Controls
  document.getElementById('close-add-money-modal-btn')?.addEventListener('click', closeAddMoneyModal);
  document.getElementById('cancel-add-money-btn')?.addEventListener('click', closeAddMoneyModal);
  document.getElementById('add-money-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'add-money-modal') closeAddMoneyModal();
  });
  document.getElementById('add-money-form')?.addEventListener('submit', handleAddMoneySubmit);

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

  document.getElementById('reset-sample-btn').addEventListener('click', async () => {
    try {
      showLoadingState();
      await resetToSampleData();
      state.selectedMonth = getCurrentMonthKey();
      showToast('Sample dataset restored in database.');
      renderApp();
    } catch (err) {
      showToast(err.message || 'Failed to reset sample data', true);
    } finally {
      hideLoadingState();
    }
  });

  // Global Escape key closes modals / mobile drawer
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeTransactionModal();
      closeSavingsModal();
      closeAddMoneyModal();
      closeDeleteModal();
      closeMobileSidebar();
    }
  });
}

async function bootstrap() {
  bindEvents();
  showLoadingState();
  try {
    const { importedCount } = await initializeStorage(state.selectedMonth);
    hideBackendError();
    if (importedCount > 0) {
      showToast(`Imported ${importedCount} records from LocalStorage into database.`);
    }
    renderApp();
  } catch (err) {
    console.error('Failed to initialize application from backend:', err);
    showBackendError('Unable to connect to the backend server. Please verify the backend is running at http://localhost:3000.');
  } finally {
    hideLoadingState();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
