import { useEffect, useRef, type ChangeEvent, type FormEvent, type ReactNode, type RefObject } from 'react';
import type { StudentInput } from '../types';

const YEARS: [string, string][] = [
  ['Freshman', 'Freshman (Year 1)'],
  ['Sophomore', 'Sophomore (Year 2)'],
  ['Junior', 'Junior (Year 3)'],
  ['Senior', 'Senior (Year 4)'],
  ['Graduate', "Graduate / Master's"],
];
const STATUSES = ['Active', 'Probation', 'On Leave', 'Graduated'];

interface Props {
  title: string;
  lede: ReactNode;
  /** Controlled inputs: the parent owns the values... */
  values: StudentInput;
  /** ...and gets every change through this callback. */
  onChange: (values: StudentInput) => void;
  onSubmit: () => void;
  error: string | null;
  submitLabel: string;
  idReadOnly?: boolean;
  /** compact = required fields first, optional fields folded away (used beside the list). */
  compact?: boolean;
  cancelHref?: string;
  /** True while a save is in flight, so the button cannot be pressed twice. */
  busy?: boolean;
  firstInputRef?: RefObject<HTMLInputElement | null>;
}

// The form fields, shared by "Add student" and "Modifier record".
// It has NO state of its own: every <input> shows `values[...]` and every
// keystroke calls onChange. This is what "controlled input" means.
export default function StudentForm(props: Props) {
  const { title, lede, values, onChange, onSubmit, error, submitLabel, idReadOnly, compact, cancelHref, busy, firstInputRef } = props;
  const errorRef = useRef<HTMLParagraphElement>(null);

  // Make sure the user sees the error even if the form was scrolled.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [error]);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    onChange({ ...values, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault(); // stop the browser from sending the form and loading a new document
    onSubmit();
  };

  const text = (
    name: keyof StudentInput,
    label: string,
    opts: { required?: boolean; placeholder?: string; type?: string; readOnly?: boolean; ref?: RefObject<HTMLInputElement | null> } = {},
  ) => (
    <label className="field">
      <span>{label} {opts.required && <b className="req">*</b>}</span>
      <input
        ref={opts.ref}
        type={opts.type || 'text'}
        name={name}
        value={values[name] ?? ''}
        onChange={handleChange}
        required={opts.required}
        readOnly={opts.readOnly}
        placeholder={opts.placeholder}
      />
    </label>
  );

  const required = (
    <div className="grid2">
      {text('fullName', 'Full name', { required: true, placeholder: 'e.g. Maya Lin', ref: firstInputRef })}
      {idReadOnly
        ? text('id', 'Student ID', { readOnly: true })
        : text('id', 'Student ID', { required: true, placeholder: 'e.g. STU-2026-401' })}
      {text('email', 'Email', { required: true, type: 'email', placeholder: 'm.lin@university.edu' })}
      {text('major', 'Major', { required: true, placeholder: 'e.g. Computer Science' })}
      <label className="field"><span>GPA (0–4) <b className="req">*</b></span>
        <input type="number" step="0.01" min={0} max={4} name="gpa" required value={values.gpa} onChange={handleChange} />
      </label>
    </div>
  );

  const optional = (
    <>
      <div className="grid2">
        {text('phone', 'Phone', { placeholder: '+1 (555) 019-2834' })}
        {text('department', 'Department', { placeholder: 'e.g. Engineering & Technology' })}
        <label className="field"><span>Classification</span>
          <select name="year" value={values.year} onChange={handleChange}>
            {YEARS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </label>
        <label className="field"><span>Cohort year</span>
          <input type="number" name="enrollmentYear" min={2018} max={2030} value={values.enrollmentYear} onChange={handleChange} />
        </label>
        <label className="field"><span>Status</span>
          <select name="status" value={values.status} onChange={handleChange}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="field"><span>Credits</span>
          <input type="number" min={0} max={180} name="credits" value={values.credits} onChange={handleChange} />
        </label>
        {text('advisor', 'Advisor', { placeholder: 'e.g. Dr. Ada Lovelace' })}
      </div>
      {text('address', 'Address', { placeholder: 'e.g. Somerville Hall, Room 204' })}
    </>
  );

  return (
    <form className={`form pixel-box${compact ? ' compact' : ''}`} onSubmit={handleSubmit}>
      <h2 className="form-title">{title}</h2>
      <p className="lede">{lede}</p>
      {error && <p ref={errorRef} className="error" role="alert">{error}</p>}
      {required}
      {compact ? (
        <details className="more-fields">
          <summary>More fields (optional)</summary>
          {optional}
        </details>
      ) : optional}
      <div className="row">
        {cancelHref && <a className="btn" href={cancelHref}>Cancel</a>}
        <button className="btn btn-primary" type="submit" disabled={busy}>{submitLabel}</button>
      </div>
    </form>
  );
}
