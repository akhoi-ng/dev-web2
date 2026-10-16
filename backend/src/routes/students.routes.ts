// ROUTER layer: "khớp method, path".
// Only decides WHICH handler runs for each method + path under /api/students.
import { Router } from 'express';
import { createStudent, listStudents } from '../handlers/students.handler.ts';

const router = Router();

router.get('/', listStudents);   // GET  /api/students -> read
router.post('/', createStudent); // POST /api/students -> write

export default router;
