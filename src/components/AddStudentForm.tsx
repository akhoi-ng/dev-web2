import { useEffect, useRef, useState } from 'react';
import type { Student, StudentInput } from '../types';
import { emptyInput, nextStudentId, toStudent } from '../studentUtils';
import StudentForm from './StudentForm';

interface Props {
  students: Student[];
  /** Push the new student up to the state owner (App). Resolves to an error message, or null if it was added. */
  onAdd: (input: StudentInput) => Promise<string | null>;
  /** Scroll to the form and put the cursor in the first field (used by "+ Add" links). */
  focus?: boolean;
}

// State owner of the FORM: what the user is typing lives here, not in App.
// The LIST state lives only in App; this component just sends a new student up.
export default function AddStudentForm({ students, onAdd, focus }: Props) {
  const [values, setValues] = useState<StudentInput>(() => emptyInput(nextStudentId(students)));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!focus) return;
    boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    firstInputRef.current?.focus({ preventScroll: true });
  }, [focus]);

  const submit = async () => {
    if (submittingRef.current) return; // ignore a second click while the first is saving
    submittingRef.current = true;
    setSaving(true);
    try {
      const err = await onAdd(values); // 1. send the new student to the owner
      if (err) {
        setError(err); // 2a. invalid: keep what the user typed and show the error
        return;
      }
      setError(null);
      // 2b. added: reset the form, with a fresh suggested ID.
      // `values` is included because the `students` prop has not re-rendered yet.
      setValues(emptyInput(nextStudentId([toStudent(values), ...students])));
      firstInputRef.current?.focus();
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="add-panel" id="add-student" ref={boxRef}>
      <StudentForm
        compact
        title="Add new student"
        lede="Saved on the server. No page reload."
        values={values}
        onChange={setValues}
        onSubmit={() => void submit()}
        error={error}
        submitLabel="Add student"
        busy={saving}
        firstInputRef={firstInputRef}
      />
    </div>
  );
}
