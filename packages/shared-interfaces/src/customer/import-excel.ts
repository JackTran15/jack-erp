/** Canonical Excel column keys (row 2) for MISA-style customer import/export. */
export enum CustomerImportExcelField {
  CUSTOMER_CODE = 'CustomerCode',
  CUSTOMER_NAME = 'CustomerName',
  CUSTOMER_CATEGORY_CODE = 'CustomerCategoryCode',
  TEL = 'Tel',
  MAXIMUM_DEBT_AMOUNT = 'MaximumDebtAmount',
  DUE_DATE = 'DueDate',
  BIRTHDAY = 'Birthday',
  GENDER = 'Gender',
  MEMBER_CARD_NO = 'MemberCardNo',
  MEMBER_LEVEL_CODE = 'MemberLevelCode',
  IDENTIFY_NUMBER = 'IdentifyNumber',
  EXPORT_PROVINCE = 'ExportProvince',
  EXPORT_DISTRICT = 'ExportDistrict',
  EXPORT_VILLAGE = 'ExportVillage',
  ADDRESS = 'Address',
  EMAIL = 'Email',
  COMPANY_NAME = 'CompanyName',
  COMPANY_TAX_CODE = 'CompanyTaxCode',
  DESCRIPTION = 'Description',
  EMPLOYEE_CODE = 'EmployeeCode',
  EMPLOYEE_NAME = 'EmployeeName',
}

export const CUSTOMER_IMPORT_EXCEL_FIELD_LABELS: Record<
  CustomerImportExcelField,
  string
> = {
  [CustomerImportExcelField.CUSTOMER_CODE]: 'Mã khách hàng',
  [CustomerImportExcelField.CUSTOMER_NAME]: 'Tên khách hàng (*)',
  [CustomerImportExcelField.CUSTOMER_CATEGORY_CODE]: 'Nhóm khách hàng',
  [CustomerImportExcelField.TEL]: 'Điện thoại (*)',
  [CustomerImportExcelField.MAXIMUM_DEBT_AMOUNT]: 'Số nợ tối đa',
  [CustomerImportExcelField.DUE_DATE]: 'Hạn nợ (ngày)',
  [CustomerImportExcelField.BIRTHDAY]: 'Ngày sinh',
  [CustomerImportExcelField.GENDER]: 'Giới tính',
  [CustomerImportExcelField.MEMBER_CARD_NO]: 'Mã thẻ thành viên',
  [CustomerImportExcelField.MEMBER_LEVEL_CODE]: 'Hạng thẻ',
  [CustomerImportExcelField.IDENTIFY_NUMBER]: 'Số CMND/Hộ chiếu',
  [CustomerImportExcelField.EXPORT_PROVINCE]: 'Tỉnh thành',
  [CustomerImportExcelField.EXPORT_DISTRICT]: 'Quận/Huyện',
  [CustomerImportExcelField.EXPORT_VILLAGE]: 'Phường/Xã',
  [CustomerImportExcelField.ADDRESS]: 'Số nhà, đường phố',
  [CustomerImportExcelField.EMAIL]: 'Email',
  [CustomerImportExcelField.COMPANY_NAME]: 'Tên công ty',
  [CustomerImportExcelField.COMPANY_TAX_CODE]: 'Mã số thuế',
  [CustomerImportExcelField.DESCRIPTION]: 'Ghi chú',
  [CustomerImportExcelField.EMPLOYEE_CODE]: 'Mã nhân viên phụ trách',
  [CustomerImportExcelField.EMPLOYEE_NAME]: 'Tên nhân viên phụ trách',
};

/** Full MISA template column order (21 fields). */
export const CUSTOMER_IMPORT_EXCEL_COLUMN_ORDER: CustomerImportExcelField[] = [
  CustomerImportExcelField.CUSTOMER_CODE,
  CustomerImportExcelField.CUSTOMER_NAME,
  CustomerImportExcelField.CUSTOMER_CATEGORY_CODE,
  CustomerImportExcelField.TEL,
  CustomerImportExcelField.MAXIMUM_DEBT_AMOUNT,
  CustomerImportExcelField.DUE_DATE,
  CustomerImportExcelField.BIRTHDAY,
  CustomerImportExcelField.GENDER,
  CustomerImportExcelField.MEMBER_CARD_NO,
  CustomerImportExcelField.MEMBER_LEVEL_CODE,
  CustomerImportExcelField.IDENTIFY_NUMBER,
  CustomerImportExcelField.EXPORT_PROVINCE,
  CustomerImportExcelField.EXPORT_DISTRICT,
  CustomerImportExcelField.EXPORT_VILLAGE,
  CustomerImportExcelField.ADDRESS,
  CustomerImportExcelField.EMAIL,
  CustomerImportExcelField.COMPANY_NAME,
  CustomerImportExcelField.COMPANY_TAX_CODE,
  CustomerImportExcelField.DESCRIPTION,
  CustomerImportExcelField.EMPLOYEE_CODE,
  CustomerImportExcelField.EMPLOYEE_NAME,
];

/** MISA template file version row (sheet 1, row 1). */
export const CUSTOMER_IMPORT_EXCEL_TEMPLATE_VERSION = 'MS_007';

export interface CustomerImportExcelColumn {
  key: CustomerImportExcelField;
  label: string;
}

/** Column order + Vietnamese labels for Excel export/template workbooks. */
export const CUSTOMER_IMPORT_EXCEL_COLUMNS: CustomerImportExcelColumn[] =
  CUSTOMER_IMPORT_EXCEL_COLUMN_ORDER.map((key) => ({
    key,
    label: CUSTOMER_IMPORT_EXCEL_FIELD_LABELS[key],
  }));

export type CustomerImportExcelRow = Record<string, string>;
