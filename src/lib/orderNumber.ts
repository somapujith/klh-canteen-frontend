/**
 * The single rendering of an order number, used by students, guests, and the
 * kitchen board alike.
 *
 * Padding, never truncation: the board used to show `orderNumber % 1000`, so an
 * order the student was told was 1676 called out as 676 at the counter. Anything
 * that shortens the number can collide with another order and cannot be matched
 * back to the one the customer is holding.
 */
export function formatOrderNumber(orderNumber: number): string {
  return String(orderNumber).padStart(4, "0");
}
