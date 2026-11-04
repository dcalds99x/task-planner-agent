export type OrderStatus = 'pending' | 'paid' | 'shipped';
export interface Order { id: string; customerEmail: string; status: OrderStatus; total: number }
export interface OrderFilters { status?: OrderStatus; search?: string; page: number; pageSize: number }
