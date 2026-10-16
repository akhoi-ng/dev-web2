import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { StudentInput } from '../types';
import { emptyInput } from '../studentUtils';

interface Props {
  /** Push the new student up to the state owner (App). Resolves to an error message, or null when it was saved. */
  onAdd: (input: StudentInput) => Promise<string | null>;
  /** True while the starting list is still loading from the server. */
  disabled?: boolean;
}

// State owner of the FORM: what the user is typing lives here, not in App.
// Every input is CONTROLLED: it shows `values[...]` from state, and every
// keystroke calls onChange, which updates that state.
export default function AddStudentForm({ onAdd, disabled = false }: Props) {
  const [values, setValues] = useState<StudentInput>(() => emptyInput(''));
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false); // true while POST /api/students is running
  const firstInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setValues((current) => ({ ...current, [e.target.name]: e.target.value }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault(); // stop the browser from sending the form and loading a new document
    if (saving) return;

    setSaving(true);
    setMessage(null);
    const err = await onAdd(values); // 1. send the new student to the owner (App calls the API)
    setSaving(false);
    if (err) {
      setError(err); // 2a. invalid: keep what the user typed and show the error
      setMessage(null);
      return;
    }
    setError(null);
    const newId = values.id.trim(); // capture before the fields are reset
    setValues(emptyInput('')); // 2b. added: reset the fields
    setMessage('Student saved on the server and added to the list.');
    // 3. bring the new card into view: one scrollIntoView covers both a laptop
    //    scrolled deep into the list and a phone where the form sits above it.
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-id="${CSS.escape(newId)}"]`)
        ?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      // focus after React re-enabled the fieldset (it was disabled while saving)
      firstInputRef.current?.focus({ preventScroll: true });
    });
  };

  const text = (
    name: keyof StudentInput,
    label: string,
    opts: { placeholder?: string; type?: string; ref?: typeof firstInputRef } = {},
  ) => (
    <label className="field">
      <span>{label} <b className="req">*</b></span>
      <input
        ref={opts.ref}
        type={opts.type || 'text'}
        name={name}
        value={values[name] ?? ''}
        onChange={handleChange}
        placeholder={opts.placeholder}
      />
    </label>
  );

  return (
    <div className="add-panel" id="add-student">
      <form className="form pixel-box compact" onSubmit={submit} noValidate>
        <h2 className="form-title">Add new student</h2>
        <p className="lede">
          {disabled ? 'Waiting for the student list from the server…' : 'Saved through the backend API, then shown in the list. No page reload.'}
        </p>
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="flash" role="status">{message}</p>}
        {/* A disabled <fieldset> turns off every input and the button inside it. */}
        <fieldset className="form-fields" disabled={disabled || saving}>
        <div className="grid2">
          {text('fullName', 'Full name', { placeholder: 'e.g. Maya Lin', ref: firstInputRef })}
          {text('id', 'Student ID', { placeholder: 'e.g. STU-2026-401' })}
          {text('email', 'Email', { type: 'email', placeholder: 'm.lin@university.edu' })}
          {text('major', 'Major', { placeholder: 'e.g. Computer Science' })}
          <label className="field">
            <span>GPA (0–4) <b className="req">*</b></span>
            <input type="number" step="0.01" min={0} max={4} name="gpa" value={values.gpa} onChange={handleChange} />
          </label>
        </div>
        <div className="row">
          <button className="btn btn-primary" type="submit">{saving ? 'Saving…' : 'Add student'}</button>
        </div>
        </fieldset>
      </form>
    </div>
  );
}
