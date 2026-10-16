// DATABASE layer: "đọc, ghi dữ liệu".
// Our database is the JSON file data/students.json (no database server, as in Block 1).
// Only this file touches the disk. The handler never reads or writes the file itself,
// and the frontend never sees the file at all: it only talks to the API.
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Student } from '../types.ts';

const DATA_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/students.json');

async function readFile(): Promise<Student[]> {
  const students = JSON.parse(await fs.readFile(DATA_FILE, 'utf-8'));
  if (!Array.isArray(students)) throw new Error('students.json must contain an array');
  return students;
}

async function writeFile(students: Student[]): Promise<void> {
  // Write a temp file first, then rename it: a crash never leaves half a file.
  const tmp = DATA_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(students, null, 2) + '\n', 'utf-8');
  await fs.rename(tmp, DATA_FILE);
}

// Two requests at the same time must not both read the old file and then
// overwrite each other, so every read-change-write runs one after another.
let queue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

/** Read every student (newest first). */
export function findAll(): Promise<Student[]> {
  return readFile();
}

/**
 * Insert a student at the top of the list, unless `canInsert` says no.
 * `canInsert` runs inside the same locked step, so the duplicate check and
 * the write can never be split by another request.
 */
export function insert(
  student: Student,
  canInsert: (current: Student[]) => string | null,
): Promise<{ ok: true; student: Student } | { ok: false; error: string }> {
  return oneAtATime(async () => {
    const students = await readFile();
    const error = canInsert(students);
    if (error) return { ok: false as const, error };
    students.unshift(student);
    await writeFile(students);
    return { ok: true as const, student };
  });
}
