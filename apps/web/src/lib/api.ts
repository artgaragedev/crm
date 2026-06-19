import type {
  AttributeDto,
  AuthResponse,
  AuthUser,
  Category,
  CreateAttributeInput,
  CreateAttributeValueInput,
  CreateCategoryInput,
  CreateCustomerInput,
  CreateMovementBatchInput,
  CreateProductInput,
  CreateProductWithMatrixInput,
  CreateProductWithVariantInput,
  ExtendProductWithMatrixInput,
  CreateStockMovementInput,
  CreateSupplierInput,
  CreateVariantInput,
  Customer,
  MovementType,
  Product,
  ProductUnit,
  Supplier,
  UpdateAttributeInput,
  UpdateAttributeValueInput,
  UpdateCategoryInput,
  UpdateCustomerInput,
  UpdateProductInput,
  UpdateSupplierInput,
  UpdateVariantInput,
  Variant,
  VariantAttributes,
  AttributeValueDto,
} from '@art-garage/shared';
import { getAuthToken } from './auth-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: Record<string, string | number | boolean | string[] | undefined>;
}

export async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, query, headers, ...rest } = options;

  const url = new URL(API_URL.replace(/\/$/, '') + (path.startsWith('/') ? path : `/${path}`));
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) {
        if (v.length > 0) url.searchParams.set(k, v.join(','));
      } else {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const token = getAuthToken();
  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(headers as Record<string, string> | undefined),
  };

  const res = await fetch(url.toString(), {
    ...rest,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data: unknown = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof (data as { message: unknown }).message === 'string'
        ? (data as { message: string }).message
        : `Request failed: ${res.status}`;
    throw new ApiError(message, res.status, data);
  }

  return data as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Преобразует фильтры отчётов в query-объект для request(). Массивы передаются как CSV. */
function filtersToQuery(filters: ReportFilters): Record<string, string | string[] | undefined> {
  return {
    from: filters.from,
    to: filters.to,
    customerIds: filters.customerIds,
    variantIds: filters.variantIds,
    productIds: filters.productIds,
    categoryIds: filters.categoryIds,
    userIds: filters.userIds,
  };
}

export type ReportCsvKind =
  | 'movements'
  | 'by-customer'
  | 'by-product'
  | 'by-variant'
  | 'by-category'
  | 'by-manager'
  | 'dead-stock';

/**
 * Общий blob-download для всех CSV-эндпоинтов. Берёт Bearer из auth-store,
 * парсит filename из Content-Disposition (если есть) или генерирует по дате.
 */
async function downloadCsv(
  path: string,
  query?: Record<string, string | string[] | undefined>,
): Promise<void> {
  const url = new URL(API_URL.replace(/\/$/, '') + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) {
        if (v.length > 0) url.searchParams.set(k, v.join(','));
      } else {
        url.searchParams.set(k, String(v));
      }
    }
  }
  const token = getAuthToken();
  const res = await fetch(url.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new ApiError(`Export failed: ${res.status}`, res.status);
  const blob = await res.blob();

  // Имя файла берём из заголовка (сервер уже знает kind и дату), либо fallback.
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename =
    match?.[1] ??
    `${path.replace(/^.*\//, '').replace(/\.csv$/, '')}-${new Date().toISOString().slice(0, 10)}.csv`;

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export interface CategoryListItem extends Category {
  productCount: number;
  /** Следующий sequential номер для нового товара в этой категории. */
  nextProductSeq: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface VariantLot {
  id: string;
  variantId: string;
  unitCost: number;
  initialQuantity: number;
  remainingQuantity: number;
  receivedAt: string;
  supplierId: string | null;
  supplier: { id: string; name: string } | null;
  note: string | null;
  userId: string;
  createdByMovementId: string;
  createdAt: string;
}

export interface ImportRow {
  productName: string;
  unit?: ProductUnit;
  categoryName?: string | null;
  sku: string;
  color?: string;
  attributes?: Record<string, string>;
  price?: number | null;
  reorderLevel?: number | null;
  initialStock?: number;
  supplierName?: string | null;
  description?: string;
}

export interface ImportReport {
  total: number;
  productsCreated: number;
  productsReused: number;
  variantsCreated: number;
  variantsSkipped: number;
  initialStocksCreated: number;
  errors: Array<{ row: number; sku?: string; message: string }>;
}

export interface AuditLogEntry {
  id: string;
  entity: string;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';
  before: unknown;
  after: unknown;
  note: string | null;
  user: { id: string; name: string; email: string } | null;
  createdAt: string;
}

/** Общие фильтры для всех аналитических эндпоинтов. */
export interface ReportFilters {
  from?: string;
  to?: string;
  customerIds?: string[];
  variantIds?: string[];
  productIds?: string[];
  categoryIds?: string[];
  userIds?: string[];
}

export interface ReportAggregate {
  revenue: number;
  cogs: number;
  profit: number;
  marginPct: number;
  transactions: number;
  pricedTransactions: number;
  qty: number;
  avgTicket: number;
  returns: { count: number; qty: number };
}

export interface ReportSummary extends ReportAggregate {
  period: { from: string; to: string };
  /** Тот же период длины duration, заканчивающийся ровно перед current. Только когда compareToPrevious=true. */
  previous: (ReportAggregate & { period: { from: string; to: string } }) | null;
}

export interface DeadStockItem {
  variantId: string;
  sku: string;
  productName: string;
  categoryId: string | null;
  categoryName: string | null;
  currentStock: number;
  deadValue: number;
  lastOutAt: string | null;
}

export interface DeadStockReport {
  thresholdDays: number;
  cutoff: string;
  items: DeadStockItem[];
}

export type Granularity = 'day' | 'week' | 'month';

export interface ReportTimeline {
  period: { from: string; to: string };
  granularity: Granularity;
  points: Array<{
    bucket: string;
    revenue: number;
    cogs: number;
    profit: number;
    transactions: number;
    qty: number;
  }>;
}

export type BreakdownDimension = 'customer' | 'variant' | 'product' | 'category' | 'user';
export type BreakdownSort = 'revenue' | 'profit' | 'qty' | 'transactions';

export interface BreakdownItem {
  id: string | null;
  name: string;
  revenue: number;
  cogs: number;
  profit: number;
  marginPct: number;
  qty: number;
  transactions: number;
}

export interface ReportBreakdown {
  period: { from: string; to: string };
  dimension: BreakdownDimension;
  sort: BreakdownSort;
  items: BreakdownItem[];
}

export interface ReportMovement {
  id: string;
  createdAt: string;
  qty: number;
  unitPrice: number | null;
  discountPercent: number | null;
  revenue: number | null;
  cogs: number | null;
  profit: number | null;
  note: string | null;
  customer: { id: string; name: string } | null;
  variant: {
    id: string;
    sku: string;
    productName: string;
    categoryId: string | null;
    categoryName: string | null;
  };
  user: { id: string; name: string };
}

export interface ReportMovementsResponse {
  period: { from: string; to: string };
  page: number;
  pageSize: number;
  total: number;
  items: ReportMovement[];
}

export interface DashboardSummary {
  inventory: {
    totalVariants: number;
    pricedVariants: number;
    totalValue: number;
    lowStockCount: number;
    outOfStockCount: number;
  };
  activity: {
    days: number;
    total: number;
    in: number;
    out: number;
    adjust: number;
  };
  lowStockThreshold: number;
  lowStock: Array<{
    variantId: string;
    productName: string;
    sku: string;
    attributes: VariantAttributes;
    currentStock: number;
    unit: ProductUnit;
  }>;
  recentMovements: MovementListItem[];
}

export interface MovementListItem {
  id: string;
  type: MovementType;
  variantId: string;
  quantity: number;
  supplierId: string | null;
  customerId: string | null;
  userId: string;
  note: string | null;
  reversesId: string | null;
  reversedBy: { id: string; createdAt: string } | null;
  totalCost: number | null;
  createdAt: string;
  variant: {
    id: string;
    sku: string;
    attributes: VariantAttributes;
    price: number | null;
    product: {
      id: string;
      name: string;
      unit: ProductUnit;
      categoryId: string | null;
    };
  };
  supplier: { id: string; name: string } | null;
  customer: { id: string; name: string } | null;
  user: { id: string; name: string; email: string };
}

export const api = {
  login: (input: { email: string; password: string }) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: input }),
  me: () => request<AuthUser>('/auth/me'),

  attributes: {
    list: (query?: {
      page?: number;
      pageSize?: number;
      search?: string;
      includeDeleted?: boolean;
    }) =>
      request<PaginatedResponse<AttributeDto>>('/attributes', {
        query: { ...query, includeDeleted: query?.includeDeleted ? 'true' : undefined },
      }),
    findOne: (id: string) => request<AttributeDto>(`/attributes/${id}`),
    create: (input: CreateAttributeInput) =>
      request<AttributeDto>('/attributes', { method: 'POST', body: input }),
    update: (id: string, input: UpdateAttributeInput) =>
      request<AttributeDto>(`/attributes/${id}`, { method: 'PATCH', body: input }),
    remove: (id: string) => request<void>(`/attributes/${id}`, { method: 'DELETE' }),
    restore: (id: string) =>
      request<AttributeDto>(`/attributes/${id}/restore`, { method: 'POST' }),

    createValue: (attributeId: string, input: CreateAttributeValueInput) =>
      request<AttributeValueDto>(`/attributes/${attributeId}/values`, {
        method: 'POST',
        body: input,
      }),
    updateValue: (valueId: string, input: UpdateAttributeValueInput) =>
      request<AttributeValueDto>(`/attributes/values/${valueId}`, {
        method: 'PATCH',
        body: input,
      }),
    removeValue: (valueId: string) =>
      request<void>(`/attributes/values/${valueId}`, { method: 'DELETE' }),
  },

  categories: {
    list: (query?: {
      page?: number;
      pageSize?: number;
      search?: string;
      includeDeleted?: boolean;
    }) =>
      request<PaginatedResponse<CategoryListItem>>('/categories', {
        query: { ...query, includeDeleted: query?.includeDeleted ? 'true' : undefined },
      }),
    create: (input: CreateCategoryInput) =>
      request<Category>('/categories', { method: 'POST', body: input }),
    update: (id: string, input: UpdateCategoryInput) =>
      request<Category>(`/categories/${id}`, { method: 'PATCH', body: input }),
    remove: (id: string) => request<void>(`/categories/${id}`, { method: 'DELETE' }),
    restore: (id: string) =>
      request<Category>(`/categories/${id}/restore`, { method: 'POST' }),
  },

  products: {
    list: (query?: {
      page?: number;
      pageSize?: number;
      search?: string;
      categoryId?: string;
      includeDeleted?: boolean;
    }) =>
      request<PaginatedResponse<Product>>('/products', {
        query: { ...query, includeDeleted: query?.includeDeleted ? 'true' : undefined },
      }),
    findOne: (id: string) => request<Product>(`/products/${id}`),
    create: (input: CreateProductInput) =>
      request<Product>('/products', { method: 'POST', body: input }),
    update: (id: string, input: UpdateProductInput) =>
      request<Product>(`/products/${id}`, { method: 'PATCH', body: input }),
    remove: (id: string) => request<void>(`/products/${id}`, { method: 'DELETE' }),
    restore: (id: string) => request<Product>(`/products/${id}/restore`, { method: 'POST' }),
  },

  customers: {
    list: (query?: {
      page?: number;
      pageSize?: number;
      search?: string;
      includeDeleted?: boolean;
    }) =>
      request<PaginatedResponse<Customer>>('/customers', {
        query: { ...query, includeDeleted: query?.includeDeleted ? 'true' : undefined },
      }),
    create: (input: CreateCustomerInput) =>
      request<Customer>('/customers', { method: 'POST', body: input }),
    update: (id: string, input: UpdateCustomerInput) =>
      request<Customer>(`/customers/${id}`, { method: 'PATCH', body: input }),
    remove: (id: string) => request<void>(`/customers/${id}`, { method: 'DELETE' }),
    restore: (id: string) => request<Customer>(`/customers/${id}/restore`, { method: 'POST' }),
  },

  suppliers: {
    list: (query?: {
      page?: number;
      pageSize?: number;
      search?: string;
      includeDeleted?: boolean;
    }) =>
      request<PaginatedResponse<Supplier>>('/suppliers', {
        query: { ...query, includeDeleted: query?.includeDeleted ? 'true' : undefined },
      }),
    create: (input: CreateSupplierInput) =>
      request<Supplier>('/suppliers', { method: 'POST', body: input }),
    update: (id: string, input: UpdateSupplierInput) =>
      request<Supplier>(`/suppliers/${id}`, { method: 'PATCH', body: input }),
    remove: (id: string) => request<void>(`/suppliers/${id}`, { method: 'DELETE' }),
    restore: (id: string) => request<Supplier>(`/suppliers/${id}/restore`, { method: 'POST' }),
  },

  dashboard: {
    summary: () => request<DashboardSummary>('/dashboard/summary'),
  },

  users: {
    list: () =>
      request<Array<{ id: string; name: string; email: string; role: 'ADMIN' | 'STAFF' }>>(
        '/users',
      ),
  },

  reports: {
    summary: (filters: ReportFilters & { compareToPrevious?: boolean } = {}) =>
      request<ReportSummary>('/reports/summary', {
        query: {
          ...filtersToQuery(filters),
          compareToPrevious: filters.compareToPrevious ? 'true' : undefined,
        },
      }),
    timeline: (filters: ReportFilters & { granularity?: Granularity } = {}) =>
      request<ReportTimeline>('/reports/timeline', {
        query: { ...filtersToQuery(filters), granularity: filters.granularity ?? 'day' },
      }),
    byCustomer: (
      filters: ReportFilters & { sort?: BreakdownSort; limit?: number } = {},
    ) =>
      request<ReportBreakdown>('/reports/by-customer', {
        query: { ...filtersToQuery(filters), sort: filters.sort, limit: filters.limit },
      }),
    byProduct: (filters: ReportFilters & { sort?: BreakdownSort; limit?: number } = {}) =>
      request<ReportBreakdown>('/reports/by-product', {
        query: { ...filtersToQuery(filters), sort: filters.sort, limit: filters.limit },
      }),
    byVariant: (filters: ReportFilters & { sort?: BreakdownSort; limit?: number } = {}) =>
      request<ReportBreakdown>('/reports/by-variant', {
        query: { ...filtersToQuery(filters), sort: filters.sort, limit: filters.limit },
      }),
    byCategory: (
      filters: ReportFilters & { sort?: BreakdownSort; limit?: number } = {},
    ) =>
      request<ReportBreakdown>('/reports/by-category', {
        query: { ...filtersToQuery(filters), sort: filters.sort, limit: filters.limit },
      }),
    byManager: (
      filters: ReportFilters & { sort?: BreakdownSort; limit?: number } = {},
    ) =>
      request<ReportBreakdown>('/reports/by-manager', {
        query: { ...filtersToQuery(filters), sort: filters.sort, limit: filters.limit },
      }),
    movements: (filters: ReportFilters & { page?: number; pageSize?: number } = {}) =>
      request<ReportMovementsResponse>('/reports/movements', {
        query: { ...filtersToQuery(filters), page: filters.page, pageSize: filters.pageSize },
      }),
    deadStock: (params: { days?: number; limit?: number; categoryIds?: string[] } = {}) =>
      request<DeadStockReport>('/reports/dead-stock', {
        query: {
          days: params.days,
          limit: params.limit,
          categoryIds: params.categoryIds,
        },
      }),
  },

  importer: {
    variants: (rows: ImportRow[]) =>
      request<ImportReport>('/import/variants', { method: 'POST', body: { rows } }),
  },

  exporter: {
    inventoryUrl: () => `${API_URL.replace(/\/$/, '')}/export/inventory.csv`,
    movementsUrl: () => `${API_URL.replace(/\/$/, '')}/export/movements.csv`,
    /** Скачивает CSV с авторизацией: создаёт Blob и триггерит download. */
    async download(kind: 'inventory' | 'movements') {
      const path = kind === 'inventory' ? '/export/inventory.csv' : '/export/movements.csv';
      await downloadCsv(path);
    },
    /** Экспорт любого отчёта в CSV — те же фильтры, что и у JSON-эндпоинтов. */
    async report(
      kind: ReportCsvKind,
      params: ReportFilters & { sort?: BreakdownSort; days?: number } = {},
    ) {
      const path = `/reports/${kind}.csv`;
      const query: Record<string, string | string[] | undefined> = {
        ...filtersToQuery(params),
        sort: params.sort,
        days: params.days !== undefined ? String(params.days) : undefined,
      };
      await downloadCsv(path, query);
    },
  },

  audit: {
    listForEntity: (entity: string, entityId: string, limit = 50) =>
      request<AuditLogEntry[]>('/audit', { query: { entity, entityId, limit } }),
  },

  movements: {
    list: (query?: {
      page?: number;
      pageSize?: number;
      variantId?: string;
      type?: MovementType;
      includeReversed?: boolean;
    }) => request<PaginatedResponse<MovementListItem>>('/stock-movements', { query }),
    create: (input: CreateStockMovementInput) =>
      request<MovementListItem>('/stock-movements', { method: 'POST', body: input }),
    batch: (input: CreateMovementBatchInput) =>
      request<MovementListItem[]>('/stock-movements/batch', { method: 'POST', body: input }),
    reverse: (id: string, note?: string) =>
      request<MovementListItem>(`/stock-movements/${id}/reverse`, {
        method: 'POST',
        body: { note },
      }),
  },

  variants: {
    list: (query?: {
      page?: number;
      pageSize?: number;
      search?: string;
      productId?: string;
      categoryId?: string;
    }) => request<PaginatedResponse<Variant>>('/variants', { query }),
    findOne: (id: string) => request<Variant>(`/variants/${id}`),
    create: (input: CreateVariantInput) =>
      request<Variant>('/variants', { method: 'POST', body: input }),
    createWithProduct: (input: CreateProductWithVariantInput) =>
      request<Variant>('/variants/with-product', { method: 'POST', body: input }),
    createWithMatrix: (input: CreateProductWithMatrixInput) =>
      request<{ productId: string; variants: Variant[] }>('/variants/with-matrix', {
        method: 'POST',
        body: input,
      }),
    extendWithMatrix: (input: ExtendProductWithMatrixInput) =>
      request<{ productId: string; variants: Variant[] }>('/variants/extend-matrix', {
        method: 'POST',
        body: input,
      }),
    update: (id: string, input: UpdateVariantInput) =>
      request<Variant>(`/variants/${id}`, { method: 'PATCH', body: input }),
    remove: (id: string, opts?: { cascadeProduct?: boolean }) =>
      request<void>(`/variants/${id}`, {
        method: 'DELETE',
        query: opts?.cascadeProduct ? { cascadeProduct: 'true' } : undefined,
      }),
    lots: (id: string) => request<VariantLot[]>(`/variants/${id}/lots`),
  },

  lots: {
    update: (id: string, input: { unitCost?: number; note?: string | null }) =>
      request<VariantLot>(`/lots/${id}`, { method: 'PATCH', body: input }),
  },
};
