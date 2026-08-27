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
  /** Soft-deactivation flag. Inactive accounts keep their order history but cannot log in. */
  isActive: boolean;
  mustChangePassword: boolean;
  /** Tokens issued before this instant are rejected — set when an account is deactivated. */
  tokensValidFrom: string | null;
}

/** `?format=envelope` shape for cursor-paginated superadmin list endpoints. */
export interface Paginated<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

/** Why an account was left untouched by a (de)activation call. */
export type ActivationSkipReason = "protected_account" | "self" | "not_found";

export interface ActivationSkip {
  id?: string;
  email?: string;
  reason: ActivationSkipReason | (string & {});
}

export interface ActivationChangedUser {
  id: string;
  email: string;
  rollNumber: string | null;
  name: string;
}

/** Response of every deactivate/reactivate endpoint, single and bulk. */
export interface ActivationResult {
  active: boolean;
  requested: number;
  changed: number;
  tokensValidFrom: string | null;
  changedUsers?: ActivationChangedUser[];
  skipped: ActivationSkip[];
}

/** One intake, derived from the leading digits of student roll numbers. */
export interface Cohort {
  intake: string;
  total: number;
  active: number;
  inactive: number;
  rollNumberMin: string;
  rollNumberMax: string;
}

export interface CohortSampleUser {
  id: string;
  name: string;
  rollNumber: string;
  email: string;
}

/** Protected accounts are reported by identity, not id — they are never touched by a cohort promote. */
export interface CohortProtectedSkip {
  rollNumber: string | null;
  email: string;
}

export interface CohortPreview {
  prefix: string;
  dryRun: boolean;
  matched: number;
  wouldDeactivate: number;
  alreadyInactive: number;
  protectedSkipped: CohortProtectedSkip[];
  rollNumberRange: { first: string; last: string } | null;
  sample: CohortSampleUser[];
  sampleTruncated: boolean;
}

export interface CohortPromoteResult extends CohortPreview {
  applied: boolean;
  changed: number;
  tokensValidFrom: string | null;
  changedUsers?: ActivationChangedUser[];
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
  /**
   * Legacy pasted link, kept only for items created before uploads existed.
   * Null for anything added since. New images go through `imageHash`; nothing
   * in the UI writes this field any more.
   */
  imageUrl: string | null;
  /**
   * Content address of the image stored in Postgres. Present once a file has
   * been uploaded for this item, and it CHANGES on every upload — which is what
   * makes `/menu/items/:id/image/:hash` safe to cache forever: a new picture is
   * a new URL, so no cache anywhere has to be invalidated.
   *
   * Always resolve through `menuImageSrc()` rather than reading either field
   * directly — the fallback order lives there, once.
   */
  imageHash: string | null;
  price: string;
  stockQty: number;
  categoryId: string;
  isAvailable: boolean;
}

export interface Category {
  id: string;
  name: string;
  /**
   * Position on the menu, ascending. The API defaults it to 0, so seeded
   * categories can all share a value — anything reordering them must renumber
   * densely rather than swap two numbers inside a set of duplicates.
   */
  sortOrder: number;
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
