import { useEffect, useState } from 'react';
import type { Student, StudentInput } from './types';
import { createStudent, fetchStudents } from './api';
import { calculateStats, checkNewStudent } from './studentUtils';
import AddStudentForm from './components/AddStudentForm';
import StudentList from './components/StudentList';

type LoadStatus = 'loading' | 'ready' | 'error';

// FRONTEND (bundle JS): fetch() -> state -> component -> DOM.
// App is the STATE OWNER of the student list: `students` below is the only
// place the list is kept in the browser. It is filled from GET /api/students,
// and a new student enters it only after POST /api/students answers 201.
// The frontend never touches the data file: all reads and writes go through the API.
export default function App() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0); // bump to retry after an error

  // First load: ask the server for the starting list, then keep it in state.
  useEffect(() => {
    let ignore = false; // the component may unmount before the answer arrives
    setLoadStatus('loading');
    setLoadError(null);
    fetchStudents()
      .then((list) => {
        if (ignore) return;
        setStudents(list);
        setLoadStatus('ready');
      })
      .catch((err: Error) => {
        if (ignore) return;
        setLoadError(err.message);
        setLoadStatus('error');
      });
    return () => {
      ignore = true;
    };
  }, [loadAttempt]);

  // The stats are DERIVED from the list on every render, not stored as state.
  const stats = calculateStats(students);
  const ready = loadStatus === 'ready';

  /**
   * Called by AddStudentForm. Resolves to an error message, or null when the student was saved.
   * Flow (like the lesson diagram): fetch() -> backend saves -> JSON -> state -> component -> DOM.
   */
  const addStudent = async (input: StudentInput): Promise<string | null> => {
    // The unique-ID check needs the full list, so wait until it has loaded.
    if (loadStatus !== 'ready') return 'The student list is still loading. Please wait a moment.';

    // 1. Quick check in the browser: clearly wrong data is not even sent.
    const check = checkNewStudent(input, students);
    if (check.error !== null) return check.error;

    // 2. fetch(): POST /api/students. The backend validates again and writes the file.
    let saved: Student;
    try {
      saved = await createStudent(input); // 201 + the saved student as JSON
    } catch (err) {
      return (err as Error).message; // 400 / 409 / 500: nothing changes, the form keeps what was typed
    }

    // 3. state: put the student the server saved into a NEW array (newest first).
    //    A new array tells React to render again; students.push(...) would change
    //    the old array in place and React would not notice.
    setStudents((current) => [saved, ...current]);
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
                Client-side rendering: React builds this page in the browser. The
                list comes from the backend API as JSON, and a new student is saved
                through the API and added to React state, with no page reload.
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
            <li className="stat pixel-box"><b>{ready ? stats.totalCount : '…'}</b><span>Total enrolled</span></li>
            <li className="stat pixel-box"><b>{ready ? stats.activeCount : '…'}</b><span>Active students</span></li>
            <li className="stat pixel-box"><b>{ready ? stats.avgGpa : '…'}</b><span>Average GPA</span></li>
          </ul>

          <div className="workspace">
            <AddStudentForm onAdd={addStudent} disabled={!ready} />
            <section aria-label="Student list">
              {loadStatus === 'loading' && (
                <div className="empty pixel-box" role="status">
                  <h2>Loading students…</h2>
                  <p>Asking the server for <code>GET /api/students</code>.</p>
                </div>
              )}
              {loadStatus === 'error' && (
                <div className="empty pixel-box" role="alert">
                  <h2>Could not load students</h2>
                  <p>{loadError}</p>
                  <button className="btn btn-primary" type="button" onClick={() => setLoadAttempt((n) => n + 1)}>
                    Try again
                  </button>
                </div>
              )}
              {ready && (
                <>
                  <StudentList students={students} />
                  <p className="count">
                    {students.length} record(s) in React state · loaded and saved through the
                    backend API (F5 asks GET /api/students again)
                  </p>
                </>
              )}
            </section>
          </div>
        </div>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <span>UniPortal · React + Vite · client-side rendering</span>
          <span>Frontend: React + Vite · Backend: Express API · the page never reloads</span>
        </div>
      </footer>
    </>
  );
}
