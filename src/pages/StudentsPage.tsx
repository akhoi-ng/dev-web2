import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Student, StudentInput } from '../types';
import { navigate, type Route } from '../router';
import { calculateStats, filterStudents, type Filters } from '../studentUtils';
import AddStudentForm from '../components/AddStudentForm';
import StudentList from '../components/StudentList';

const FILTER_KEYS = ['q', 'major', 'status', 'year', 'minGpa'] as const;

const readFilters = (query: URLSearchParams): Filters =>
  Object.fromEntries(FILTER_KEYS.map((k) => [k, query.get(k) || ''])) as unknown as Filters;

/** Build "/students?q=..&major=.." keeping only non-empty filters. */
const listUrl = (f: Filters) => {
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  return qs ? `/students?${qs}` : '/students';
};

interface Props {
  route: Route;
  students: Student[];                 // the ONE list state, owned by App
  lastAddedId: string | null;
  onAdd: (input: StudentInput) => Promise<string | null>;
  onDelete: (student: Student) => void;
}

export default function StudentsPage({ route, students, lastAddedId, onAdd, onDelete }: Props) {
  // Filters live in the URL hash, so reload and the Back button keep them.
  const appliedKey = route.query.toString();
  const applied = useMemo(() => readFilters(new URLSearchParams(appliedKey)), [appliedKey]);
  const hasActiveFilters = FILTER_KEYS.some((k) => applied[k]);

  // Everything below is DERIVED from `students` on each render, not stored as extra state.
  const filtered = useMemo(() => filterStudents(students, applied), [students, applied]);
  const stats = calculateStats(students);
  const majors = useMemo(() => Array.from(new Set(students.map((s) => s.major))).filter(Boolean).sort(), [students]);
  const years = useMemo(
    () => Array.from(new Set(students.map((s) => s.enrollmentYear))).sort((a, b) => b - a),
    [students],
  );

  // The filter inputs are controlled too; they are applied only when "Run queries" is pressed.
  const [form, setForm] = useState<Filters>(applied);
  useEffect(() => setForm(applied), [applied]);

  useEffect(() => {
    document.title = 'Students Directory - UniPortal';
  }, []);

  const submitFilters = (e: FormEvent) => {
    e.preventDefault();
    navigate(listUrl(form));
  };

  const setField = (k: keyof Filters) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <section className="hero" aria-labelledby="page-title">
        <div className="cloud c1" aria-hidden="true" />
        <div className="cloud c2" aria-hidden="true" />
        <div className="sun" aria-hidden="true" />
        <div className="container">
          <div className="dialog pixel-box">
            <p className="dialog-tag">UniPortal · Pixel campus</p>
            <h1 id="page-title">Every student gets <em>their own character</em>.</h1>
            <p className="hero-sub">Client-side rendering: React builds this page, and every change is saved to the server without reloading the page.</p>
            <div className="hero-ctas">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => document.getElementById('roster')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Meet the students
              </button>
              <a className="btn" href="#/students/new">+ New record</a>
            </div>
          </div>
        </div>
      </section>

      <div className="container" id="roster">
        <ul className="stats" aria-label="Enrollment statistics">
          <li className="stat pixel-box"><b>{stats.totalCount}</b><span>Total enrolled</span></li>
          <li className="stat pixel-box"><b>{stats.activeCount}</b><span>Active students</span></li>
          <li className="stat pixel-box"><b>{stats.avgGpa}</b><span>Average GPA</span></li>
          <li className="stat pixel-box"><b>{filtered.length}</b><span>Filtered results</span></li>
        </ul>

        <form className="panel pixel-box" onSubmit={submitFilters}>
          <div className="panel-head">
            <h2>Dual-query engine</h2>
            {hasActiveFilters && <a className="clear-link" href="#/students">Clear all filters</a>}
          </div>
          <label className="field-label" htmlFor="q">Query 1 · text search (name, ID, email, major)</label>
          <input
            type="text"
            id="q"
            value={form.q}
            onChange={setField('q')}
            placeholder="e.g. Hào, STU-2024-101, Economics…"
          />
          <div className="filter-grid">
            <div>
              <label className="field-label" htmlFor="f-major">Major</label>
              <select id="f-major" value={form.major} onChange={setField('major')}>
                <option value="">All majors</option>
                {majors.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="f-status">Status</label>
              <select id="f-status" value={form.status} onChange={setField('status')}>
                <option value="">All statuses</option>
                {['Active', 'Probation', 'On Leave', 'Graduated'].map((st) => <option key={st} value={st}>{st}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="f-year">Cohort year</label>
              <select id="f-year" value={form.year} onChange={setField('year')}>
                <option value="">All years</option>
                {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="f-gpa">Min GPA</label>
              <select id="f-gpa" value={form.minGpa} onChange={setField('minGpa')}>
                <option value="">Any GPA</option>
                <option value="3.5">≥ 3.5 Honors</option>
                <option value="3.0">≥ 3.0 Good</option>
                <option value="2.5">≥ 2.5</option>
                <option value="2.0">≥ 2.0</option>
              </select>
            </div>
          </div>
          <div className="panel-foot">
            <a className="btn" href="#/students">Reset</a>
            <button className="btn btn-primary" type="submit">Run queries</button>
          </div>
        </form>

        <div className="workspace">
          <AddStudentForm students={students} onAdd={onAdd} focus={route.path === '/students/new'} />
          <section aria-label="Student list">
            <StudentList
              students={filtered}
              resetKey={appliedKey}
              lastAddedId={lastAddedId}
              onDelete={onDelete}
            />
            <p className="count">{filtered.length} of {students.length} record(s) · served by the API (reload keeps your changes)</p>
          </section>
        </div>
      </div>
    </>
  );
}
