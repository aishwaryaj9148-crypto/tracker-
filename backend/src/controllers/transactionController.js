const db = require('../config/database');

function isValidDate(dateStr) {
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

function validateTransactionPayload(body = {}) {
  const { title, amount, category, type, date, description } = body || {};

  if (!title || typeof title !== 'string' || title.trim().length < 2) {
    return 'Title is required and must be at least 2 characters.';
  }

  const numAmount = Number(amount);
  if (amount === undefined || amount === null || !Number.isFinite(numAmount) || numAmount <= 0) {
    return 'Amount is required and must be a number greater than 0.';
  }

  if (!category || typeof category !== 'string' || !category.trim()) {
    return 'Category is required.';
  }

  if (type !== 'income' && type !== 'expense') {
    return 'Type must be either "income" or "expense".';
  }

  if (!isValidDate(date)) {
    return 'Date is required and must be a valid date in YYYY-MM-DD format.';
  }

  return null;
}

function parseId(rawId) {
  const parsed = Number(rawId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

// GET /api/transactions
function getAllTransactions(req, res, next) {
  try {
    const stmt = db.prepare('SELECT * FROM transactions ORDER BY date DESC, id DESC');
    const transactions = stmt.all();
    res.status(200).json({
      success: true,
      data: transactions,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/transactions/:id
function getTransactionById(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID: must be a positive integer.',
      });
    }

    const stmt = db.prepare('SELECT * FROM transactions WHERE id = ?');
    const transaction = stmt.get(id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: `Transaction with ID ${id} was not found.`,
      });
    }

    res.status(200).json({
      success: true,
      data: transaction,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/transactions
function createTransaction(req, res, next) {
  try {
    const body = req.body || {};
    const error = validateTransactionPayload(body);
    if (error) {
      return res.status(400).json({
        success: false,
        error,
      });
    }

    const title = body.title.trim();
    const amount = Number(Number(body.amount).toFixed(2));
    const category = body.category.trim();
    const type = body.type;
    const date = body.date.trim();
    const description = body.description ? String(body.description).trim() : '';

    const stmt = db.prepare(`
      INSERT INTO transactions (title, amount, category, type, date, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(title, amount, category, type, date, description);
    const createdStmt = db.prepare('SELECT * FROM transactions WHERE id = ?');
    const created = createdStmt.get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      data: created,
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/transactions/:id
function updateTransaction(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID: must be a positive integer.',
      });
    }

    const body = req.body || {};
    const error = validateTransactionPayload(body);
    if (error) {
      return res.status(400).json({
        success: false,
        error,
      });
    }

    const checkStmt = db.prepare('SELECT id FROM transactions WHERE id = ?');
    const existing = checkStmt.get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Transaction with ID ${id} was not found.`,
      });
    }

    const title = body.title.trim();
    const amount = Number(Number(body.amount).toFixed(2));
    const category = body.category.trim();
    const type = body.type;
    const date = body.date.trim();
    const description = body.description ? String(body.description).trim() : '';

    const updateStmt = db.prepare(`
      UPDATE transactions
      SET title = ?, amount = ?, category = ?, type = ?, date = ?, description = ?
      WHERE id = ?
    `);

    updateStmt.run(title, amount, category, type, date, description, id);

    const updated = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/transactions/:id
function deleteTransaction(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID: must be a positive integer.',
      });
    }

    const checkStmt = db.prepare('SELECT id FROM transactions WHERE id = ?');
    const existing = checkStmt.get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Transaction with ID ${id} was not found.`,
      });
    }

    const deleteStmt = db.prepare('DELETE FROM transactions WHERE id = ?');
    deleteStmt.run(id);

    res.status(200).json({
      success: true,
      data: { id, message: 'Transaction deleted successfully.' },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllTransactions,
  getTransactionById,
  createTransaction,
  updateTransaction,
  deleteTransaction,
};
