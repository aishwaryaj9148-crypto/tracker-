/**
 * analytics.js — Expense Analytics & Financial Insights Module
 * ---------------------------------------------------------------------------
 * Computes category-wise expense breakdowns, monthly income vs expenses,
 * spending distribution, highest spending category, and total savings.
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

let incomeExpenseChartInstance = null;
let distributionChartInstance = null;

/**
 * Pure calculation: builds a 6-month Income vs Expenses comparison ending at anchorMonth.
 */
export function buildMonthlyCashflowSeries(transactions, anchorMonth) {
  const baseMonth = anchorMonth && anchorMonth !== 'all' ? anchorMonth : getCurrentMonthKey();
  const [year, month] = baseMonth.split('-').map(Number);

  const monthKeys = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const dt = new Date(year, month - 1 - offset, 1);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    monthKeys.push(`${y}-${m}`);
  }

  const labels = monthKeys.map((k) => {
    const [y, m] = k.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' }).format(
      new Date(y, m - 1, 1)
    );
  });

  const incomeSeries = monthKeys.map((k) => {
    const txs = filterByMonth(transactions, k);
    return calculateTotals(txs).totalIncome;
  });

  const expenseSeries = monthKeys.map((k) => {
    const txs = filterByMonth(transactions, k);
    return calculateTotals(txs).totalExpenses;
  });

  return { labels, incomeSeries, expenseSeries };
}

/**
 * Pure calculation: derives analytics summary metrics for a transaction subset.
 */
export function calculateAnalyticsMetrics(transactions) {
  const totals = calculateTotals(transactions);
  const categoryBreakdown = getExpenseCategoryTotals(transactions);
  const topCategory = categoryBreakdown.length > 0 ? categoryBreakdown[0] : null;

  const totalSavings = totals.totalBalance;
  const savingsRate =
    totals.totalIncome > 0 ? Number(((totalSavings / totals.totalIncome) * 100).toFixed(1)) : 0;

  const avgExpense =
    totals.expenseCount > 0 ? Number((totals.totalExpenses / totals.expenseCount).toFixed(2)) : 0;

  return {
    totals,
    totalSavings,
    savingsRate,
    topCategory,
    avgExpense,
    categoryBreakdown,
  };
}

/**
 * Renders the complete Expense Analytics view.
 */
export function renderAnalyticsView({ transactions, selectedMonth, analyticsScope }) {
  const effectiveScopeMonth =
    analyticsScope === 'all' || selectedMonth === 'all' ? 'all' : selectedMonth;
  const scopedTransactions = filterByMonth(transactions, effectiveScopeMonth);
  const metrics = calculateAnalyticsMetrics(scopedTransactions);

  // 1. Highlight KPIs
  const savingsEl = document.getElementById('analytics-total-savings');
  savingsEl.textContent = formatCurrency(metrics.totalSavings);
  savingsEl.classList.toggle('text-income', metrics.totalSavings >= 0);
  savingsEl.classList.toggle('text-expense', metrics.totalSavings < 0);

  document.getElementById('analytics-savings-rate').textContent =
    metrics.totals.totalIncome > 0
      ? `${metrics.savingsRate}% of ${formatCurrency(metrics.totals.totalIncome)} income saved`
      : 'No income recorded in scope';

  const topCatEl = document.getElementById('analytics-top-category');
  const topCatMetaEl = document.getElementById('analytics-top-category-meta');
  if (metrics.topCategory) {
    topCatEl.textContent = metrics.topCategory.category;
    topCatMetaEl.textContent = `${formatCurrency(metrics.topCategory.amount)} (${
      metrics.topCategory.percentage
    }% of expenses)`;
  } else {
    topCatEl.textContent = '—';
    topCatMetaEl.textContent = 'No expenses recorded';
  }

  document.getElementById('analytics-avg-expense').textContent = formatCurrency(metrics.avgExpense);
  document.getElementById(
    'analytics-expense-count'
  ).textContent = `${metrics.totals.expenseCount} expense ${
    metrics.totals.expenseCount === 1 ? 'transaction' : 'transactions'
  }`;

  document.getElementById('analytics-dist-subtitle').textContent =
    effectiveScopeMonth === 'all'
      ? 'All-time expense distribution'
      : `Distribution for ${formatMonthLabel(effectiveScopeMonth)}`;

  // 2. Charts
  renderIncomeVsExpenseChart(transactions, selectedMonth);
  renderDistributionChart(metrics.categoryBreakdown);

  // 3. Category Breakdown Table
  renderCategoryBreakdownTable(metrics.categoryBreakdown);
}

