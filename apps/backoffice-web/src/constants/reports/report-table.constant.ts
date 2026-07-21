export enum ReportTableColumn {
  // === Thời gian ===
  DATE = 'date',
  DATE_CREATED = 'date_created',
  TIME = 'time',
  HOUR = 'hour',

  // === Đơn hàng ===
  ORDER_CODE = 'order_code',
  INVOICE_CODE = 'invoice_code',
  SKU = 'sku',
  PRODUCT_NAME = 'product_name',
  PRODUCT_GROUP = 'product_group',
  PRODUCT_BRAND = 'product_brand',
  PRODUCT_IMAGE = 'product_image',
  UNIT = 'unit',
  LOCATION = 'location',
  LOCATION_CODE = 'location_code',
  QUANTITY = 'quantity',
  QUANTITY_SOLD = 'quantity_sold',

  // === Giá & Doanh thu ===
  UNIT_PRICE = 'unit_price',
  PRICE_BEFORE_DISCOUNT = 'price_before_discount',
  PRICE_AFTER_DISCOUNT = 'price_after_discount',
  REVENUE_TOTAL = 'revenue_total',
  REVENUE_GOODS = 'revenue_goods',
  REVENUE_FEE = 'revenue_fee',
  REVENUE_PROMOTION = 'revenue_promotion',
  REVENUE_DISCOUNT_POINT = 'revenue_discount_point',
  REVENUE_DISCOUNT_RATE = 'revenue_discount_rate',
  NET_REVENUE = 'net_revenue',

  // === Doanh thu sàn TMĐT ===
  PLATFORM_FEE = 'platform_fee',
  PLATFORM_OTHER_INCOME = 'platform_other_income',
  PLATFORM_REVENUE = 'platform_revenue',

  // === Khuyến mại ===
  PROMO_CODE = 'promo_code',
  PROMO_TYPE = 'promo_type',
  PROMO_VALUE = 'promo_value',
  DISCOUNT_POINT = 'discount_point',
  DISCOUNT_RATE = 'discount_rate',

  // === Thanh toán ===
  PAYMENT_CASH = 'payment_cash',
  PAYMENT_ATM = 'payment_atm',
  PAYMENT_TRANSFER = 'payment_transfer',
  PAYMENT_VISA = 'payment_visa',
  PAYMENT_VISA_DEBIT = 'payment_visa_debit',
  PAYMENT_MASTERCARD = 'payment_mastercard',
  PAYMENT_MASTERCARD_DEBIT = 'payment_mastercard_debit',
  PAYMENT_AMEX = 'payment_amex',
  PAYMENT_AMEX_DEBIT = 'payment_amex_debit',
  PAYMENT_JCB = 'payment_jcb',
  PAYMENT_QR_TECHCOMBANK = 'payment_qr_techcombank',
  PAYMENT_QR = 'payment_qr',
  PAYMENT_UNIONPAY = 'payment_unionpay',
  PAYMENT_DINERS = 'payment_diners',
  PAYMENT_DISCOVER = 'payment_discover',
  PAYMENT_VOUCHER = 'payment_voucher',
  PAYMENT_POINT = 'payment_point',
  PAYMENT_DEBT = 'payment_debt',
  PAYMENT_HELPER = 'payment_helper',
  PAYMENT_BANK_ACCOUNT = 'payment_bank_account',
  PAYMENT_BANK_DEPOSIT = 'payment_bank_deposit',
  PAYMENT_COLLECT = 'payment_collect',

  // === Thực thu & Công nợ ===
  NET_RECEIVED = 'net_received',
  DEBT = 'debt',
  DEBT_CUSTOMER = 'debt_customer',
  DEBT_SUPPLIER = 'debt_supplier',

  // === Công nợ (sổ theo kỳ — báo cáo #1 Công nợ khách hàng, #3 Công nợ nhà cung cấp) ===
  DEBT_OPENING = 'debt_opening',
  DEBT_INCREASE = 'debt_increase',
  DEBT_DECREASE = 'debt_decrease',
  DEBT_CLOSING = 'debt_closing',

  // === Công nợ (chi tiết theo chứng từ — báo cáo #2, #4) ===
  DOCUMENT_NUMBER = 'document_number',
  DOCUMENT_TYPE = 'document_type',
  DOCUMENT_DESCRIPTION = 'document_description',
  LINE_TOTAL_AMOUNT = 'line_total_amount',
  LINE_COLLECTED_AMOUNT = 'line_collected_amount',
  LINE_DEBT_INCREASE = 'line_debt_increase',
  LINE_DEBT_DECREASE = 'line_debt_decrease',
  RUNNING_BALANCE = 'running_balance',
  CUMULATIVE_DEBT_INCREASE = 'cumulative_debt_increase',
  CUMULATIVE_DEBT_DECREASE = 'cumulative_debt_decrease',
  DISCOUNT_PERCENT = 'discount_percent',
  DISCOUNT_AMOUNT = 'discount_amount',
  TAX_RATE = 'tax_rate',
  TAX_AMOUNT = 'tax_amount',
  PAYMENT_AMOUNT_TOTAL = 'payment_amount_total',

  // === Khách hàng ===
  CUSTOMER_CODE = 'customer_code',
  CUSTOMER_NAME = 'customer_name',
  CUSTOMER_PHONE = 'customer_phone',
  CUSTOMER_GROUP = 'customer_group',
  CUSTOMER_EMAIL = 'customer_email',
  ADDRESS = 'address',
  MEMBERSHIP_CARD_NUMBER = 'membership_card_number',
  MEMBERSHIP_TIER = 'membership_tier',

  // === Nhân viên & Thu ngân ===
  CASHIER_CODE = 'cashier_code',
  CASHIER_NAME = 'cashier_name',
  EMPLOYEE_CODE = 'employee_code',
  EMPLOYEE_NAME = 'employee_name',
  EMPLOYEE_SALES = 'employee_sales',

  // === Cửa hàng & Kênh ===
  STORE_CODE = 'store_code',
  STORE_NAME = 'store_name',
  CHANNEL = 'channel',
  CHANNEL_NAME = 'channel_name',

  // === Nhà cung cấp ===
  SUPPLIER_CODE = 'supplier_code',
  SUPPLIER_NAME = 'supplier_name',

  // === Trạng thái & Ghi chú ===
  STATUS = 'status',
  NOTE = 'note',
  NOTE_ORDER = 'note_order',
  NOTE_PRODUCT = 'note_product',

  // === Khác ===
  REFERENCE_CODE = 'reference_code',
  CREATED_BY = 'created_by',
  RECEIVER_NAME = 'receiver_name',

  // === Lợi nhuận (báo cáo #1 profit-by-item, #2 gross-profit-by-invoice) ===
  PRODUCT_GROUP_CODE = 'product_group_code',
  COST_OF_GOODS = 'cost_of_goods',
  GROSS_PROFIT = 'gross_profit',
  PROFIT_PER_UNIT = 'profit_per_unit',
  MARGIN_ON_REVENUE = 'margin_on_revenue',
  MARGIN_ON_COST = 'margin_on_cost',
  GROSS_GOODS_TOTAL = 'gross_goods_total',

  // === Lợi nhuận — Kết quả kinh doanh (#3, dòng "Khoản mục" cố định) ===
  LINE_ITEM_LABEL = 'line_item_label',
  PERIOD_PREVIOUS = 'period_previous',
  PERIOD_CURRENT = 'period_current',
  PERIOD_CHANGE_PERCENT = 'period_change_percent',
  PERIOD_CHANGE_AMOUNT = 'period_change_amount',
}

