import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { slugPrefix } from '../../inventory/product/variant-generation.service';
import {
  MobileProductAttributeDto,
  MobileProductAttributeValueDto,
} from '../dto/mobile-product-attribute.response.dto';

interface AttributeRow {
  name: string;
  label: string;
  codeSuffix: string | null;
}

/**
 * Các chiều thuộc tính của CẢ DANH MỤC — nguồn của hai hàng chip lọc Màu
 * sắc / Size ở màn Bán hàng.
 *
 * ## Vì sao KHÔNG dùng `GET /products/:productId/attributes`
 *
 * Đường đó trả thuộc tính của MỘT mẫu mã, và nó đúng cho màn sửa mẫu mã. Panel
 * lọc thì hỏi một câu khác hẳn: *"cả cửa hàng có những màu nào, size nào?"* —
 * để trả lời bằng đường kia, app phải gọi nó một lượt cho MỖI mẫu mã của danh
 * mục rồi tự gộp. Hàng trăm lượt gọi cho một hàng chip.
 *
 * ## Gộp theo TÊN, không theo `definition.id`
 *
 * `product_attribute_definitions` gắn với từng `product_id`, nên mỗi mẫu mã có
 * bản `Màu sắc` riêng của nó. Gộp theo id thì hàng chip có năm mươi chiều
 * *"Màu sắc"* trùng tên. Gộp theo TÊN cho đúng cái người dùng nghĩ là một
 * chiều.
 *
 * Cái giá đã biết: hai mẫu mã dùng cùng tên chiều cho hai ý nghĩa khác nhau sẽ
 * bị trộn. Trong dữ liệu thật thì `Màu sắc` và `Size` là từ vựng dùng chung
 * toàn danh mục, nên ca đó chưa tồn tại — và nếu có, nó là vấn đề của dữ liệu
 * chứ không phải của truy vấn này.
 */
@Injectable()
export class MobileProductAttributeService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(actor: ActorContext): Promise<MobileProductAttributeDto[]> {
    const rows: AttributeRow[] = await this.dataSource.query(
      // `DISTINCT ON` chứ không `GROUP BY`: hai mẫu mã có thể khai cùng
      // (tên chiều, nhãn) với hai `code_suffix` khác nhau, và `GROUP BY` khi đó
      // bắt phải chọn một hàm gộp cho `code_suffix` — tức chọn bừa mà trông như
      // một phép tính. `DISTINCT ON` nói thẳng là lấy hàng ĐẦU theo thứ tự đã
      // khai, và thứ tự đó là thứ tự hiển thị đã cấu hình.
      `SELECT DISTINCT ON (d.name, o.value_label)
              d.name        AS "name",
              o.value_label AS "label",
              o.code_suffix AS "codeSuffix"
       FROM product_attribute_definitions d
       JOIN product_attribute_options o ON o.attribute_definition_id = d.id
       JOIN products p ON p.id = d.product_id
       WHERE p.organization_id = $1
       ORDER BY d.name ASC, o.value_label ASC, d.sort_order ASC, o.sort_order ASC`,
      [actor.organizationId],
    );

    // `Map` của JS giữ thứ tự chèn, nên duyệt một lượt là đủ — không sắp lại ở
    // đây. Sắp bằng `sort()` sẽ xếp `S, M, L` theo bảng chữ cái, đúng cái bẫy
    // mà `MobileSalesItemService.getModel` đã phải khai.
    const grouped = new Map<string, MobileProductAttributeValueDto[]>();

    for (const row of rows) {
      const bucket = grouped.get(row.name);
      // Hậu tố THỰC SỰ dùng, không phải giá trị thô của cột.
      //
      // `VariantGenerationService` ghép mã bằng `codeSuffix || slugPrefix(label)`
      // — và trong dữ liệu thật của tổ chức này, `code_suffix` RỖNG ở **toàn
      // bộ** hàng (đo 2026-09-11: 4092 biến thể màu `D`, không hàng nào có hậu
      // tố khai tường minh). Trả thẳng cột đó ra thì app nhận `null` cho mọi
      // giá trị, bỏ hết khỏi chip, và bộ lọc màu/size biến mất — đúng cái đã
      // xảy ra ở lượt e2e đầu tiên của T-10-13.
      //
      // Gọi CHÍNH hàm sinh mã chứ không chép lại luật: một bản sao thứ hai là
      // hai bên phân kỳ và bộ lọc lặng lẽ rỗng, đúng kiểu hỏng không ai thấy.
      const value = { label: row.label, codeSuffix: row.codeSuffix || slugPrefix(row.label) };

      if (bucket) {
        bucket.push(value);
      } else {
        grouped.set(row.name, [value]);
      }
    }

    return [...grouped].map(([name, values]) => ({ name, values }));
  }
}
