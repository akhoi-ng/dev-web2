// SERVER-ONLY code. It uses the Node file system, so nothing under src/ may
// ever import it (the browser bundle would break). The client talks to this
// through the REST API in server.ts.
//
// The only data source is data/students.json. There is no second, hardcoded
// copy of the records here, so the two can never drift apart.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Student } from '../src/types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'students.json');

/** Something is wrong with the data file. It is reported, never swallowed. */
export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Read every record. A missing file means "no records yet", not "use old seed data". */
export async function readStudents(): Promise<Student[]> {
  let raw: string;
  try {
    raw = await fs.readFile(DATA_FILE, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new StorageError(`Could not read data/students.json: ${describe(error)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new StorageError(`data/students.json is not valid JSON: ${describe(error)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new StorageError('data/students.json must contain an array of students.');
  }
  return parsed as Student[];
}

/**
 * Match the line endings the data file already uses. On Windows the working
 * copy is CRLF while git stores LF, so writing LF here would make every save
 * look like a whole-file change. Falls back to the OS default for a new file.
 */
async function currentEol(): Promise<string> {
  try {
    const existing = await fs.readFile(DATA_FILE, 'utf-8');
    return existing.includes('\r\n') ? '\r\n' : '\n';
  } catch {
    return os.EOL;
  }
}

/**
 * Write to a temporary file and rename it over the real one, so a crash midway
 * can never leave a half-written students.json behind.
 *
 * The formatting matches the file that was already in the repo (two-space
 * indent), so saving a record does not show up as a whole-file diff.
 */
async function writeAtomically(students: Student[]): Promise<void> {
  const tmpFile = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const eol = await currentEol();
    const json = JSON.stringify(students, null, 2).split('\n').join(eol);
    await fs.writeFile(tmpFile, json, 'utf-8');
    await fs.rename(tmpFile, DATA_FILE);
  } catch (error) {
    await fs.rm(tmpFile, { force: true }).catch(() => {});
    throw new StorageError(`Could not save data/students.json: ${describe(error)}`);
  }
}

// Requests that read-modify-write the file are chained, so two people saving at
// the same time cannot overwrite each other's change.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Run a read-modify-write against the data file, one at a time.
 * `fn` receives the current records and returns the list to save (omit `save`
 * to only read) plus the value to hand back to the caller.
 */
export function transact<T>(
  fn: (students: Student[]) => { save?: Student[]; value: T } | Promise<{ save?: Student[]; value: T }>,
): Promise<T> {
  const run = queue.then(async () => {
    const students = await readStudents();
    const outcome = await fn(students);
    if (outcome.save) await writeAtomically(outcome.save);
    return outcome.value;
  });

  // Keep the chain alive after a failure so one bad request cannot block the rest.
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Read-only helper for the GET routes. */
export function readAll(): Promise<Student[]> {
  return transact((students) => ({ value: students }));
}
