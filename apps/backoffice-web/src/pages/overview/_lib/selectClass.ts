/**
 * Class dùng chung cho mọi `SingleSelect` của trang Tổng quan.
 *
 * `bg-white` là bắt buộc: `SingleSelect` render `Button variant="outline"` với
 * `bg-background`, mà `--background` của backoffice là #F5F5F5 (xám) chứ không
 * phải trắng — để mặc định thì dropdown xám trên nền panel trắng.
 */
export const OVERVIEW_SELECT_CLASS =
  "h-9 rounded-sm border-[#BDBDBD] bg-white px-2 text-[13px] hover:border-[#9E9E9E] hover:bg-white";
