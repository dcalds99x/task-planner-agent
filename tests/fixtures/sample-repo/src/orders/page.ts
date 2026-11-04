import type { Session } from '../auth.js';
import { listOrders } from './api.js';
import type { OrderFilters } from './types.js';

export function loadOrdersPage(filters: OrderFilters, session: Session) {
  try {
    const result = listOrders(filters, session);
    return { state: result.items.length ? 'ready' : 'empty', filters, ...result };
  } catch {
    return { state: 'error', message: 'Could not load orders.', filters };
  }
}
