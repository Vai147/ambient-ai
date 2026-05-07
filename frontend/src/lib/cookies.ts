const TOKEN_KEY = "amb_token";

export function getToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${TOKEN_KEY}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setToken(token: string): void {
  const maxAge = 60 * 60 * 8; // 8 hours — matches JWT expiry
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Strict`;
}

export function clearToken(): void {
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Strict`;
}
