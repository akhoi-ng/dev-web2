import { useState } from 'react';
import type { Student, StudentInput } from './types';
import { seedStudents } from './seed';
import { calculateStats, toStudent, validateStudent } from './studentUtils';
import AddStudentForm from './components/AddStudentForm';
import StudentList from './components/StudentList';

// App is the STATE OWNER of the student list:
// `students` below is the only place the list is stored. It is filled once
// from the seed data, and every change goes through addStudent -> setStudents.
// There is no server and no API: React renders every screen from this state.
export default function App() {
  const [students, setStudents] = useState<Student[]>(() => seedStudents.map((s) => ({ ...s })));

  // The stats are DERIVED from the list on every render, not stored as state.
  const stats = calculateStats(students);

  /** Called by AddStudentForm. Returns an error message, or null when the student was added. */
  const addStudent = (input: StudentInput): string | null => {
    // GPA is required: an empty box would otherwise become 0.00 via parseFloat.
    if (!input.gpa || !input.gpa.trim()) {
      return 'Please fill in all required fields (ID, Full Name, Email, Major, GPA).';
    }

    const student = toStudent(input);
    const error = validateStudent(student, students);
    if (error) return error;

    // New array with the new student first. A new array tells React to render
    // again; students.push(...) would change the old array in place and React
    // would not notice.
    setStudents((current) => [student, ...current]);
    return null;
  };

  const scrollToForm = () => {
    document.getElementById('add-student')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <header className="nav">
        <div className="container nav-inner">
          <a className="brand" href="#main"><span className="brand-mark">UP</span><span>UniPortal</span></a>
          <div className="nav-actions">
            <button className="btn btn-primary" type="button" onClick={scrollToForm}>+ Add</button>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="hero" aria-labelledby="page-title">
          <div className="cloud c1" aria-hidden="true" />
          <div className="cloud c2" aria-hidden="true" />
          <div className="sun" aria-hidden="true" />
          <div className="container">
            <div className="dialog pixel-box">
              <p className="dialog-tag">UniPortal · Pixel campus</p>
              <h1 id="page-title">Student List, rendered in the browser.</h1>
              <p className="hero-sub">
                Client-side rendering: React builds this page from state. Adding a
                student updates the list without reloading the page.
              </p>
              <div className="hero-ctas">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => document.getElementById('roster')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  Meet the students
                </button>
                <button className="btn" type="button" onClick={scrollToForm}>+ New student</button>
              </div>
            </div>
          </div>
        </section>

        <div className="container" id="roster">
          <ul className="stats" aria-label="Enrollment statistics">
            <li className="stat pixel-box"><b>{stats.totalCount}</b><span>Total enrolled</span></li>
            <li className="stat pixel-box"><b>{stats.activeCount}</b><span>Active students</span></li>
            <li className="stat pixel-box"><b>{stats.avgGpa}</b><span>Average GPA</span></li>
          </ul>

          <div className="workspace">
            <AddStudentForm onAdd={addStudent} />
            <section aria-label="Student list">
              <StudentList students={students} />
              <p className="count">{students.length} record(s) · held in React state (F5 resets to the seed)</p>
            </section>
          </div>
        </div>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <span>UniPortal · React + Vite · client-side rendering</span>
          <span>No API · no database · state lives in the browser</span>
        </div>
      </footer>
    </>
  );
}
