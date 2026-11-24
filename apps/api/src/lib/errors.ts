export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Chưa đăng nhập hoặc phiên đã hết hạn') =>
  new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Bạn không có quyền thực hiện thao tác này') =>
  new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Không tìm thấy dữ liệu') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'CONFLICT', message, details);
