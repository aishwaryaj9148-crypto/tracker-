const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment configuration
const backendRoot = path.resolve(__dirname, '../');
dotenv.config({ path: path.join(backendRoot, '.env') });

// Initialize database & schema
require('./config/database');

const healthRoutes = require('./routes/healthRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const budgetRoutes = require('./routes/budgetRoutes');
const savingsRoutes = require('./routes/savingsRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for external/local callers
app.use(cors());

// Parse incoming JSON payloads
app.use(express.json());

// API Routes
app.use('/api/health', healthRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/savings-goals', savingsRoutes);

// Catch-all 404 for unknown /api routes
app.use('/api', notFoundHandler);

// Serve static frontend files from parent directory (tracker-)
const frontendPath = path.resolve(backendRoot, '../');
app.use(express.static(frontendPath));

// Fallback to index.html for frontend HTML navigation
app.use((req, res, next) => {
  if (req.method === 'GET' && req.accepts('html')) {
    return res.sendFile(path.join(frontendPath, 'index.html'));
  }
  next();
});

// Central error-handling middleware
app.use(errorHandler);

// Start HTTP server only if not being required in tests
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`LedgerFlow Server running on port ${PORT}`);
    console.log(`- Web App:     http://localhost:${PORT}`);
    console.log(`- Health Check: http://localhost:${PORT}/api/health`);
  });
}

module.exports = app;
