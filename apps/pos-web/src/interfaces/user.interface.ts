export interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: { id: string; name: string }[];
  /** Khóa quyền đã resolve (vd `pos.invoice.cancel`) — dùng để gate UI. */
  permissions: string[];
}