function renderIncomeVsExpenseChart(transactions, selectedMonth) {
  const canvas = document.getElementById('analytics-income-expense-chart');
  if (incomeExpenseChartInstance) {
    incomeExpenseChartInstance.destroy();
    incomeExpenseChartInstance = null;
  }

  if (typeof window.Chart === 'undefined') return;

  const { labels, incomeSeries, expenseSeries } = buildMonthlyCashflowSeries(
    transactions,
    selectedMonth
  );
  const ctx = canvas.getContext('2d');

  incomeExpenseChartInstance = new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Income',
          data: incomeSeries,
          backgroundColor: '#16a34a',
          borderRadius: 4,
          maxBarThickness: 24,
        },
        {
          label: 'Expenses',
          data: expenseSeries,
          backgroundColor: '#dc2626',
          borderRadius: 4,
          maxBarThickness: 24,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: 'rectRounded',
            color: '#475569',
            font: { size: 12, family: 'DM Sans, sans-serif' },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctxItem) => ` ${ctxItem.dataset.label}: ${formatCurrency(ctxItem.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#64748b',
            font: { size: 11, family: 'JetBrains Mono, monospace' },
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: '#f1f5f9' },
          border: { display: false },
          ticks: {
            color: '#64748b',
            font: { size: 11, family: 'JetBrains Mono, monospace' },
            callback: (v) => `$${v}`,
          },
        },
      },
    },
  });
}

function renderDistributionChart(breakdown) {
  const canvas = document.getElementById('analytics-distribution-chart');
  const emptyEl = document.getElementById('analytics-distribution-empty');

  if (distributionChartInstance) {
    distributionChartInstance.destroy();
    distributionChartInstance = null;
  }

  if (breakdown.length === 0 || typeof window.Chart === 'undefined') {
    canvas.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    return;
  }

  canvas.classList.remove('hidden');
  emptyEl.classList.add('hidden');

  const ctx = canvas.getContext('2d');
  distributionChartInstance = new window.Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: breakdown.map((b) => b.category),
      datasets: [
        {
          data: breakdown.map((b) => b.amount),
          backgroundColor: breakdown.map((b) => b.color),
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            padding: 12,
            color: '#475569',
            font: { size: 12, family: 'DM Sans, sans-serif' },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctxItem) => ` ${ctxItem.label}: ${formatCurrency(ctxItem.parsed)}`,
          },
        },
      },
    },
  });
}

function renderCategoryBreakdownTable(breakdown) {
  const tbody = document.getElementById('analytics-category-body');
  const emptyEl = document.getElementById('analytics-category-empty');
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
    .map(
      (item) => `
      <tr>
        <td>
          <span class="legend-left">
            <span class="legend-swatch" style="background-color: ${escapeHtml(item.color)}"></span>
            <strong>${escapeHtml(item.category)}</strong>
          </span>
        </td>
        <td>
          <div class="share-bar-cell">
            <div class="share-bar-track">
              <div class="share-bar-fill" style="width: ${item.percentage}%; background-color: ${escapeHtml(
        item.color
      )}"></div>
            </div>
            <span class="share-pct tabular-nums">${item.percentage}%</span>
          </div>
        </td>
        <td class="text-right tabular-nums">${item.count}</td>
        <td class="text-right tx-amount-text tabular-nums">${formatCurrency(item.amount)}</td>
      </tr>
    `
    )
    .join('');
}
