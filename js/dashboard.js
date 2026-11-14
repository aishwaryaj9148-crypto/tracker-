/**
 * dashboard.js — Dashboard KPIs, Charts, Budget Snapshot & Recent Activity
 * ---------------------------------------------------------------------------
 * Consumes pure calculation helpers and renders Dashboard View.
 */

import {
  calculateTotals,
  escapeHtml,
  filterAndSortTransactions,
  filterByMonth,
  formatCurrency,
  formatDisplayDate,
  formatMonthLabel,
  getCurrentMonthKey,
  getExpenseCategoryTotals,
} from './transactions.js';
import { calculateBudgetStatus } from './budget.js';

let overviewChartInstance = null;
let categoryChartInstance = null;

/**
 * Pure calculation: builds daily spending series for a given YYYY-MM month,
 * or monthly spending series when monthKey === 'all'.
 */
export function buildSpendingOverviewSeries(transactions, monthKey) {
  const expenses = transactions.filter((tx) => tx.type === 'expense');

  if (!monthKey || monthKey === 'all') {
    const monthlyMap = new Map();
    for (const tx of expenses) {
      const mKey = tx.date.slice(0, 7);
      monthlyMap.set(mKey, (monthlyMap.get(mKey) || 0) + tx.amount);
    }
    const keys = Array.from(monthlyMap.keys()).sort((a, b) => a.localeCompare(b));
    return {
      labels: keys.map((k) => {
        const [y, m] = k.split('-').map(Number);
        return new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' }).format(
          new Date(y, m - 1, 1)
        );
      }),
      values: keys.map((k) => Number(monthlyMap.get(k).toFixed(2))),
    };
  }

  const monthExpenses = filterByMonth(expenses, monthKey);
  if (monthExpenses.length === 0) {
    return { labels: [], values: [] };
  }

  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyTotals = new Array(daysInMonth).fill(0);

  for (const tx of monthExpenses) {
    const day = Number(tx.date.slice(8, 10));
    if (day >= 1 && day <= daysInMonth) {
      dailyTotals[day - 1] += tx.amount;
    }
  }

  const labels = [];
  const values = [];
  for (let d = 1; d <= daysInMonth; d += 1) {
    labels.push(`${d}`);
    values.push(Number(dailyTotals[d - 1].toFixed(2)));
  }

  return { labels, values };
}

/**
 * Renders the Dashboard view dynamically from transaction and budget state.
 */
export function renderDashboardView({ transactions, budget, selectedMonth, onNavigate }) {
  const totalsAll = calculateTotals(transactions);
  const effectiveMonth = selectedMonth === 'all' ? getCurrentMonthKey() : selectedMonth;
  const monthTransactions = filterByMonth(transactions, effectiveMonth);
  const totalsMonth = calculateTotals(monthTransactions);

  // 1. Update Top KPI Cards (Dynamic calculations)
  const balanceEl = document.getElementById('kpi-total-balance');
  balanceEl.textContent = formatCurrency(totalsAll.totalBalance);
  balanceEl.classList.toggle('text-expense', totalsAll.totalBalance < 0);

  document.getElementById('kpi-balance-meta').textContent =
    totalsAll.totalBalance >= 0 ? 'Positive net balance' : 'Deficit across all records';

  document.getElementById('kpi-total-income').textContent = formatCurrency(totalsAll.totalIncome);
  document.getElementById('kpi-income-meta').textContent = `${totalsAll.incomeCount} ${
    totalsAll.incomeCount === 1 ? 'income entry' : 'income entries'
  }`;

  document.getElementById('kpi-total-expenses').textContent = formatCurrency(
    totalsAll.totalExpenses
  );
  document.getElementById('kpi-expense-meta').textContent = `${totalsAll.expenseCount} ${
    totalsAll.expenseCount === 1 ? 'expense entry' : 'expense entries'
  }`;

  document.getElementById('kpi-monthly-spending').textContent = formatCurrency(
    totalsMonth.totalExpenses
  );
  document.getElementById('kpi-monthly-meta').textContent = formatMonthLabel(effectiveMonth);

  // Update sidebar net balance summary
  const sidebarBalanceEl = document.getElementById('sidebar-net-balance');
  if (sidebarBalanceEl) {
    sidebarBalanceEl.textContent = formatCurrency(totalsAll.totalBalance);
  }

  // 2. Budget Snapshot & Alert Banner
  const budgetStatus = calculateBudgetStatus(totalsMonth.totalExpenses, budget.monthlyLimit);
  renderDashboardBudgetSnapshot(budgetStatus, effectiveMonth, onNavigate);

  // 3. Monthly Spending Overview Chart
  renderOverviewChart(transactions, selectedMonth);

  // 4. Expense Category Breakdown Chart + Legend
  const breakdownScope = selectedMonth === 'all' ? transactions : monthTransactions;
  renderCategoryBreakdown(breakdownScope, selectedMonth);

  // 5. Recent Transactions Table (Latest 6 across selected scope)
  const recentSource = selectedMonth === 'all' ? transactions : monthTransactions;
  const recentList = filterAndSortTransactions(recentSource, { sortBy: 'date-desc' }).slice(0, 6);
  renderRecentTransactionsTable(recentList);
}

