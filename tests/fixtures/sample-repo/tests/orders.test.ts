import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listOrders } from '../src/orders/api.js';

test('filters are applied before pagination', () => {
  const result = listOrders({ status: 'paid', page: 1, pageSize: 10 }, { permissions: ['orders:read'] });
  assert.equal(result.total, 1);
  assert.equal(result.items[0]?.status, 'paid');
});

test('read permission is required', () => {
  assert.throws(() => listOrders({ page: 1, pageSize: 10 }, { permissions: [] }), /Forbidden/);
});
