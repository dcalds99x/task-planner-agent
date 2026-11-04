import { requirePermission, type Session } from '../auth.js';
import type { Order, OrderFilters, OrderStatus } from './types.js';

const orders: Order[] = [
  { id: 'order-1', customerEmail: 'alex@example.test', status: 'paid', total: 42 },
  { id: 'order-2', customerEmail: 'sam@example.test', status: 'pending', total: 12 },
];

export function listOrders(filters: OrderFilters, session: Session) {
  requirePermission(session, 'orders:read');
  const filtered = orders.filter(order =>
    (!filters.status || order.status === filters.status) &&
    (!filters.search || order.customerEmail.includes(filters.search)),
  );
  const offset = (filters.page - 1) * filters.pageSize;
  return { items: filtered.slice(offset, offset + filters.pageSize), total: filtered.length };
}

export function updateOrderStatus(id: string, status: OrderStatus, session: Session): Order {
  requirePermission(session, 'orders:write');
  const order = orders.find(candidate => candidate.id === id);
  if (!order) throw new Error('Order not found');
  order.status = status;
  return order;
}
