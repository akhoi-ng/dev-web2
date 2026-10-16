// HANDLER layer: "xử lý, validate".
// Each handler reads the request, validates it, asks the database layer for
// data, and answers with res.json(). It never builds HTML.
import type { Request, Response } from 'express';
import * as db from '../db/students.db.ts';
import { duplicateIdError, parseStudent } from '../validation/student.validation.ts';

/** GET /api/students -> 200 + JSON array */
export async function listStudents(_req: Request, res: Response) {
  try {
    res.json(await db.findAll());
  } catch (err) {
    console.error('Cannot read data/students.json:', err);
    res.status(500).json({ error: 'Cannot read the student list on the server.' });
  }
}

/** POST /api/students -> 201 + saved student | 400 invalid | 409 duplicate ID */
export async function createStudent(req: Request, res: Response) {
  const parsed = parseStudent(req.body);
  if (parsed.error !== null) return res.status(400).json({ error: parsed.error });

  try {
    const result = await db.insert(parsed.student, (current) => duplicateIdError(parsed.student.id, current));
    if (!result.ok) return res.status(409).json({ error: result.error });
    res.status(201).json(result.student);
  } catch (err) {
    console.error('Cannot write data/students.json:', err);
    res.status(500).json({ error: 'Cannot save the student on the server.' });
  }
}
