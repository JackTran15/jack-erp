export interface TempWarehouseApiErrorBody {
  statusCode?: number;
  code?: string;
  message?: string;
}

export class TempWarehouseApiError extends Error {
  readonly statusCode: number;
  readonly code: string | undefined;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.name = "TempWarehouseApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function parseTempWarehouseApiError(
  body: string,
  statusCode: number,
): TempWarehouseApiError {
  try {
    const parsed = JSON.parse(body) as TempWarehouseApiErrorBody;
    const message =
      typeof parsed.message === "string" && parsed.message.trim()
        ? parsed.message
        : `HTTP ${statusCode}`;
    return new TempWarehouseApiError(message, statusCode, parsed.code);
  } catch {
    return new TempWarehouseApiError(
      body.trim() || `HTTP ${statusCode}`,
      statusCode,
    );
  }
}

const TEMP_WAREHOUSE_ERROR_MESSAGES: Record<string, string> = {
  TEMP_WAREHOUSE_LINES_NOT_FOUND_IN_SESSION:
    "Một hoặc nhiều dòng không còn trong phiên. Vui lòng làm mới danh sách.",
  TEMP_WAREHOUSE_LINES_NOT_TRANSFERABLE:
    "Một hoặc nhiều dòng đã chuyển hoặc không còn trạng thái hoạt động. Vui lòng làm mới danh sách.",
  TEMP_WAREHOUSE_SESSION_CLOSED:
    "Phiên kho tạm đã đóng — không thể chuyển kho từng phần.",
  TEMP_WAREHOUSE_SESSION_NOT_FOUND: "Không tìm thấy phiên kho tạm.",
};

export function getTempWarehouseErrorMessage(
  code: string | undefined,
  fallback: string,
): string {
  if (code && TEMP_WAREHOUSE_ERROR_MESSAGES[code]) {
    return TEMP_WAREHOUSE_ERROR_MESSAGES[code];
  }
  return fallback;
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof TempWarehouseApiError) {
    return getTempWarehouseErrorMessage(err.code, err.message);
  }
  if (err instanceof Error) return err.message;
  return "Đã có lỗi xảy ra. Vui lòng thử lại.";
}
