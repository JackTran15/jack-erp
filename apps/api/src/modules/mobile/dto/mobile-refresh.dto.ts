import { RefreshDto } from '../../auth/dto/refresh.dto';

/**
 * Cùng một field với `POST /auth/refresh`, nên **kế thừa thẳng `RefreshDto`**
 * thay vì chép lại — cùng khuôn `MobileLoginDto` ↔ `LoginDto`, và cùng chiều
 * phụ thuộc: `mobile` là facade mỏng trên `auth`.
 *
 * Giữ một class RIÊNG chứ không dùng thẳng `RefreshDto`: tên hiện trong
 * `/docs` là tên class, và hợp đồng của hai route được quyền tách nhau về sau.
 */
export class MobileRefreshDto extends RefreshDto {}
