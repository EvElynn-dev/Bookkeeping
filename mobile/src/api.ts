const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

type RequestOptions = RequestInit & { token?: string };

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, headers, ...rest } = options;
  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail ?? '请求失败');
  }
  return payload as T;
}

export type AuthResponse = { token: string; user: { id: string; email: string; name: string } };
export type Book = {
  id: string;
  name: string;
  invite_code: string;
  members: { id: string; email: string; name: string }[];
};

export type BalanceEntry = {
  id: string;
  name: string;
  paid_fen: number;
  owed_fen: number;
  net_fen: number;
};

export const api = {
  register: (email: string, password: string, name: string) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  createBook: (token: string, name: string) =>
    request<Book>('/books', {
      method: 'POST',
      token,
      body: JSON.stringify({ name }),
    }),
  listBooks: (token: string) => request<Book[]>('/books', { token }),
  joinBook: (token: string, code: string) =>
    request<Book>('/books/join', {
      method: 'POST',
      token,
      body: JSON.stringify({ code }),
    }),
  listExpenses: (token: string, bookId: string) =>
    request<unknown[]>(`/books/${bookId}/expenses`, { token }),
  createExpense: (token: string, bookId: string, payload: unknown) =>
    request(`/books/${bookId}/expenses`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    }),
  getBalance: (token: string, bookId: string) =>
    request<{ members: BalanceEntry[] }>(`/books/${bookId}/balance`, { token }),
  createSettlement: (token: string, bookId: string, payload: unknown) =>
    request(`/books/${bookId}/settlements`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    }),
};
