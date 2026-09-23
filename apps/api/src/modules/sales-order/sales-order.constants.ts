/**
 * Hằng số của **cửa ghi cho đối tác** (`POST /v2/partner/orders`).
 *
 * Để ở một file riêng vì quyền dưới đây là ranh giới an ninh, không phải một
 * chuỗi tiện tay: gõ lại nó ở từng call site là cách im lặng nhất để nới hoặc
 * làm hỏng ranh giới đó.
 */

/**
 * Quyền DUY NHẤT mà đường đặt đơn của đối tác đòi.
 *
 * Cấp RIÊNG, **không** dùng lại `partner.catalog.read`: một key chỉ để website
 * đọc catalog thì không được phép đặt đơn. Hai quyền tách nhau nên thu hồi
 * quyền đặt đơn không làm sập trang danh mục, và ngược lại.
 */
export const PARTNER_ORDER_PERMISSION = 'partner.order.create';

/**
 * Mã lỗi 400 khi `provinceCode`/`wardCode` đối tác gửi không có trong `geo_*`.
 *
 * Là 400 chứ không phải 404: sai nằm ở payload đối tác gửi, không phải ở một
 * tài nguyên họ hỏi. `GeoService` ném `NotFoundException` cho đường đọc `/geo/*`
 * của nó — đường partner phải đổi sang mã này, đừng để 404 lọt ra ngoài.
 */
export const GEO_CODE_UNKNOWN = 'GEO_CODE_UNKNOWN';

/**
 * Mã lỗi 403 khi API key không có kênh bán dùng được: không gắn kênh nào, kênh
 * không tồn tại, kênh thuộc tổ chức khác, hoặc kênh `is_active = false`.
 *
 * Một mã cho cả bốn là **chủ đích**: tách chúng ra là cho đối tác dò xem id
 * kênh nào có thật trong hệ thống.
 *
 * `sales-order.service.ts` giữ một bản sao private cùng tên cho nhánh
 * `is_active = false` (T-01-04, đã đóng — không sửa ở ticket này). Hai bản phải
 * trùng chuỗi; đây là nơi khai báo.
 */
export const CHANNEL_INACTIVE = 'CHANNEL_INACTIVE';
