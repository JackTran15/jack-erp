export interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: { id: string; name: string }[];
}
