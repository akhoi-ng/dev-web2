// The shape of one student. Same fields as the SSR version (Block 1).
// The assignment asks for id, name and email; our name field is `fullName`.
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

/** What a form holds: every field as a string, exactly as typed. */
export type StudentInput = Record<keyof Student, string>;

export interface StudentStats {
  totalCount: number;
  activeCount: number;
  avgGpa: string;
}
