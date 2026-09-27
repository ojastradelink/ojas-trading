export type Fmt = 'money' | 'num' | 'qty' | 'date' | 'text';
export type FieldType = 'text' | 'number' | 'date' | 'select';

export interface DealColumn {
  key: string; // supports dot-path e.g. "buyerParty.name"
  label: string;
  fmt?: Fmt;
}
export interface DealField {
  key: string;
  label: string;
  type: FieldType;
  /** 'parties' = any party; 'products' = products (materials); 'sources' = a self firm's purchases with stock */
  ref?: 'parties' | 'products' | 'sources';
  options?: { value: string; label: string }[];
  /** Label of a select's blank option (defaults to "Select…"). */
  emptyLabel?: string;
  required?: boolean;
  hint?: string;
}
export interface FilterSpec {
  key: string;
  label: string;
  kind: 'select' | 'product' | 'party';
  options?: { value: string; label: string }[];
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
].map((m) => ({ value: m, label: m }));

/** Payment terms for the due date — days after the trade date. */
export const DUE_DAY_OPTIONS = [7, 10];

export const DEAL_ENDPOINT = '/deals';

export const DEAL_COLUMNS: DealColumn[] = [
  { key: 'dealNo', label: 'Deal ID' },
  { key: 'date', label: 'Date', fmt: 'date' },
  { key: 'buyerParty.name', label: 'Buyer' },
  { key: 'sellerParty.name', label: 'Seller' },
  { key: 'sourceDeal.dealNo', label: 'Sold From' },
  { key: 'product.code', label: 'Material' },
  { key: 'quantity', label: 'Qty (MT)', fmt: 'qty' },
  { key: 'rate', label: 'Rate', fmt: 'money' },
  { key: 'buyerBrokerage', label: 'Buyer Brokerage ₹/MT', fmt: 'money' },
  { key: 'sellerBrokerage', label: 'Seller Brokerage ₹/MT', fmt: 'money' },
  { key: 'brokerageTotal', label: 'Brokerage Total', fmt: 'money' },
  { key: 'port', label: 'Port' },
  { key: 'paymentCondition', label: 'Payment Condition' },
  { key: 'liftingDate', label: 'Lifting Due Date', fmt: 'date' },
  { key: 'shipmentMonth', label: 'Shipment' },
  { key: 'deposit', label: 'Deposit', fmt: 'money' },
  { key: 'dueDate', label: 'Due Date', fmt: 'date' },
];

export const DEAL_FIELDS: DealField[] = [
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'productId', label: 'Material', type: 'select', ref: 'products', required: true },
  { key: 'buyerPartyId', label: 'Buyer', type: 'select', ref: 'parties', required: true },
  { key: 'sellerPartyId', label: 'Seller', type: 'select', ref: 'parties', required: true },
  // Shown only when the seller is our own firm: the purchase deal the stock comes from.
  { key: 'sourceDealId', label: 'Selling From (purchase deal)', type: 'select', ref: 'sources', required: true },
  { key: 'quantity', label: 'Qty (MT)', type: 'number', required: true },
  { key: 'rate', label: 'Rate (₹/MT)', type: 'number', required: true },
  { key: 'buyerBrokerage', label: 'Buyer Brokerage (₹/MT)', type: 'number', hint: 'Half of the material’s brokerage — editable' },
  { key: 'sellerBrokerage', label: 'Seller Brokerage (₹/MT)', type: 'number', hint: 'Half of the material’s brokerage — editable' },
  { key: 'port', label: 'Port', type: 'text' },
  { key: 'paymentCondition', label: 'Payment Condition', type: 'text' },
  { key: 'liftingDate', label: 'Lifting Due Date', type: 'date' },
  { key: 'shipmentMonth', label: 'Shipment', type: 'select', options: MONTHS },
  { key: 'deposit', label: 'Deposit (₹)', type: 'number' },
  {
    key: 'dueDays', label: 'Due Date', type: 'select', emptyLabel: 'No due date',
    options: DUE_DAY_OPTIONS.map((d) => ({ value: String(d), label: `${d} days from trade date` })),
  },
];

export const DEAL_FILTERS: FilterSpec[] = [
  { key: 'productId', label: 'Material', kind: 'product' },
  { key: 'buyerPartyId', label: 'Buyer', kind: 'party' },
  { key: 'sellerPartyId', label: 'Seller', kind: 'party' },
  { key: 'shipmentMonth', label: 'Shipment', kind: 'select', options: MONTHS },
];

/** Server-side sort options (value = a whitelisted scalar column). */
export const DEAL_SORTS = [
  { label: 'Date', value: 'date' },
  { label: 'Deal ID', value: 'dealNo' },
  { label: 'Qty', value: 'quantity' },
  { label: 'Rate', value: 'rate' },
  { label: 'Brokerage Total', value: 'brokerageTotal' },
  { label: 'Deposit', value: 'deposit' },
  { label: 'Due Date', value: 'dueDate' },
  { label: 'Lifting Due Date', value: 'liftingDate' },
];
