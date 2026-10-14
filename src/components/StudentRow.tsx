import type { Student } from '../types';

const gpaClass = (g: number) => (g >= 3.5 ? 'honor' : g >= 3 ? 'good' : 'warn');
const statusClass = (s: string) =>
  s === 'Active' ? 'ok' : s === 'Graduated' ? 'info' : s === 'Probation' ? 'bad' : 'warn';

interface Props {
  student: Student;
}

// One student in the list (drawn as a card). It only reads props: no state.
// React escapes every {value}, so names with quotes or "<" are shown as text.
export default function StudentRow({ student }: Props) {
  const gpa = Number(student.gpa) || 0;

  return (
    <article className="card pixel-box" data-id={student.id}>
      <h3>{student.fullName}</h3>
      <p className="card-id">{student.id}</p>
      <p className="card-email">{student.email}</p>
      <ul className="chips">
        <li className="chip">{student.major}</li>
        <li className="chip">{student.year} · {student.enrollmentYear}</li>
        <li className={`chip ${gpaClass(gpa)}`}>GPA {gpa.toFixed(2)}</li>
        <li className={`chip ${statusClass(student.status)}`}>{student.status}</li>
      </ul>
    </article>
  );
}
