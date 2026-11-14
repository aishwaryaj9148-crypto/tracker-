# LedgerFlow — Expense Tracker

A minimalist, responsive personal finance and expense tracking web application built strictly with **HTML5**, **CSS3**, and **Vanilla JavaScript** (ES Modules), using **Chart.js** and **Lucide Icons** via CDN and browser `localStorage` for persistence.

## Folder Structure

```text
├── index.html          # Semantic HTML5 shell and modal dialogs
├── css/
│   └── style.css       # Minimalist CSS3 design system & responsive layouts
├── js/
│   ├── app.js          # Application orchestrator, routing, modals, and events
│   ├── storage.js      # Centralized LocalStorage repository (API-ready)
│   ├── transactions.js # Pure calculations, validation, CSV export, history UI
│   ├── dashboard.js    # Dashboard KPIs, spending overview & category charts
│   ├── analytics.js    # 6-month cash flow, savings rate, and top categories
│   └── budget.js       # Monthly budget limit, 80% warning & >100% alert logic
└── assets/
    └── favicon.svg     # Vector application icon
```

## Running Locally

Because the JavaScript files use native ES Modules (`<script type="module">`), serve the directory over any local HTTP server:

1. **Using Vite (included in environment):**
   ```bash
   npm install
   npm run dev
   ```
   Open `http://localhost:3000`.

2. **Using Python or Node static server (zero dependencies):**
   ```bash
   python3 -m http.server 8080
   # or: npx serve .
   ```
   Open `http://localhost:8080`.
