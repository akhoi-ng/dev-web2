// fetch(): "gọi API của BE". The frontend never reads or writes the data file;
// it only calls the backend API, which answers with JSON (never HTML).
import type { Student, StudentInput } from './types';

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return body.error || `Server answered ${res.status}`;
}

/** GET /api/students: read the list (first load and every F5). */
export async function fetchStudents(): Promise<Student[]> {
  const res = await fetch('/api/students');
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

/** POST /api/students: ask the backend to save a new student. */
export async function createStudent(input: StudentInput): Promise<Student> {
  const res = await fetch('/api/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res)); // 400 invalid, 409 duplicate ID, 500 cannot save
  return res.json(); // 201 Created + the saved student
}
