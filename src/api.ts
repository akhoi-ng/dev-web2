// The browser never gets HTML for a page: it asks the Express API for JSON and
// React turns that into the screen. Every function here is a thin fetch()
// wrapper around the routes in server.ts.
import type { Student, StudentInput } from './types';

/** A failed request. `status` is the HTTP status code, or 0 for a network error. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function readError(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const { error } = payload as { error: unknown };
    if (typeof error === 'string' && error) return error;
  }
  return `Request failed (${status})`;
}

/** Pull the server's own error message out of the JSON body, if there is one. */
async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    // fetch only rejects when the request never reached the server.
    throw new ApiError('Could not reach the server. Is it running?', 0);
  }

  const payload = await parseJson(res);
  if (!res.ok) throw new ApiError(readError(payload, res.status), res.status);
  return payload as T;
}

export const api = {
  listStudents() {
    return request<Student[]>('/api/students');
  },
  createStudent(input: StudentInput) {
    return request<Student>('/api/students', { method: 'POST', body: JSON.stringify(input) });
  },
  updateStudent(id: string, input: StudentInput) {
    return request<Student>(`/api/students/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
  deleteStudent(id: string) {
    return request<{ success: boolean; message: string }>(`/api/students/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
};
