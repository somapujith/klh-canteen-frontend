export type Role = "STUDENT" | "ADMIN" | "SUPERADMIN";
export type Kitchen = "SNACKS" | "MEALS";

export interface AdminUser {
  id: string;
  role: Role;
  rollNumber: string | null;
  email: string;
  name: string;
  kitchen: Kitchen | null;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actor: { id: string; name: string; email: string; role: Role };
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface MenuItem {
  id: string;
  name: string;
  imageUrl: string;
  price: string;
  stockQty: number;
  categoryId: string;
  isAvailable: boolean;
}

export interface Category {
  id: string;
  name: string;
  items: MenuItem[];
}

export interface OrderLineItem {
  menuItem: { id: string; name: string };
  quantity: number;
  priceAtOrder: string;
}

export interface AdminOrder {
  id: string;
  orderNumber: number;
  status: "PENDING" | "DELIVERED";
  totalAmount: string;
  createdAt: string;
  student: { name: string; rollNumber: string; email?: string };
  items: OrderLineItem[];
}
