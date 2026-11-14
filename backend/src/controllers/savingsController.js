const db = require('../config/database');

function parseId(rawId) {
  const parsed = Number(rawId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function isValidDate(dateStr) {
  if (!dateStr) return true; // optional
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  const dt = new Date(year, month - 1, day);
  return (
    dt.getFullYear() === year &&
    dt.getMonth() === month - 1 &&
    dt.getDate() === day
  );
}

function validateGoalPayload(body = {}, isUpdate = false) {
  const { goal_name, target_amount, current_amount, target_date } = body;

  if (!isUpdate || goal_name !== undefined) {
    if (!goal_name || typeof goal_name !== 'string' || goal_name.trim().length < 2) {
      return 'Goal name is required and must be at least 2 characters.';
    }
  }

  if (!isUpdate || target_amount !== undefined) {
    const numTarget = Number(target_amount);
    if (target_amount === undefined || target_amount === null || !Number.isFinite(numTarget) || numTarget <= 0) {
      return 'Target amount is required and must be a number greater than 0.';
    }
  }

  if (current_amount !== undefined && current_amount !== null) {
    const numCurrent = Number(current_amount);
    if (!Number.isFinite(numCurrent) || numCurrent < 0) {
      return 'Current saved amount cannot be negative.';
    }
  }

  if (target_date && !isValidDate(target_date.trim())) {
    return 'Target completion date must be a valid date in YYYY-MM-DD format.';
  }

  return null;
}

// GET /api/savings-goals
function getAllSavingsGoals(req, res, next) {
  try {
    const stmt = db.prepare('SELECT * FROM savings_goals ORDER BY id ASC');
    const goals = stmt.all();
    res.status(200).json({
      success: true,
      data: goals,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/savings-goals/:id
function getSavingsGoalById(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID: must be a positive integer.',
      });
    }

    const stmt = db.prepare('SELECT * FROM savings_goals WHERE id = ?');
    const goal = stmt.get(id);

    if (!goal) {
      return res.status(404).json({
        success: false,
        error: `Savings goal with ID ${id} was not found.`,
      });
    }

    res.status(200).json({
      success: true,
      data: goal,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/savings-goals
function createSavingsGoal(req, res, next) {
  try {
    const body = req.body || {};
    const error = validateGoalPayload(body, false);
    if (error) {
      return res.status(400).json({
        success: false,
        error,
      });
    }

    const goalName = body.goal_name.trim();
    const targetAmount = Number(Number(body.target_amount).toFixed(2));
    const currentAmount = body.current_amount !== undefined && body.current_amount !== null
      ? Number(Number(body.current_amount).toFixed(2))
      : 0;
    const targetDate = body.target_date ? String(body.target_date).trim() : null;
    const description = body.description ? String(body.description).trim() : '';

    const stmt = db.prepare(`
      INSERT INTO savings_goals (goal_name, target_amount, current_amount, target_date, description)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(goalName, targetAmount, currentAmount, targetDate, description);
    const created = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      data: created,
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/savings-goals/:id
function updateSavingsGoal(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID: must be a positive integer.',
      });
    }

    const existing = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Savings goal with ID ${id} was not found.`,
      });
    }

    const body = req.body || {};
    const error = validateGoalPayload(body, true);
    if (error) {
      return res.status(400).json({
        success: false,
        error,
      });
    }

    const goalName = body.goal_name !== undefined ? String(body.goal_name).trim() : existing.goal_name;
    const targetAmount = body.target_amount !== undefined
      ? Number(Number(body.target_amount).toFixed(2))
      : existing.target_amount;
    const currentAmount = body.current_amount !== undefined
      ? Number(Number(body.current_amount).toFixed(2))
      : existing.current_amount;
    const targetDate = body.target_date !== undefined
      ? (body.target_date ? String(body.target_date).trim() : null)
      : existing.target_date;
    const description = body.description !== undefined
      ? String(body.description).trim()
      : existing.description;

    const updateStmt = db.prepare(`
      UPDATE savings_goals
      SET goal_name = ?, target_amount = ?, current_amount = ?, target_date = ?, description = ?
      WHERE id = ?
    `);

    updateStmt.run(goalName, targetAmount, currentAmount, targetDate, description, id);
    const updated = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(id);

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/savings-goals/:id
function deleteSavingsGoal(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID: must be a positive integer.',
      });
    }

    const existing = db.prepare('SELECT id FROM savings_goals WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Savings goal with ID ${id} was not found.`,
      });
    }

    db.prepare('DELETE FROM savings_goals WHERE id = ?').run(id);

    res.status(200).json({
      success: true,
      data: { id, message: 'Savings goal deleted successfully.' },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllSavingsGoals,
  getSavingsGoalById,
  createSavingsGoal,
  updateSavingsGoal,
  deleteSavingsGoal,
};
