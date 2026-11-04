# Orders Fixture

Illustrative application: `src/orders/page.ts` receives filters and a session,
checks `orders:read`, and calls `src/orders/api.ts`. The API filters before
paginating. The service checks permissions; the interface is not the only guard.

There is no CSV exporter, email infrastructure, queue, or performance metrics in
this fixture. Status changes are synchronous. No latency target has been defined.
