/**
 * Where each role goes when it has not asked for a particular page — after
 * login, and when hitting "/".
 *
 * Staff land on the order board, not the dashboard: the board is what the
 * counter is actually staffed to watch, and every shift began with the same
 * extra click away from a dashboard nobody was reading.
 */
export function landingPathFor(role: string | null): string {
  switch (role) {
    case "ADMIN":
    case "SUPERADMIN":
      return "/admin/board";
    case "STUDENT":
      return "/student";
    default:
      return "/login";
  }
}
