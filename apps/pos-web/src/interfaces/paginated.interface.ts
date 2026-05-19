/**
 * Response phân trang chuẩn của BE NestJS CRUD: `{ data, total, page, pageSize }`.
 */
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
