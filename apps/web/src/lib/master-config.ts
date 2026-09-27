export interface FieldConfig {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'email' | 'select';
  required?: boolean;
  options?: { value: string; label: string }[];
}

export interface MasterResource {
  slug: string;
  label: string;
  group: string;
  endpoint: string;
  columns: { key: string; label: string }[];
  fields: FieldConfig[];
}

export const MASTER_RESOURCES: MasterResource[] = [
  {
    slug: 'parties',
    label: 'Parties',
    group: 'Master Data',
    endpoint: '/parties',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'type', label: 'Type' },
      { key: 'city', label: 'City / Region' },
      { key: 'phones', label: 'Phone' },
      { key: 'gstin', label: 'GSTIN' },
    ],
    fields: [
      { key: 'name', label: 'Party Name', required: true },
      {
        key: 'type',
        label: 'Type',
        type: 'select',
        options: [
          { value: 'BOTH', label: 'Both' },
          { value: 'BUYER', label: 'Buyer' },
          { value: 'SELLER', label: 'Seller' },
        ],
      },
      { key: 'contactPerson', label: 'Contact Person' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'city', label: 'City / Region' },
      { key: 'gstin', label: 'GSTIN' },
      { key: 'address', label: 'Address' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  {
    slug: 'products',
    label: 'Products',
    group: 'Master Data',
    endpoint: '/products',
    columns: [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Name' },
      { key: 'brokerage', label: 'Brokerage Total (₹/MT)' },
      { key: 'unit', label: 'Unit' },
    ],
    fields: [
      { key: 'code', label: 'Product Code', required: true },
      { key: 'name', label: 'Product Name', required: true },
      { key: 'unit', label: 'Unit' },
      { key: 'brokerage', label: 'Brokerage Total (₹/MT)', type: 'number' },
    ],
  },
];

export function findResource(slug: string) {
  return MASTER_RESOURCES.find((r) => r.slug === slug);
}
