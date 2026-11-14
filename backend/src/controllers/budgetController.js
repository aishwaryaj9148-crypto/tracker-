const db = require('../config/database');

function parseId(rawId) {
  const parsed = Number(rawId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseMonth(rawMonth) {
  const parsed = Number(rawMonth);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
    return null;
  }
  return parsed;
}

function parseYear(rawYear) {
  const parsed = Number(rawYear);
  if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 2100) {
    return null;
  }
  return parsed;
}

function parseAmount(rawAmount) {
  const num = Number(rawAmount);
  if (rawAmount === undefined || rawAmount === null || !Number.isFinite(num) || num <= 0) {
    return null;
  }
  return Number(num.toFixed(2));
}

// GET /api/budgets/:year/:month
function getBudgetByMonth(req, res, next) {
  try {
    const year = parseYear(req.params.year);
    if (!year) {
      return res.status(400).json({
        success: false,
        error: 'Invalid year: must be a valid 4-digit year (e.g. 2026).',
      });
    }

    const month = parseMonth(req.params.month);
    if (!month) {
      return res.status(400).json({
        success: false,
        error: 'Invalid month: must be an integer between 1 and 12.',
      });
    }

    const stmt = db.prepare('SELECT * FROM monthly_budgets WHERE year = ? AND month = ?');
    const budget = stmt.get(year, month);

    if (!budget) {
      return res.status(404).json({
        success: false,
        error: `No budget found for ${year}-${String(month).padStart(2, '0')}.`,
      });
    }

    res.status(200).json({
      success: true,
      data: budget,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/budgets
function createBudget(req, res, next) {
  try {
    const body = req.body || {};
    const year = parseYear(body.year);
    if (!year) {
      return res.status(400).json({
        success: false,
        error: 'Invalid year: must be a valid 4-digit year (e.g. 2026).',
      });
    }

    const month = parseMonth(body.month);
    if (!month) {
      return res.status(400).json({
        success: false,
        error: 'Invalid month: must be an integer between 1 and 12.',
      });
    }

    const amount = parseAmount(body.amount);
    if (!amount) {
      return res.status(400).json({
        success: false,
        error: 'Amount is required and must be a number greater than 0.',
      });
    }

    // Check for existing budget for that month/year (UNIQUE constraint)
    const existing = db.prepare('SELECT id FROM monthly_budgets WHERE year = ? AND month = ?').get(year, month);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: `A budget for ${year}-${String(month).padStart(2, '0')} already exists. Use PUT /api/budgets/${existing.id} to update it.`,
      });
    }

    const insertStmt = db.prepare(`
      INSERT INTO monthly_budgets (year, month, amount)
      VALUES (?, ?, ?)
    `);

    const result = insertStmt.run(year, month, amount);
    const created = db.prepare('SELECT * FROM monthly_budgets WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      data: created,
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/budgets/:id
function updateBudget(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID: must be a positive integer.',
      });
    }

    const existing = db.prepare('SELECT * FROM monthly_budgets WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Budget with ID ${id} was not found.`,
      });
    }

    const body = req.body || {};
    const amount = parseAmount(body.amount !== undefined ? body.amount : existing.amount);
    if (!amount) {
      return res.status(400).json({
        success: false,
        error: 'Amount is required and must be a number greater than 0.',
      });
    }

    let year = existing.year;
    if (body.year !== undefined) {
      year = parseYear(body.year);
      if (!year) {
        return res.status(400).json({
          success: false,
          error: 'Invalid year: must be a valid 4-digit year.',
        });
      }
    }

    let month = existing.month;
    if (body.month !== undefined) {
      month = parseMonth(body.month);
      if (!month) {
        return res.status(400).json({
          success: false,
          error: 'Invalid month: must be an integer between 1 and 12.',
        });
      }
    }

    // Check if updating year/month conflicts with another record
    if (year !== existing.year || month !== existing.month) {
      const conflict = db.prepare('SELECT id FROM monthly_budgets WHERE year = ? AND month = ? AND id != ?').get(year, month, id);
      if (conflict) {
        return res.status(409).json({
          success: false,
          error: `A budget for ${year}-${String(month).padStart(2, '0')} already exists.`,
        });
      }
    }

    const updateStmt = db.prepare(`
      UPDATE monthly_budgets
      SET year = ?, month = ?, amount = ?
      WHERE id = ?
    `);

    updateStmt.run(year, month, amount, id);
    const updated = db.prepare('SELECT * FROM monthly_budgets WHERE id = ?').get(id);

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getBudgetByMonth,
  createBudget,
  updateBudget,
};
