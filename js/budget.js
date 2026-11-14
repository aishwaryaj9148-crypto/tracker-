/**
 * budget.js — Monthly Budget Calculation & Management View
 * ---------------------------------------------------------------------------
 * Computes remaining budget, utilization percentage, 80% warning state,
 * and >100% exceeded alert state independently of storage.
 */

import {
  calculateTotals,
  escapeHtml,
  filterByMonth,
  formatCurrency,
  formatMonthLabel,
  getCurrentMonthKey,
  getExpenseCategoryTotals,
} from './transactions.js';

/**
 * Pure calculation: evaluates monthly expenses against monthly budget limit.
 */
export function calculateBudgetStatus(monthlyExpenses, monthlyLimit) {
  const spent = Number(monthlyExpenses) || 0;
  const limit = Number(monthlyLimit) || 0;
  const remaining = Number((limit - spent).toFixed(2));
  const rawUtilization = limit > 0 ? (spent / limit) * 100 : 0;
  const utilization = Number(rawUtilization.toFixed(1));

  let state = 'nominal';
  if (limit > 0 && spent > limit) {
    state = 'exceeded';
  } else if (limit > 0 && rawUtilization >= 80) {
    state = 'warning';
  }

  return {
    spent: Number(spent.toFixed(2)),
    limit: Number(limit.toFixed(2)),
    remaining,
    utilization,
    state,
  };
}

/**
 * Validates the monthly budget input value.
 */
export function validateBudgetLimit(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return { valid: false, error: 'Please enter a monthly budget greater than zero.' };
  }
  if (num > 100000000) {
    return { valid: false, error: 'Budget limit exceeds maximum supported amount.' };
  }
  return { valid: true, error: '' };
}

/**
 * Renders the Budget Management view.
 */
export function renderBudgetView({ transactions, budget, selectedMonth }) {
  const effectiveMonth = selectedMonth === 'all' ? getCurrentMonthKey() : selectedMonth;
  const monthTransactions = filterByMonth(transactions, effectiveMonth);
  const monthTotals = calculateTotals(monthTransactions);
  const status = calculateBudgetStatus(monthTotals.totalExpenses, budget.monthlyLimit);

  // Sync budget form input when not actively focused
  const inputEl = document.getElementById('budget-limit-input');
  if (document.activeElement !== inputEl) {
    inputEl.value = budget.monthlyLimit.toFixed(2);
  }

  document.getElementById('budget-active-month-label').textContent =
    formatMonthLabel(effectiveMonth);

  document.getElementById('budget-limit-display').textContent = formatCurrency(status.limit);
  document.getElementById('budget-spent-display').textContent = formatCurrency(status.spent);

  const remainingEl = document.getElementById('budget-remaining-display');
  remainingEl.textContent =
    status.remaining >= 0
      ? formatCurrency(status.remaining)
      : `-${formatCurrency(Math.abs(status.remaining))}`;
  remainingEl.classList.toggle('text-expense', status.remaining < 0);
  remainingEl.classList.toggle('text-income', status.remaining >= 0);

  document.getElementById('budget-percent-display').textContent = `${status.utilization.toFixed(
    1
  )}%`;

  const mainBar = document.getElementById('budget-main-bar');
  mainBar.style.width = `${Math.min(status.utilization, 100).toFixed(1)}%`;
  mainBar.classList.remove('is-warning', 'is-exceeded');

  const statusTextEl = document.getElementById('budget-status-text');
  statusTextEl.classList.remove('is-warning', 'is-exceeded');

  const alertBanner = document.getElementById('budget-alert-banner');

  if (status.state === 'exceeded') {
    mainBar.classList.add('is-exceeded');
    statusTextEl.classList.add('is-exceeded');
    statusTextEl.textContent = 'Budget Exceeded';

    alertBanner.className = 'alert-banner is-exceeded';
    alertBanner.innerHTML = `
      <div class="alert-banner-content">
        <i data-lucide="alert-octagon" aria-hidden="true"></i>
        <span><strong>Budget Exceeded Alert:</strong> Your ${escapeHtml(
          formatMonthLabel(effectiveMonth)
        )} expenses (${formatCurrency(status.spent)}) exceeded your ${formatCurrency(
      status.limit
    )} budget by ${formatCurrency(Math.abs(status.remaining))}.</span>
      </div>
    `;
  } else if (status.state === 'warning') {
    mainBar.classList.add('is-warning');
    statusTextEl.classList.add('is-warning');
    statusTextEl.textContent = 'Warning (80%+ Used)';

    alertBanner.className = 'alert-banner is-warning';
    alertBanner.innerHTML = `
      <div class="alert-banner-content">
        <i data-lucide="alert-triangle" aria-hidden="true"></i>
        <span><strong>80% Budget Warning:</strong> You have spent ${status.utilization.toFixed(
          1
        )}% of your ${escapeHtml(formatMonthLabel(effectiveMonth))} budget. ${formatCurrency(
      status.remaining
    )} remains.</span>
      </div>
    `;
  } else {
    statusTextEl.textContent = 'On Track';
    alertBanner.className = 'alert-banner hidden';
    alertBanner.innerHTML = '';
  }

  // Monthly Category Contributions toward Budget
  const breakdown = getExpenseCategoryTotals(monthTransactions);
  const tbody = document.getElementById('budget-category-body');
  const emptyEl = document.getElementById('budget-category-empty');
  const tableEl = tbody.closest('table');

  if (breakdown.length === 0) {
    tableEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    tbody.innerHTML = '';
    return;
  }

  tableEl.classList.remove('hidden');
  emptyEl.classList.add('hidden');

  tbody.innerHTML = breakdown
    .map((item) => {
      const shareOfBudget =
        status.limit > 0 ? Number(((item.amount / status.limit) * 100).toFixed(1)) : 0;
      const barWidth = Math.min(shareOfBudget, 100);

      return `
        <tr>
          <td>
            <span class="legend-left">
              <span class="legend-swatch" style="background-color: ${escapeHtml(
                item.color
              )}"></span>
              <strong>${escapeHtml(item.category)}</strong>
            </span>
          </td>
          <td>
            <div class="share-bar-cell">
              <div class="share-bar-track">
                <div class="share-bar-fill" style="width: ${barWidth}%; background-color: ${escapeHtml(
        item.color
      )}"></div>
              </div>
              <span class="share-pct tabular-nums">${shareOfBudget}%</span>
            </div>
          </td>
          <td class="text-right tx-amount-text tabular-nums">${formatCurrency(item.amount)}</td>
        </tr>
      `;
    })
    .join('');
}
