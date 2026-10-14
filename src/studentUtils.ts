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
    gpa: parseFloat(input.gpa) || 0,
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
  if (s.gpa < 0 || s.gpa > 4) return 'GPA must be between 0 and 4.';
  if (others.some((o) => o.id.toLowerCase() === s.id.toLowerCase())) {
    return `Student with ID "${s.id}" already exists. Please choose a unique ID.`;
  }
  return null;
}