export enum ReportTableColumnGroup {
  // === Doanh thu & Lợi nhuận ===
  REVENUE = 'Doanh thu',
  REVENUE_DETAIL = 'Chi tiết doanh thu',
  REVENUE_TMDT = 'Doanh thu sàn TMĐT',
  NET_REVENUE = 'Thực thu',
  PROFIT = 'Lợi nhuận',

  // === Thanh toán ===
  CUSTOMER_PAYMENT = 'Khách hàng thanh toán',
  PAYMENT_METHOD = 'Phương thức thanh toán',

  // === Thu ngân & Nhân viên ===
  CASHIER = 'Thu ngân',
  EMPLOYEE = 'Nhân viên',

  // === Đơn hàng & Giao dịch ===
  ORDER = 'Đơn hàng',
  ORDER_DETAIL = 'Chi tiết đơn hàng',

  // === Sản phẩm & Kho ===
  PRODUCT = 'Sản phẩm',
  INVENTORY = 'Tồn kho',

  // === Khách hàng ===
  CUSTOMER = 'Khách hàng',
  CUSTOMER_DEBT = 'Công nợ khách hàng',

  // === Cửa hàng & Kênh ===
  STORE = 'Cửa hàng',
  CHANNEL = 'Kênh bán hàng',

  // === Khuyến mại ===
  PROMOTION = 'Khuyến mại',

