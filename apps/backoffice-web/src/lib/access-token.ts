let token: string | null = null;

export function getAccessToken(): string | null {
  return token;
}

export function setAccessToken(value: string | null): void {
  token = value;
}

export function clearAccessToken(): void {
  token = null;
}
