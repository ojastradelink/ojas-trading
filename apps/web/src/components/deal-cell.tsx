import type { Fmt } from '@/lib/deal-config';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';

/** Read a dot-path such as "buyerParty.name" off a row. */
export function getPath(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

/** Render one table cell in the deal tables' format ("—" when empty). */
export function renderCell(value: any, fmt?: Fmt) {
  if (value == null || value === '') return <span className="text-muted-foreground">—</span>;
  switch (fmt) {
    case 'money': return formatCurrency(value);
    case 'num': return formatNumber(value, 0);
    case 'qty': return formatNumber(value, 3);
    case 'date': return formatDate(value);
    default: return String(value);
  }
}