  // === Thời gian ===
  TIME = 'Thời gian',
}

export const ReportTableColumnLabel = {
  [ReportTableColumn.DATE]: 'Ngày',
  [ReportTableColumn.DATE_CREATED]: 'Ngày tạo',
  [ReportTableColumn.TIME]: 'Thời gian',
  [ReportTableColumn.HOUR]: 'Giờ',

  [ReportTableColumn.ORDER_CODE]: 'Mã đơn hàng',
  [ReportTableColumn.INVOICE_CODE]: 'Mã hóa đơn',
  [ReportTableColumn.SKU]: 'SKU',
  [ReportTableColumn.PRODUCT_NAME]: 'Tên sản phẩm',
  [ReportTableColumn.PRODUCT_GROUP]: 'Nhóm sản phẩm',
  [ReportTableColumn.PRODUCT_BRAND]: 'Thương hiệu',
  [ReportTableColumn.PRODUCT_IMAGE]: 'Ảnh sản phẩm',
  [ReportTableColumn.UNIT]: 'Đơn vị',
  [ReportTableColumn.LOCATION]: 'Vị trí',
  [ReportTableColumn.LOCATION_CODE]: 'Mã vị trí',
  [ReportTableColumn.QUANTITY]: 'Số lượng',
  [ReportTableColumn.QUANTITY_SOLD]: 'Số lượng bán',

  [ReportTableColumn.UNIT_PRICE]: 'Đơn giá',
  [ReportTableColumn.PRICE_BEFORE_DISCOUNT]: 'Giá trước giảm',
  [ReportTableColumn.PRICE_AFTER_DISCOUNT]: 'Giá sau giảm',
  [ReportTableColumn.REVENUE_TOTAL]: 'Tổng doanh thu',
  [ReportTableColumn.REVENUE_GOODS]: 'Doanh thu hàng hóa',
  [ReportTableColumn.REVENUE_FEE]: 'Doanh thu phí',
  [ReportTableColumn.REVENUE_PROMOTION]: 'Doanh thu khuyến mại',
  [ReportTableColumn.REVENUE_DISCOUNT_POINT]: 'Doanh thu điểm KM',
  [ReportTableColumn.REVENUE_DISCOUNT_RATE]: 'Tỷ lệ KM (%)',
  [ReportTableColumn.NET_REVENUE]: 'Thực thu',

  [ReportTableColumn.PLATFORM_FEE]: 'Phí trả sàn',
  [ReportTableColumn.PLATFORM_OTHER_INCOME]: 'Thu khác từ sàn',
  [ReportTableColumn.PLATFORM_REVENUE]: 'Doanh thu từ sàn',

  [ReportTableColumn.PROMO_CODE]: 'Mã khuyến mại',
  [ReportTableColumn.PROMO_TYPE]: 'Loại khuyến mại',
  [ReportTableColumn.PROMO_VALUE]: 'Giá trị khuyến mại',
  [ReportTableColumn.DISCOUNT_POINT]: 'Điểm KM',
  [ReportTableColumn.DISCOUNT_RATE]: 'Tỷ lệ KM (%)',

  [ReportTableColumn.PAYMENT_CASH]: 'Tiền mặt',
  [ReportTableColumn.PAYMENT_ATM]: 'ATM',
  [ReportTableColumn.PAYMENT_TRANSFER]: 'Chuyển khoản',
  [ReportTableColumn.PAYMENT_VISA]: 'Visa',
  [ReportTableColumn.PAYMENT_VISA_DEBIT]: 'Visa debit',
  [ReportTableColumn.PAYMENT_MASTERCARD]: 'Mastercard',
  [ReportTableColumn.PAYMENT_MASTERCARD_DEBIT]: 'Mastercard debit',
  [ReportTableColumn.PAYMENT_AMEX]: 'Amex',
  [ReportTableColumn.PAYMENT_AMEX_DEBIT]: 'Amex debit',
  [ReportTableColumn.PAYMENT_JCB]: 'JCB',
  [ReportTableColumn.PAYMENT_QR_TECHCOMBANK]: 'QR Techcombank',
  [ReportTableColumn.PAYMENT_QR]: 'QR',
  [ReportTableColumn.PAYMENT_UNIONPAY]: 'UnionPay',
  [ReportTableColumn.PAYMENT_DINERS]: 'Diners',
  [ReportTableColumn.PAYMENT_DISCOVER]: 'Discover',
  [ReportTableColumn.PAYMENT_VOUCHER]: 'Voucher',
  [ReportTableColumn.PAYMENT_POINT]: 'Điểm',
  [ReportTableColumn.PAYMENT_DEBT]: 'Công nợ',
  [ReportTableColumn.PAYMENT_HELPER]: 'Trợ giúp',
  [ReportTableColumn.PAYMENT_BANK_ACCOUNT]: 'Tài khoản ngân hàng',
  [ReportTableColumn.PAYMENT_BANK_DEPOSIT]: 'Tiền gửi NH',
  [ReportTableColumn.PAYMENT_COLLECT]: 'Thu hộ',

  [ReportTableColumn.NET_RECEIVED]: 'Thực thu',
  [ReportTableColumn.DEBT]: 'Công nợ',
  [ReportTableColumn.DEBT_CUSTOMER]: 'Công nợ khách hàng',
  [ReportTableColumn.DEBT_SUPPLIER]: 'Công nợ nhà cung cấp',

  [ReportTableColumn.DEBT_OPENING]: 'Nợ đầu kỳ',
  [ReportTableColumn.DEBT_INCREASE]: 'Tăng trong kỳ',
  [ReportTableColumn.DEBT_DECREASE]: 'Giảm trong kỳ',
  [ReportTableColumn.DEBT_CLOSING]: 'Nợ cuối kỳ',

  [ReportTableColumn.DOCUMENT_NUMBER]: 'Số chứng từ',
  [ReportTableColumn.DOCUMENT_TYPE]: 'Loại chứng từ',
  [ReportTableColumn.DOCUMENT_DESCRIPTION]: 'Diễn giải',
  [ReportTableColumn.LINE_TOTAL_AMOUNT]: 'Thành tiền',
  [ReportTableColumn.LINE_COLLECTED_AMOUNT]: 'Đã thu',
  [ReportTableColumn.LINE_DEBT_INCREASE]: 'Nợ tăng',
  [ReportTableColumn.LINE_DEBT_DECREASE]: 'Nợ giảm',
  [ReportTableColumn.RUNNING_BALANCE]: 'Số dư cuối kỳ',
  [ReportTableColumn.CUMULATIVE_DEBT_INCREASE]: 'Công nợ tăng trong kỳ',
  [ReportTableColumn.CUMULATIVE_DEBT_DECREASE]: 'Công nợ giảm trong kỳ',
  [ReportTableColumn.DISCOUNT_PERCENT]: '% CK',
  [ReportTableColumn.DISCOUNT_AMOUNT]: 'Tiền CK',
  [ReportTableColumn.TAX_RATE]: 'Thuế suất',
  [ReportTableColumn.TAX_AMOUNT]: 'Tiền thuế',
  [ReportTableColumn.PAYMENT_AMOUNT_TOTAL]: 'Tiền thanh toán',

  [ReportTableColumn.CUSTOMER_CODE]: 'Mã khách hàng',
  [ReportTableColumn.CUSTOMER_NAME]: 'Tên khách hàng',
  [ReportTableColumn.CUSTOMER_PHONE]: 'Số điện thoại khách hàng',
  [ReportTableColumn.CUSTOMER_GROUP]: 'Nhóm khách hàng',
  [ReportTableColumn.CUSTOMER_EMAIL]: 'Email',
  [ReportTableColumn.ADDRESS]: 'Địa chỉ',
  [ReportTableColumn.MEMBERSHIP_CARD_NUMBER]: 'Mã thẻ thành viên',
  [ReportTableColumn.MEMBERSHIP_TIER]: 'Hạng thẻ',

  [ReportTableColumn.CASHIER_CODE]: 'Mã thu ngân',
  [ReportTableColumn.CASHIER_NAME]: 'Tên thu ngân',
  [ReportTableColumn.EMPLOYEE_CODE]: 'Mã nhân viên',
  [ReportTableColumn.EMPLOYEE_NAME]: 'Tên nhân viên',
  [ReportTableColumn.EMPLOYEE_SALES]: 'Doanh số nhân viên',

  [ReportTableColumn.STORE_CODE]: 'Mã cửa hàng',
  [ReportTableColumn.STORE_NAME]: 'Tên cửa hàng',
  [ReportTableColumn.CHANNEL]: 'Kênh',
  [ReportTableColumn.CHANNEL_NAME]: 'Tên kênh',

  [ReportTableColumn.SUPPLIER_CODE]: 'Mã nhà cung cấp',
  [ReportTableColumn.SUPPLIER_NAME]: 'Tên nhà cung cấp',

  [ReportTableColumn.STATUS]: 'Trạng thái',
  [ReportTableColumn.NOTE]: 'Ghi chú',
  [ReportTableColumn.NOTE_ORDER]: 'Ghi chú đơn hàng',
  [ReportTableColumn.NOTE_PRODUCT]: 'Ghi chú sản phẩm',

  [ReportTableColumn.REFERENCE_CODE]: 'Mã tham chiếu',
  [ReportTableColumn.CREATED_BY]: 'Người tạo',
  [ReportTableColumn.RECEIVER_NAME]: 'Tên người nhận',

  [ReportTableColumn.PRODUCT_GROUP_CODE]: 'Mã nhóm hàng hóa',
  [ReportTableColumn.COST_OF_GOODS]: 'Giá vốn (GV)',
  [ReportTableColumn.GROSS_PROFIT]: 'Lợi nhuận (LN)',
  [ReportTableColumn.PROFIT_PER_UNIT]: 'Lợi nhuận đơn vị',
  [ReportTableColumn.MARGIN_ON_REVENUE]: 'Tỷ lệ LN/DT',
  [ReportTableColumn.MARGIN_ON_COST]: 'Tỷ lệ LN/GV',
  [ReportTableColumn.GROSS_GOODS_TOTAL]: 'Tổng tiền hàng',

  [ReportTableColumn.LINE_ITEM_LABEL]: 'Khoản mục',
  [ReportTableColumn.PERIOD_PREVIOUS]: 'Kỳ trước',
  [ReportTableColumn.PERIOD_CURRENT]: 'Kỳ hiện tại',
  [ReportTableColumn.PERIOD_CHANGE_PERCENT]: 'Thay đổi (%)',
  [ReportTableColumn.PERIOD_CHANGE_AMOUNT]: 'Thay đổi (Số tiền)',
};