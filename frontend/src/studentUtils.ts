// Pure helper functions. They never change state themselves: they take
// data in and return new data out. The state owner (App) calls them.
import type { Student, StudentInput, StudentStats } from './types';

export function calculateStats(students: Student[]): StudentStats {
  const total = students.length;
  const gpaSum = students.reduce((acc, s) => acc + (Number(s.gpa) || 0), 0);
  return {
    totalCount: total,
    activeCount: students.filter((s) => s.status === 'Active').length,
    avgGpa: total > 0 ? (gpaSum / total).toFixed(2) : '0.00',
  };
}

/** Empty form values. `id` is left blank so the user types their own. */
export function emptyInput(id: string): StudentInput {
  return {
    id,
    fullName: '',
    email: '',
    phone: '',
    major: '',
    department: '',
    year: 'Freshman',
    enrollmentYear: String(new Date().getFullYear()),
    gpa: '3.50',
    status: 'Active',
    credits: '30',
    advisor: '',
    address: '',
  };
}

/** Turn form strings into a real Student (trim text, convert numbers, fill defaults). */
export function toStudent(input: StudentInput): Student {
  const t = (v: string) => (v || '').trim();
  return {
    id: t(input.id),
    fullName: t(input.fullName),
    email: t(input.email),
    phone: t(input.phone),
    major: t(input.major),
    department: t(input.department) || 'General Studies',
    year: (input.year || 'Freshman') as Student['year'],
    enrollmentYear: parseInt(input.enrollmentYear, 10) || new Date().getFullYear(),
    gpa: (input.gpa ?? '').trim() === '' ? NaN : parseFloat(input.gpa),
    status: (input.status || 'Active') as Student['status'],
    credits: parseInt(input.credits, 10) || 0,
    advisor: t(input.advisor),
    address: t(input.address),
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Check a student before it goes into state. Returns an error message, or null if OK.
 * `others` is the list to check the unique ID against.
 */
export function validateStudent(s: Student, others: Student[]): string | null {
  if (!s.id || !s.fullName || !s.email || !s.major) {
    return 'Please fill in all required fields (ID, Full Name, Email, Major, GPA).';
  }
  if (!EMAIL_RE.test(s.email)) return 'Please enter a valid email address.';
  if (!Number.isFinite(s.gpa) || s.gpa < 0 || s.gpa > 4) return 'GPA must be between 0 and 4.';
  if (others.some((o) => o.id.toLowerCase() === s.id.toLowerCase())) {
    return `Student with ID "${s.id}" already exists. Please choose a unique ID.`;
  }
  return null;
}

/**
 * Client-side check before sending POST /api/students: quick feedback, no request
 * for data that is clearly wrong. The backend checks everything again (it must).
 * Returns the cleaned Student, or an error. `duplicate` is true when the ID is taken.
 */
export function checkNewStudent(
  input: StudentInput,
  others: Student[],
): { student: Student; error: null; duplicate: false } | { student: null; error: string; duplicate: boolean } {
  // GPA is required: an empty box would otherwise become 0.00 via parseFloat.
  if (!input.gpa || !input.gpa.trim()) {
    return { student: null, error: 'Please fill in all required fields (ID, Full Name, Email, Major, GPA).', duplicate: false };
  }
  const student = toStudent(input);
  const fieldError = validateStudent(student, []);
  if (fieldError) return { student: null, error: fieldError, duplicate: false };
  const idError = validateStudent(student, others);
  if (idError) return { student: null, error: idError, duplicate: true };
  return { student, error: null, duplicate: false };
}
