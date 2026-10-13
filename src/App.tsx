import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import type { Student, StudentInput } from './types';
import { toStudent, validateStudent } from './studentUtils';
import { api } from './api';
import { matchPath, navigate, useRoute } from './router';
import ThemeToggle from './components/ThemeToggle';
import StudentsPage from './pages/StudentsPage';
import EditStudentPage from './pages/EditStudentPage';

/** Turn any thrown value into something we can show the user. */
function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

interface Flash {
  text: string;
  kind: 'ok' | 'error';
}

// App is the STATE OWNER of the student list.
// `students` below is the only place the list is stored. It starts empty, is
// filled once from the API, and every change goes through addStudent /
// updateStudent / deleteStudent, which ask the server first and then update it.
// The server never sends HTML: React renders every screen from this state.
export default function App() {
  const [students, setStudents] = useState<Student[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [toast, setToast] = useState<Flash | null>(null);
  const route = useRoute();
  const mainRef = useRef<HTMLElement>(null);
  const loadIdRef = useRef(0);

  // ---------- load the list (on start, and on "Try again") ----------

  const loadStudents = useCallback(async () => {
    const loadId = (loadIdRef.current += 1);
    setStatus('loading');
    try {
      const list = await api.listStudents();
      // Ignore a slow response that a newer load has already replaced.
      if (loadId !== loadIdRef.current) return;
      setStudents(list);
      setLoadError(null);
      setStatus('ready');
    } catch (err) {
      if (loadId !== loadIdRef.current) return;
      setLoadError(message(err));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  // ---------- state transitions (the only code that changes the list) ----------

  /** Called by AddStudentForm. Returns an error message, or null when the student was added. */
  const addStudent = async (input: StudentInput): Promise<string | null> => {
    // Check in the browser first so the user gets an instant answer...
    const localError = validateStudent(toStudent(input), students);
    if (localError) return localError;

    try {
      // ...but the server validates again and is the one that decides.
      const created = await api.createStudent(input);
      setStudents((prev) => [created, ...prev]); // new array, new student first
      setLastAddedId(created.id);
      navigate('/students', `Student ${created.fullName} added. Saved to the server, no page reload.`);
      return null;
    } catch (err) {
      return message(err);
    }
  };

  const updateStudent = async (id: string, input: StudentInput): Promise<string | null> => {
    const localError = validateStudent(toStudent({ ...input, id }), students.filter((s) => s.id !== id));
    if (localError) return localError;

    try {
      const saved = await api.updateStudent(id, input);
      setStudents((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
      navigate('/students', `Student ${saved.fullName} modified. Saved to the server, no page reload.`);
      return null;
    } catch (err) {
      return message(err);
    }
  };

  const deleteStudent = async (student: Student) => {
    if (!window.confirm(`Delete ${student.fullName}?`)) return;
    try {
      await api.deleteStudent(student.id);
      setStudents((prev) => prev.filter((s) => s.id !== student.id));
      // The "New" tag must not outlive the student it belongs to.
      if (lastAddedId === student.id) setLastAddedId(null);
      setToast({ text: `Student ${student.fullName} (${student.id}) deleted.`, kind: 'ok' });
    } catch (err) {
      setToast({ text: message(err), kind: 'error' });
    }
  };

  // ---------- small UI effects ----------

  // A message passed with navigate() arrives with the new route.
  useEffect(() => {
    if (route.flash) setToast({ text: route.flash, kind: 'ok' });
  }, [route]);

  // ...and any message disappears by itself after a few seconds.
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Going between the list and the edit screen starts at the top, like a new page.
  const screen = route.path.startsWith('/students/edit/') ? 'edit' : 'list';
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  // "#main" would clash with the hash router, so the skip link focuses <main> by hand.
  const skipToMain = (e: MouseEvent) => {
    e.preventDefault();
    mainRef.current?.focus();
  };

  // ---------- pick the screen for the current #hash ----------

  let content;
  const edit = matchPath('/students/edit/:id', route.path);

  if (status === 'loading') {
    content = (
      <div className="container narrow">
        <div className="empty pixel-box form" role="status">
          <h2>Loading students…</h2>
          <p>Asking the server for the records.</p>
        </div>
      </div>
    );
  } else if (status === 'error') {
    content = (
      <div className="container narrow">
        <div className="empty pixel-box form" role="alert">
          <h2>Could not load students</h2>
          <p>{loadError}</p>
          <button className="btn btn-primary" type="button" onClick={() => void loadStudents()}>
            Try again
          </button>
        </div>
      </div>
    );
  } else if (route.path === '/students' || route.path === '/students/new') {
    content = (
      <StudentsPage
        route={route}
        students={students}
        lastAddedId={lastAddedId}
        onAdd={addStudent}
        onDelete={deleteStudent}
      />
    );
  } else if (edit) {
    content = (
      <EditStudentPage
        key={edit.id}
        student={students.find((s) => s.id === edit.id)}
        onUpdate={updateStudent}
      />
    );
  } else {
    content = (
      <div className="container narrow">
        <div className="empty pixel-box form">
          <h2>Page not found</h2>
          <p><a href="#/students">Back to the directory →</a></p>
        </div>
      </div>
    );
  }

  return (
    <>
      <a className="skip-link" href="#main" onClick={skipToMain}>Skip to content</a>
      <header className="nav">
        <div className="container nav-inner">
          <a className="brand" href="#/students"><span className="brand-mark">UP</span><span>UniPortal</span></a>
          <nav aria-label="Main">
            <ul className="nav-links">
              <li><a href="#/students">Directory</a></li>
              <li><a href="#/students/new">Add Student</a></li>
            </ul>
          </nav>
          <div className="nav-actions">
            <ThemeToggle />
            <a className="btn btn-primary" href="#/students/new">+ Add</a>
          </div>
        </div>
      </header>

      {toast && (
        <p className={`flash toast${toast.kind === 'error' ? ' error' : ''}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          <i className={`ph ${toast.kind === 'error' ? 'ph-warning-circle' : 'ph-check-circle'}`} aria-hidden="true" />{toast.text}
        </p>
      )}

      <main id="main" ref={mainRef} tabIndex={-1}>
        {content}
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <span>UniPortal · React + Vite (client-side rendering) · data served by the API</span>
          <span>
            {status === 'ready' ? `${students.length} student(s) · ` : ''}
            <a href="#/students">All records</a>
          </span>
        </div>
      </footer>
    </>
  );
}
