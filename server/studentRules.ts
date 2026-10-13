// SERVER-SIDE validation. The browser is never trusted: whatever the client
// sends is re-checked here, because these rules are what actually protect the
// data file. The client has its own copy (src/studentUtils.ts) only to give
// instant feedback; this file is the one that decides.
import type { Student } from '../src/types.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const YEARS: readonly Student['year'][] = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate'];
const STATUSES: readonly Student['status'][] = ['Active', 'Probation', 'On Leave', 'Graduated'];

const MAX_SHORT = 120;
const MAX_LONG = 300;

export type ParsedStudent = { ok: true; student: Student } | { ok: false; error: string };

function asRecord(body: unknown): Record<string, unknown> | null {
  return body !== null && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

/** Trim, drop non-strings and cap the length. */
function text(value: unknown, max = MAX_SHORT): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Strict number parsing: "abc" and "" are rejected instead of becoming 0. */
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toInteger(value: unknown): number | null {
  const n = toFiniteNumber(value);
  return n !== null && Number.isInteger(n) ? n : null;
}

/** An empty cell means "use the default", anything else must be a valid number. */
function optional(value: unknown, fallback: number, parse: (v: unknown) => number | null): number | null {
  if (value === undefined || value === null || value === '') return fallback;
  return parse(value);
}

/**
 * Turn a request body into a Student, or explain what is wrong with it.
 * Unknown fields are ignored, so a client cannot smuggle extra keys into the file.
 */
export function parseStudent(body: unknown): ParsedStudent {
  const b = asRecord(body);
  if (!b) return { ok: false, error: 'Expected a JSON object.' };

  const id = text(b.id, 40);
  const fullName = text(b.fullName);
  const email = text(b.email);
  const major = text(b.major);

  if (!id || !fullName || !email || !major) {
    return { ok: false, error: 'Missing required student fields (id, fullName, email, major).' };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }

  const gpa = toFiniteNumber(b.gpa);
  if (gpa === null || gpa < 0 || gpa > 4) {
    return { ok: false, error: 'GPA must be a number between 0 and 4.' };
  }

  const credits = optional(b.credits, 0, toInteger);
  if (credits === null || credits < 0) {
    return { ok: false, error: 'Credits must be a whole number of 0 or more.' };
  }

  const enrollmentYear = optional(b.enrollmentYear, new Date().getFullYear(), toInteger);
  if (enrollmentYear === null || enrollmentYear < 1900 || enrollmentYear > 2100) {
    return { ok: false, error: 'Cohort year must be a whole number between 1900 and 2100.' };
  }

  const year = (text(b.year, 20) || 'Freshman') as Student['year'];
  if (!YEARS.includes(year)) {
    return { ok: false, error: `Classification must be one of: ${YEARS.join(', ')}.` };
  }

  const status = (text(b.status, 20) || 'Active') as Student['status'];
  if (!STATUSES.includes(status)) {
    return { ok: false, error: `Status must be one of: ${STATUSES.join(', ')}.` };
  }

  return {
    ok: true,
    student: {
      id,
      fullName,
      email,
      phone: text(b.phone, 40),
      major,
      department: text(b.department) || 'General Studies',
      year,
      enrollmentYear,
      gpa,
      status,
      credits,
      advisor: text(b.advisor),
      address: text(b.address, MAX_LONG),
    },
  };
}

/**
 * Update body: merge it over the stored record so omitted fields stay as they
 * were, and force the stored ID so a client can never rename a record.
 */
export function parseStudentUpdate(body: unknown, existing: Student): ParsedStudent {
  const b = asRecord(body);
  if (!b) return { ok: false, error: 'Expected a JSON object.' };
  return parseStudent({ ...existing, ...b, id: existing.id });
}

/** Student IDs are compared without case, everywhere. */
export function sameId(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
