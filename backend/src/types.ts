// The shape of one student (same fields as Block 1).
// The assignment asks for id, name and email; our name field is `fullName`.
// The frontend has its own copy in frontend/src/types.ts: the two sides only
// share the JSON shape, never code.
export interface Student {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  major: string;
  department: string;
  year: 'Freshman' | 'Sophomore' | 'Junior' | 'Senior' | 'Graduate';
  enrollmentYear: number;
  gpa: number;
  status: 'Active' | 'Probation' | 'On Leave' | 'Graduated';
  credits: number;
  advisor?: string;
  address?: string;
}
