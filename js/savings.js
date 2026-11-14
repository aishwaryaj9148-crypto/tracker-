/**
 * savings.js — Savings Goal Tracker Domain Logic & View
 * ---------------------------------------------------------------------------
 * Provides progress calculations, input validations, and renders the
 * Savings Goals dashboard view and dynamic progress cards.
 */

import { escapeHtml, formatCurrency, formatDisplayDate } from './transactions.js';

/**
 * Pure calculation: progress percentage and remaining amount for an individual goal.
 */
export function calculateGoalProgress(currentAmount, targetAmount) {
  const cur = Number(currentAmount) || 0;
  const tgt = Number(targetAmount) || 0;
  const percentage = tgt > 0 ? Number(((cur / tgt) * 100).toFixed(1)) : 0;
  const remaining = Number(Math.max(0, tgt - cur).toFixed(2));
  const isCompleted = tgt > 0 && cur >= tgt;

  return {
    current: Number(cur.toFixed(2)),
    target: Number(tgt.toFixed(2)),
    percentage,
    remaining,
    isCompleted,
  };
}

/**
 * Pure calculation: summary dashboard metrics across all savings goals.
 */
export function calculateSavingsTotals(goals = []) {
  const totalGoals = goals.length;
  let totalTarget = 0;
  let totalSaved = 0;

  for (const g of goals) {
    totalTarget += Number(g.target_amount) || 0;
    totalSaved += Number(g.current_amount) || 0;
  }

  const totalRemaining = Number(Math.max(0, totalTarget - totalSaved).toFixed(2));
  const overallProgress = totalTarget > 0 ? Number(((totalSaved / totalTarget) * 100).toFixed(1)) : 0;

  return {
    totalGoals,
    totalTarget: Number(totalTarget.toFixed(2)),
    totalSaved: Number(totalSaved.toFixed(2)),
    totalRemaining,
    overallProgress,
  };
}

/**
 * Validates savings goal input before saving.
 */
export function validateSavingsGoalInput(data) {
  const errors = {};

  const name = String(data.goal_name || '').trim();
  if (!name || name.length < 2) {
    errors.goal_name = 'Goal name is required and must be at least 2 characters.';
  }

  const target = Number(data.target_amount);
  if (!Number.isFinite(target) || target <= 0) {
    errors.target_amount = 'Target amount must be a number greater than zero.';
  } else if (target > 100000000) {
    errors.target_amount = 'Target amount exceeds maximum allowed limit.';
  }

  if (data.current_amount !== undefined && data.current_amount !== '') {
    const cur = Number(data.current_amount);
    if (!Number.isFinite(cur) || cur < 0) {
      errors.current_amount = 'Saved amount cannot be negative.';
    }
  }

  if (data.target_date) {
    const dateStr = String(data.target_date).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      errors.target_date = 'Please enter a valid target date (YYYY-MM-DD).';
    } else {
      const parsed = new Date(`${dateStr}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) {
        errors.target_date = 'Invalid calendar date.';
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Renders the complete Savings Goals view.
 */
export function renderSavingsView({ goals, onAddMoney, onEdit, onDelete }) {
  const metrics = calculateSavingsTotals(goals);

  // 1. Update Savings KPI Dashboard Cards
  document.getElementById('savings-kpi-total-goals').textContent = `${metrics.totalGoals}`;
  document.getElementById('savings-kpi-goals-meta').textContent =
    metrics.totalGoals === 1 ? '1 active goal' : `${metrics.totalGoals} active goals`;

  document.getElementById('savings-kpi-total-target').textContent = formatCurrency(metrics.totalTarget);
  document.getElementById('savings-kpi-total-saved').textContent = formatCurrency(metrics.totalSaved);

  const remainingEl = document.getElementById('savings-kpi-total-remaining');
  remainingEl.textContent = formatCurrency(metrics.totalRemaining);

  document.getElementById('savings-kpi-progress-meta').textContent =
    metrics.totalTarget > 0 ? `${metrics.overallProgress}% overall completion` : 'No savings target set';

  // 2. Render Goals Grid or Empty State
  const gridEl = document.getElementById('savings-goals-grid');
  const emptyEl = document.getElementById('savings-goals-empty');

  if (goals.length === 0) {
    gridEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    gridEl.innerHTML = '';
    return;
  }

  gridEl.classList.remove('hidden');
  emptyEl.classList.add('hidden');

  gridEl.innerHTML = goals
    .map((goal) => {
      const prog = calculateGoalProgress(goal.current_amount, goal.target_amount);
      const clampedWidth = Math.min(prog.percentage, 100);
      const isCompleted = prog.isCompleted;

      const dateText = goal.target_date
        ? `Target: ${formatDisplayDate(goal.target_date)}`
        : 'No target date';

      const descHtml = goal.description
        ? `<p class="goal-desc">${escapeHtml(goal.description)}</p>`
        : '';

      return `
        <article class="card panel-card goal-card">
          <div class="goal-card-header">
            <div>
              <h3 class="goal-title">${escapeHtml(goal.goal_name)}</h3>
              ${descHtml}
            </div>
            <span class="goal-badge ${isCompleted ? 'is-completed' : ''}">
              ${isCompleted ? 'Completed' : 'In Progress'}
            </span>
          </div>

          <div class="goal-progress-section">
            <div class="goal-progress-meta">
              <span class="goal-amounts tabular-nums">
                <strong>${formatCurrency(prog.current)}</strong>
                <span> / ${formatCurrency(prog.target)}</span>
              </span>
              <span class="goal-percentage tabular-nums ${isCompleted ? 'is-completed' : ''}">
                ${prog.percentage}%
              </span>
            </div>

            <div class="progress-track" aria-label="Savings goal progress">
              <div
                class="progress-fill ${isCompleted ? 'is-completed' : ''}"
                style="width: ${clampedWidth}%;"
              ></div>
            </div>

            <div class="budget-snapshot-footer">
              <span class="tabular-nums">
                ${isCompleted ? 'Goal reached!' : `${formatCurrency(prog.remaining)} remaining`}
              </span>
              <span>${escapeHtml(dateText)}</span>
            </div>
          </div>

          <div class="goal-footer">
            <button
              type="button"
              class="btn btn-secondary btn-sm js-add-money-btn"
              data-id="${escapeHtml(goal.id)}"
              title="Add money to this goal"
            >
              <i data-lucide="plus-circle" aria-hidden="true"></i>
              <span>Add Money</span>
            </button>

            <div class="goal-actions">
              <button
                type="button"
                class="icon-btn icon-btn-sm js-edit-goal-btn"
                data-id="${escapeHtml(goal.id)}"
                aria-label="Edit ${escapeHtml(goal.goal_name)}"
                title="Edit goal"
              >
                <i data-lucide="pencil"></i>
              </button>
              <button
                type="button"
                class="icon-btn icon-btn-sm icon-btn-danger js-delete-goal-btn"
                data-id="${escapeHtml(goal.id)}"
                aria-label="Delete ${escapeHtml(goal.goal_name)}"
                title="Delete goal"
              >
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  // 3. Attach Action Event Listeners
  gridEl.querySelectorAll('.js-add-money-btn').forEach((btn) => {
    btn.addEventListener('click', () => onAddMoney(btn.dataset.id));
  });

  gridEl.querySelectorAll('.js-edit-goal-btn').forEach((btn) => {
    btn.addEventListener('click', () => onEdit(btn.dataset.id));
  });

  gridEl.querySelectorAll('.js-delete-goal-btn').forEach((btn) => {
    btn.addEventListener('click', () => onDelete(btn.dataset.id));
  });
}
