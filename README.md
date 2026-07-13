# RetailSense Nepal — Frontend

A smart business intelligence web application for Nepali retail store owners.

![RetailSense Nepal](https://img.shields.io/badge/RetailSense-Nepal-orange)
![React](https://img.shields.io/badge/React-18-blue)
![Vite](https://img.shields.io/badge/Vite-8-purple)
![Tailwind](https://img.shields.io/badge/Tailwind-3-teal)

## Overview

RetailSense Nepal is a full-stack business management and AI-powered analytics platform designed specifically for small retail store owners in Nepal. It replaces the traditional khata book with a digital system that tracks sales, inventory, customers and expenses — with 6 AI models for smart business insights.

## Features

- **Dashboard** — Live KPIs, revenue vs expenses chart, low stock alerts
- **POS** — Quick point-of-sale with product grid, cart, multiple payment methods
- **Inventory** — Vyapar-style split panel, fast/slow moving item classification
- **Customers & Suppliers** — Full ledger with balance tracking
- **Khata / Udharo** — Digital credit ledger per customer/supplier
- **Sales & Invoices** — Karobar-style inline invoice creation with delivery charges
- **Purchase & Expense** — Purchase bills + expense tracking
- **Profit & Loss** — Summary + item-wise P&L with margin analysis
- **Reports** — Sales trend charts, top products, expense breakdown
- **Settings** — Store profile, categories, theme toggle, BS/AD calendar
- **AI Models** — Cash flow forecasting, inventory demand, churn prediction, anomaly detection, credit scoring

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + Vite |
| Styling | Tailwind CSS 3 |
| State | Zustand |
| Data fetching | Supabase JS Client |
| Charts | Recharts |
| Icons | Lucide React |
| Notifications | React Hot Toast |
| Routing | React Router v6 |
| Database | Supabase (PostgreSQL) |

## Getting Started

### Prerequisites
- Node.js 18+
- npm 9+
- Supabase account

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/retailsense-frontend.git
cd retailsense-frontend

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Fill in your Supabase credentials in .env.local
nano .env.local

# Start development server
npm run dev
```

### Environment Variables

```env
VITE_SUPABASE_URL=https://yourproject.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_BASE_URL=http://localhost:8081
```

## Project Structure
src/
├── components/
│   ├── common/         # Reusable components (Modal, ErrorBoundary)
│   └── layout/         # Sidebar, Layout wrapper
├── hooks/              # Custom hooks (useStoreId)
├── lib/                # Supabase client, API client
├── pages/              # All page components
│   ├── auth/           # Login, Register
│   ├── dashboard/      # Main dashboard
│   ├── pos/            # Point of Sale
│   ├── inventory/      # Inventory management
│   ├── customers/      # Customer management
│   ├── suppliers/      # Supplier management
│   ├── khata/          # Khata/Udharo ledger
│   ├── sales/          # Sales & Invoices
│   ├── purchase/       # Purchase & Expense
│   ├── pnl/            # Profit & Loss
│   ├── reports/        # Reports & Analytics
│   └── settings/       # App settings
├── store/              # Zustand state stores
└── utils/              # Currency, date helpers



## Deployment

Deployed on **Vercel**. Every push to `main` triggers automatic deployment.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

## Academic Context

This project is developed as a Final Year Project for BSc Computer Science and AI at Sunway College Kathmandu, affiliated with Birmingham City University.

**Student:** Solomon Silwal
**Supervisor:** [Supervisor Name]
**Academic Year:** 2025/2026