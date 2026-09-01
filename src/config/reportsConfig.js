// Central definition of every report card + its table columns + API endpoint.
// Add a new report by adding one entry here.

export const REPORT_CATEGORIES = ["All Reports", "Transactions", "Parties", "Inventory", "Income Expense", "Business Status"];

export const REPORTS = [
  // ---- Transaction Report ----
  { key: "sales", title: "Sales", desc: "View your sales data on a given time", category: "Transactions", supported: true },
  { key: "purchase", title: "Purchase", desc: "View your purchase data on a given time", category: "Transactions", supported: true },
  { key: "sales-return", title: "Sales Return", desc: "View your sales return data on a given time", category: "Transactions", supported: false },
  { key: "purchase-return", title: "Purchase Return", desc: "View your purchase return data on a given time", category: "Transactions", supported: false },
  { key: "daybook", title: "Day Book", desc: "View all of your daily transactions", category: "Transactions", supported: true },
  { key: "all-transactions", title: "All Transactions", desc: "View all party transactions in a given time", category: "Transactions", supported: true },
  { key: "profit-loss", title: "Profit And Loss", desc: "View your profit & loss in a given time", category: "Transactions", supported: true },

  // ---- Party Report ----
  { key: "party-statement", title: "Party Statement", desc: "Check the transactions of a certain party", category: "Parties", supported: true, needsPartyPicker: true },
  { key: "all-parties", title: "All Party Report", desc: "Receivable/payable dues of every party", category: "Parties", supported: true },

  // ---- Inventory Report ----
  { key: "item-details", title: "Item Details Report", desc: "Check stock, transaction of individual item", category: "Inventory", supported: false },
  { key: "item-list", title: "Item List Report", desc: "Shows all item rates, sales, purchase, MRP price etc.", category: "Inventory", supported: true },
  { key: "low-stock", title: "Low Stock Summary Report", desc: "View all items getting low on quantity", category: "Inventory", supported: true },
  { key: "stock-quantity", title: "Stock Quantity Report", desc: "View opening & closing quantity of each item", category: "Inventory", supported: true },

  // ---- Income Expense Report ----
  { key: "income-expense", title: "Income Expense Report", desc: "Check all income expense report", category: "Income Expense", supported: true },
  { key: "expense-category", title: "Expense Category", desc: "Check categorized expense report in a given date", category: "Income Expense", supported: true },
  { key: "income-category", title: "Income Category", desc: "Check categorized income report in a given date", category: "Income Expense", supported: false },

  // ---- Business Status ----
  { key: "staff-report", title: "Staff Report", desc: "View all staff entries in a given time", category: "Business Status", supported: false },
  { key: "cash-in-hand", title: "Cash In Hand Statement", desc: "Check all transactions made with cash", category: "Business Status", supported: false },
  { key: "bank-statement", title: "Bank Statement", desc: "Check all transactions made with bank", category: "Business Status", supported: false },
  { key: "discount-report", title: "Discount Report", desc: "Check total discounted amount by each party", category: "Business Status", supported: false },
  { key: "tax-sales", title: "Tax Sales", desc: "Check report of all tax applicable sales", category: "Business Status", supported: false },
  { key: "tax-purchase", title: "Tax Purchase", desc: "Check report of all tax applicable purchase", category: "Business Status", supported: false },
];

export const REPORT_COLUMNS = {
  sales: [
    { key: "invoice_number", label: "Invoice No" },
    { key: "date", label: "Date" },
    { key: "customer_name", label: "Customer" },
    { key: "total", label: "Total", align: "right", type: "currency" },
    { key: "paid_amount", label: "Paid", align: "right", type: "currency" },
    { key: "balance", label: "Balance", align: "right", type: "currency" },
    { key: "status", label: "Status" },
  ],
  purchase: [
    { key: "bill_number", label: "Bill No" },
    { key: "date", label: "Date" },
    { key: "supplier_name", label: "Supplier" },
    { key: "total", label: "Total", align: "right", type: "currency" },
    { key: "status", label: "Status" },
  ],
  daybook: [
    { key: "date", label: "Date" },
    { key: "type", label: "Type" },
    { key: "reference", label: "Reference" },
    { key: "party_name", label: "Party" },
    { key: "amount", label: "Amount", align: "right", type: "currency" },
  ],
  "all-transactions": [
    { key: "date", label: "Date" },
    { key: "party_name", label: "Party" },
    { key: "type", label: "Type" },
    { key: "amount", label: "Amount", align: "right", type: "currency" },
  ],
  "party-statement": [
    { key: "date", label: "Date" },
    { key: "reference", label: "Reference" },
    { key: "debit", label: "Debit", align: "right", type: "currency" },
    { key: "credit", label: "Credit", align: "right", type: "currency" },
    { key: "balance", label: "Balance", align: "right", type: "currency" },
  ],
  "all-parties": [
    { key: "party_name", label: "Party" },
    { key: "phone", label: "Phone" },
    { key: "credit_limit", label: "Credit Limit", align: "right", type: "currency" },
    { key: "balance", label: "Balance (Rs.)", align: "right", type: "currency" },
  ],
  "item-list": [
    { key: "sku", label: "SKU" },
    { key: "name", label: "Item Name" },
    { key: "category", label: "Category" },
    { key: "cost_price", label: "Cost Price", align: "right", type: "currency" },
    { key: "selling_price", label: "Selling Price", align: "right", type: "currency" },
    { key: "stock_quantity", label: "Stock Qty", align: "right" },
  ],
  "low-stock": [
    { key: "sku", label: "SKU" },
    { key: "name", label: "Item Name" },
    { key: "stock_quantity", label: "Current Qty", align: "right" },
    { key: "reorder_level", label: "Reorder Level", align: "right" },
  ],
  "stock-quantity": [
    { key: "sku", label: "SKU" },
    { key: "name", label: "Item Name" },
    { key: "opening_qty", label: "Opening Qty", align: "right" },
    { key: "purchased_qty", label: "Purchased", align: "right" },
    { key: "sold_qty", label: "Sold", align: "right" },
    { key: "closing_qty", label: "Closing Qty", align: "right" },
  ],
  "income-expense": [
    { key: "date", label: "Date" },
    { key: "type", label: "Type" },
    { key: "category", label: "Category" },
    { key: "description", label: "Description" },
    { key: "amount", label: "Amount", align: "right", type: "currency" },
  ],
  "expense-category": [
    { key: "category", label: "Category" },
    { key: "count", label: "Entries", align: "right" },
    { key: "total", label: "Total", align: "right", type: "currency" },
  ],
};