function renderDashboardBudgetSnapshot(status, monthKey, onNavigate) {
  const alertEl = document.getElementById('dashboard-budget-alert');
  document.getElementById('dash-budget-period').textContent = `${formatMonthLabel(
    monthKey
  )} spending target`;
  document.getElementById('dash-budget-spent').textContent = formatCurrency(status.spent);
  document.getElementById('dash-budget-limit').textContent = formatCurrency(status.limit);

  const barEl = document.getElementById('dash-budget-bar');
  const clampedWidth = Math.min(status.utilization, 100);
  barEl.style.width = `${clampedWidth.toFixed(1)}%`;
  barEl.classList.remove('is-warning', 'is-exceeded');

  const remainingEl = document.getElementById('dash-budget-remaining');
  const percentEl = document.getElementById('dash-budget-percent');
  percentEl.textContent = `${status.utilization.toFixed(1)}% used`;

  if (status.state === 'exceeded') {
    barEl.classList.add('is-exceeded');
    remainingEl.textContent = `${formatCurrency(Math.abs(status.remaining))} over budget`;
    remainingEl.className = 'tabular-nums text-expense';

    alertEl.className = 'alert-banner is-exceeded';
    alertEl.innerHTML = `
      <div class="alert-banner-content">
        <i data-lucide="alert-octagon" aria-hidden="true"></i>
        <span><strong>Monthly Budget Exceeded:</strong> Spending for ${escapeHtml(
          formatMonthLabel(monthKey)
        )} is ${formatCurrency(Math.abs(status.remaining))} above your ${formatCurrency(
      status.limit
    )} limit (${status.utilization.toFixed(1)}%).</span>
      </div>
      <button type="button" class="btn btn-secondary btn-sm js-open-budget">Review Budget</button>
    `;
    alertEl.querySelector('.js-open-budget')?.addEventListener('click', () => onNavigate('budget'));
  } else if (status.state === 'warning') {
    barEl.classList.add('is-warning');
    remainingEl.textContent = `${formatCurrency(status.remaining)} remaining`;
    remainingEl.className = 'tabular-nums text-warning';

    alertEl.className = 'alert-banner is-warning';
    alertEl.innerHTML = `
      <div class="alert-banner-content">
        <i data-lucide="alert-triangle" aria-hidden="true"></i>
        <span><strong>Approaching Monthly Limit:</strong> You have used ${status.utilization.toFixed(
          1
        )}% of your ${formatCurrency(status.limit)} budget for ${escapeHtml(
      formatMonthLabel(monthKey)
    )}.</span>
      </div>
      <button type="button" class="btn btn-secondary btn-sm js-open-budget">Adjust Budget</button>
    `;
    alertEl.querySelector('.js-open-budget')?.addEventListener('click', () => onNavigate('budget'));
  } else {
    remainingEl.textContent = `${formatCurrency(status.remaining)} remaining`;
    remainingEl.className = 'tabular-nums';
    alertEl.className = 'alert-banner hidden';
    alertEl.innerHTML = '';
  }
}

