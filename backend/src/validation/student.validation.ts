// Server-side validation. The API is the trust boundary: a request can be sent
// without our React form (for example with curl), so the server checks every
// field again even though the frontend already checked them.
import type { Student } from '../types.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const YEARS: Student['year'][] = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate'];
const STATUSES: Student['status'][] = ['Active', 'Probation', 'On Leave', 'Graduated'];

/** Read any JSON body as strings, so missing or wrong-typed fields are handled the same way. */
function str(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  return v == null ? '' : String(v).trim();
}

/** Turn the request body into a clean Student, or return a 400 error message. */
export function parseStudent(body: unknown): { student: Student; error: null } | { student: null; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const id = str(b, 'id');
  const fullName = str(b, 'fullName');
  const email = str(b, 'email');
  const major = str(b, 'major');
  const gpaText = str(b, 'gpa');

  if (!id || !fullName || !email || !major || !gpaText) {
    return { student: null, error: 'Please fill in all required fields (ID, Full Name, Email, Major, GPA).' };
  }
  if (!EMAIL_RE.test(email)) return { student: null, error: 'Please enter a valid email address.' };
  const gpa = Number(gpaText);
  if (!Number.isFinite(gpa) || gpa < 0 || gpa > 4) return { student: null, error: 'GPA must be between 0 and 4.' };

  const year = str(b, 'year') as Student['year'];
  const status = str(b, 'status') as Student['status'];
  const student: Student = {
    id,
    fullName,
    email,
    phone: str(b, 'phone'),
    major,
    department: str(b, 'department') || 'General Studies',
    year: YEARS.includes(year) ? year : 'Freshman',
    enrollmentYear: parseInt(str(b, 'enrollmentYear'), 10) || new Date().getFullYear(),
    gpa,
    status: STATUSES.includes(status) ? status : 'Active',
    credits: parseInt(str(b, 'credits'), 10) || 0,
    advisor: str(b, 'advisor'),
    address: str(b, 'address'),
  };
  return { student, error: null };
}

/** 409 check: the ID must be new (upper and lower case count as the same). */
export function duplicateIdError(id: string, existing: Student[]): string | null {
  return existing.some((s) => s.id.toLowerCase() === id.toLowerCase())
    ? `Student with ID "${id}" already exists. Please choose a unique ID.`
    : null;
}