function renderOverviewChart(transactions, selectedMonth) {
  const canvas = document.getElementById('dashboard-overview-chart');
  const emptyEl = document.getElementById('dashboard-overview-empty');
  const subtitleEl = document.getElementById('overview-chart-subtitle');
  const totalEl = document.getElementById('overview-chart-total');

  const scopeTransactions =
    selectedMonth === 'all' ? transactions : filterByMonth(transactions, selectedMonth);
  const scopeTotals = calculateTotals(scopeTransactions);
  totalEl.textContent = formatCurrency(scopeTotals.totalExpenses);
  subtitleEl.textContent =
    selectedMonth === 'all'
      ? 'Monthly spending across all recorded months'
      : `Daily spending in ${formatMonthLabel(selectedMonth)}`;

  const { labels, values } = buildSpendingOverviewSeries(transactions, selectedMonth);
  const hasSpending = values.some((v) => v > 0);

  if (overviewChartInstance) {
    overviewChartInstance.destroy();
    overviewChartInstance = null;
  }

  if (!hasSpending || typeof window.Chart === 'undefined') {
    canvas.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    return;
  }

  canvas.classList.remove('hidden');
  emptyEl.classList.add('hidden');

  const ctx = canvas.getContext('2d');
  overviewChartInstance = new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Spending ($)',
          data: values,
          backgroundColor: '#1d4ed8',
          borderRadius: 4,
          maxBarThickness: 26,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctxItem) => ` ${formatCurrency(ctxItem.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#64748b',
            font: { size: 11, family: 'JetBrains Mono, monospace' },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 12,
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: '#f1f5f9' },
          border: { display: false },
          ticks: {
            color: '#64748b',
            font: { size: 11, family: 'JetBrains Mono, monospace' },
            callback: (val) => `$${val}`,
          },
        },
      },
    },
  });
}

function renderCategoryBreakdown(scopeTransactions, selectedMonth) {
  const canvas = document.getElementById('dashboard-category-chart');
  const emptyEl = document.getElementById('dashboard-category-empty');
  const legendEl = document.getElementById('dashboard-category-legend');
  const subtitleEl = document.getElementById('category-chart-subtitle');

  subtitleEl.textContent =
    selectedMonth === 'all' ? 'All-time expense share' : formatMonthLabel(selectedMonth);

  const breakdown = getExpenseCategoryTotals(scopeTransactions);

  if (categoryChartInstance) {
    categoryChartInstance.destroy();
    categoryChartInstance = null;
  }

  if (breakdown.length === 0 || typeof window.Chart === 'undefined') {
    canvas.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    legendEl.innerHTML = '';
    return;
  }

  canvas.classList.remove('hidden');
  emptyEl.classList.add('hidden');

  const topCategories = breakdown.slice(0, 5);
  legendEl.innerHTML = topCategories
    .map(
      (item) => `
      <li class="legend-item">
        <span class="legend-left">
          <span class="legend-swatch" style="background-color: ${escapeHtml(item.color)}"></span>
          <span class="legend-name">${escapeHtml(item.category)}</span>
        </span>
        <span class="legend-right tabular-nums">${formatCurrency(item.amount)} (${item.percentage}%)</span>
      </li>
    `
    )
    .join('');

  const ctx = canvas.getContext('2d');
  categoryChartInstance = new window.Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: breakdown.map((b) => b.category),
      datasets: [
        {
          data: breakdown.map((b) => b.amount),
          backgroundColor: breakdown.map((b) => b.color),
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctxItem) => ` ${ctxItem.label}: ${formatCurrency(ctxItem.parsed)}`,
          },
        },
      },
    },
  });
}

function renderRecentTransactionsTable(list) {
  const tableEl = document.getElementById('recent-transactions-table');
  const tbody = document.getElementById('recent-transactions-body');
  const emptyEl = document.getElementById('recent-transactions-empty');

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

      return `
        <tr>
          <td>
            <div class="tx-title-cell">
              <span class="tx-title-text">${escapeHtml(tx.title)}</span>
              ${
                tx.description
                  ? `<span class="tx-desc-text">${escapeHtml(tx.description)}</span>`
                  : ''
              }
            </div>
          </td>
          <td class="tx-category-text">${escapeHtml(tx.category)}</td>
          <td class="tx-date-text tabular-nums">${escapeHtml(formatDisplayDate(tx.date))}</td>
          <td class="text-right tx-amount-text tabular-nums ${amountClass}">
            ${sign}${formatCurrency(tx.amount)}
          </td>
        </tr>
      `;
    })
    .join('');
}
