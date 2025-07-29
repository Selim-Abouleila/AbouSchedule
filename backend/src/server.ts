/* ───────────────  server.ts  ─────────────── */
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import * as dotenv from 'dotenv';
import { z } from 'zod';
import { Status } from '@prisma/client';
import { Priority } from '@prisma/client';
import { Size } from '@prisma/client';
import { Recurrence } from '@prisma/client';

// server.ts (top of the file, together with the other imports)
import { uploadToS3 } from "./lib/uploadToS3.js";   // path relative to server.ts
//helpers for sorting
import { SORT_PRESETS } from './lib/helpers';
import { nextDate } from "./lib/recur";
import { startRecurrenceRoller } from "./lib/roll-recurrence"




dotenv.config();

const prisma = new PrismaClient();
const app = Fastify({ logger: true });

app.setErrorHandler((err, req, rep) => {
  app.log.error(err);                 // ⬅️  this prints the stack trace
  rep.code(500).send({ error: 'Internal error' });
});


/* ───── Root ping ───── */
app.get('/', () => ({ ok: true }));

/* ───── JWT ───── */
app.register(jwt, { secret: process.env.JWT_SECRET || 'dev-secret' });
app.decorate('auth', async (req: any, rep: any) => {
  try {
    await req.jwtVerify();
  } catch {
    return rep.code(401).send({ error: 'Unauthorized' });
  }
});

/* ───── Multipart support ───── */
app.register(multipart, {
  limits: { fileSize: 5 * 1024 * 1024 },  // 5 MB per file
});

/* ───── Auth routes ───── */
const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'EMPLOYEE']).default('EMPLOYEE'),
});

app.post('/auth/register', async (req, rep) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    return rep.code(400).send({ error: parsed.error.flatten() });
  }
  const { email, password, role } = parsed.data;

  if (await prisma.user.findUnique({ where: { email } })) {
    return rep.code(409).send({ error: 'Email already in use' });
  }

  const hash = await argon2.hash(password);
  await prisma.user.create({ data: { email, password: hash, role } });
  return rep.code(201).send({ ok: true });
});

app.post('/auth/login', async (req, rep) => {
  const { email, password } = req.body as { email: string; password: string };
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await argon2.verify(user.password, password))) {
    return rep.code(401).send({ error: 'Bad credentials' });
  }
  const token = app.jwt.sign({ sub: user.id, role: user.role });
  return { token };
});



// server.ts  (only the /tasks POST handler shown)
app.register(async (f) => {

  f.addHook('preHandler', f.auth)

  f.post('/', async (req: any, rep) => {
    const userId = req.user.sub as number;

    /* --- ❶  Collect parts in ONE pass ----------------------------- */
    const fields: Record<string, string> = {};
    const images: { taskId: number; url: string; mime: string }[] = [];
    const documents: { taskId: number; url: string; mime: string }[] = [];


    /* same loop, just decide where to push */
    if (req.isMultipart()) {
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          const url = await uploadToS3(part, 'tasks/tmp');

          /* heuristics: treat PDFs, DOCX, etc. as documents */
          const isDoc = /^(application|text)\//.test(part.mimetype ?? '');

          (isDoc ? documents : images).push({
            taskId: 0,                 // patched after .create()
            url,
            mime: part.mimetype,
          });

        } else if (part.type === 'field') {
          fields[part.fieldname] = part.value;
        }
      }
    } else {
      Object.assign(fields, req.body);
    }



    /* --- ❷  Create the Task -------------------------------------- */
    const {
      title,
      description,
      priority,
      status = 'ACTIVE',
      size,
      dueAt,
      timeCapMinutes,
      recurrence,        // DAILY | WEEKLY | … (string)
      recurrenceEvery,   // "1" | "2" | …
      recurrenceDow,
      recurrenceDom,
      recurrenceMonth, 
      recurrenceEnd,
      labelDone,
      lastOccurrence,
      nextOccurrence
    } = fields as {
      title: string;
      description?: string;
      priority: string;
      status?: string;
      size?: string;
      dueAt?: string;
      timeCapMinutes?: string;   // numbers come in as strings from multipart
      recurrence?: string;       // can be undefined
      recurrenceEvery?: string;
      recurrenceDow?: string;
      recurrenceDom?: string;
      recurrenceMonth?: string;
      recurrenceEnd?: string;
      labelDone?: string;
      lastOccurrence?: string;
      nextOccurrence?: string;
    };

    const anchor = dueAt ? new Date(dueAt)              // user‑supplied
      : new Date();

    /* ── 2. work out the first “next” occurrence ───────── */
    const firstNextOccurrence  = nextDate(
  /* last  */ null,                                 // never run yet
  /* start */ anchor,                               // template start
      recurrenceEvery ? Number(recurrenceEvery) : 1,
      recurrence ? (recurrence as Recurrence) : Recurrence.NONE,
      recurrenceDow ? Number(recurrenceDow) : null,
      recurrenceDom ? Number(recurrenceDom) : null,
      recurrenceMonth ? Number(recurrenceMonth) : null,
      recurrenceDom ? Number(recurrenceDom) : null
    );

    const done = labelDone ? labelDone === 'true' : undefined;

    /* Set Previous Status */

    const initStatus = status as Status;               // value that came from UI
    const prevStatus =
      initStatus === 'DONE' && recurrence && recurrence !== 'NONE'
        ? 'ACTIVE'                                      // or 'PENDING', your choice
        : null;


    const task = await prisma.task.create({
      data: {
        title,
        description,
        priority: priority as Priority,
        status: initStatus,
        previousStatus: prevStatus,
        size: size as Size,
        dueAt: dueAt ? new Date(dueAt) : undefined,
        timeCapMinutes: timeCapMinutes ? Number(timeCapMinutes) : undefined,
        recurrence: recurrence ? recurrence as Recurrence : Recurrence.NONE,
        recurrenceEvery: recurrenceEvery ? Number(recurrenceEvery) : undefined,
        recurrenceDow:  recurrenceDow  ? Number(recurrenceDow)  : null,
        recurrenceDom:  recurrenceDom  ? Number(recurrenceDom)  : null,
        recurrenceMonth: recurrenceMonth ? Number(recurrenceMonth) : null,
        recurrenceEnd: recurrenceEnd ? new Date(recurrenceEnd) : undefined,
        labelDone: done,
        lastOccurrence: null,
        nextOccurrence: firstNextOccurrence,
        userId
      }
    });

    /* --- ❸  Persist image metadata (if any) ---------------------- */
    if (images.length) {
      for (const img of images) img.taskId = task.id;        // patch IDs
      await prisma.image.createMany({ data: images });
    }

    /* --- ❸b  Persist document metadata ------------------------------- */
    if (documents.length) {
      for (const doc of documents) doc.taskId = task.id;
      await prisma.document.createMany({ data: documents });
    }

    const full = await prisma.task.findUnique({
      where: { id: task.id },
      include: { images: true, documents: true }
    });

    return rep.code(201).send(full);

  });



  /* -----------------------  GET /tasks  ----------------------- */
f.get('/', async (req: any, rep) => {
  const userId = req.user.sub as number;

  /* optional cursor‑based paging */
  const take    = Math.min(Number(req.query.take) || 50, 100);
  const cursor  = req.query.cursor ? Number(req.query.cursor) : null;

  /* simple sort presets (priority | dueAt | createdAt) */
  const SORT_PRESETS: Record<string, any> = {
    priority:  { priority: 'asc',  dueAt: 'asc',  id: 'asc' },
    due:       { dueAt:   'asc',  priority: 'asc', id: 'asc' },
    created:   { createdAt: 'desc' },
  };
  const preset   = String(req.query.sort || 'priority');
  const orderBy  = SORT_PRESETS[preset] ?? SORT_PRESETS.priority;

  /* 1. fetch one page of tasks (real DB rows only) */
  const tasks = await prisma.task.findMany({
    where:  { userId },
    take,
    skip:   cursor ? 1 : 0,
    ...(cursor && { cursor: { id: cursor } }),
    orderBy,
    include: { images: true, documents: true },   // keep if you need them
  });

  /* 2. compute the next paging cursor (numeric id of last row) */
  const nextCursor = tasks.length === take ? tasks[tasks.length - 1].id : null;

  /* 3. return plain rows */
  return { tasks, nextCursor };
});


  // GET /media
  f.get('/media', async (req: any) => {
    const userId = req.user.sub as number;

    /* fetch original DB rows */
    const [images, docs] = await Promise.all([
      prisma.image.findMany({ where: { task: { userId } } }),
      prisma.document.findMany({ where: { task: { userId } } }),
    ]);

    /* add thumbUrl for each image row */
    const thumbImages = images.map(img => ({
      ...img,
      /*  ❶  If your files are on S3 + CloudFront/Cloudflare: */
      thumbUrl: `${img.url}?w=200&h=200&fit=cover`,   // query string resize

      /*  ❷  Or if you store resized copies side‑by‑side:           */
      // thumbUrl: img.url.replace('/original/', '/thumbs/'),

      /*  ❸  Or if you have a dedicated thumbnails table:            */
      // thumbUrl: await prisma.imageThumb.findUnique({ where: { id: img.id } }).url,
    }));

    return { images: thumbImages, documents: docs };
});



  /* GET /tasks/:id – returns one DB row, unchanged */
f.get('/:id', async (req: any, rep) => {
  const userId = req.user.sub as number;
  const raw    = String(req.params.id);

  /* 1. extract the numeric part (supports "R123‑…" and "123") */
  const match  = raw.match(/^R?(\d+)/);
  if (!match) return rep.code(400).send({ error: 'Bad task id' });

  const dbId = +match[1];
  if (!Number.isFinite(dbId)) {
    return rep.code(400).send({ error: 'Bad task id' });
  }

  /* 2. fetch exactly what’s in the DB */
  const task = await prisma.task.findFirst({
    where: { id: dbId, userId },
    include: { images: true, documents: true },
  });

  if (!task) return rep.code(404).send({ error: 'Task not found' });

  /* 3. return row as‑is (lastOccurrence, nextOccurrence already set) */
  return task;
});


  /* DELETE /tasks/:id – remove a task the user owns */
  f.delete('/:id', async (req: any, rep) => {
    const userId = req.user.sub as number;
    const id = Number(req.params.id);

    /* delete and make sure it belonged to this user */
    const deleted = await prisma.task.deleteMany({
      where: { id, userId },
    });

    if (deleted.count === 0) {
      return rep.code(404).send({ error: 'Task not found' });
    }
    // Images go automatically because Image.task has onDelete: Cascade
    return { ok: true };
  });


  /* -----------------------------------------------------------------
 * PATCH /tasks/:id – update fields and optionally upload / delete images
 * ---------------------------------------------------------------- */
  f.patch("/:id", async (req: any, rep) => {
    const userId = req.user.sub as number;
    const id = Number(req.params.id);

    /* ❶ Read multipart (or JSON) */
    const fields: Record<string, string> = {};
    const newImgs: { taskId: number; url: string; mime: string }[] = [];
    const newDocs: { taskId: number; url: string; mime: string }[] = [];

    if (req.isMultipart()) {
      for await (const part of req.parts()) {
        if (part.type === "file") {
          const url = await uploadToS3(part, `tasks/tmp/`);   // helper
          const isDoc = /^(application|text)\//.test(part.mimetype ?? '');
          (isDoc ? newDocs : newImgs).push({ taskId: id, url, mime: part.mimetype });
        } else if (part.type === "field") {
          fields[part.fieldname] = part.value;
        }
      }
    } else {
      Object.assign(fields, req.body);                         // JSON / url‑encoded
    }

    /* ❷ Extract scalars */
    const {
      title, description, priority, status, size,
      dueAt, timeCapMinutes, recurrence, recurrenceDow, recurrenceDom, recurrenceMonth, recurrenceEvery,
      recurrenceEnd, labelDone, keep, keepDocs
    } = fields as Partial<{
      title: string; description: string; priority: Priority; status: Status; size: Size;
      dueAt: string; timeCapMinutes: string; recurrence: Recurrence; recurrenceDow: string; recurrenceDom: string; recurrenceMonth: string;
      recurrenceEvery: string; recurrenceEnd: string; labelDone: string; keep: string; keepDocs: string;
    }>;

    /* ❸ Build `data` dynamically */
    const data: Record<string, any> = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (priority !== undefined) data.priority = priority;
    if (status !== undefined) data.status = status;
    if (size !== undefined) data.size = size;
    if (dueAt !== undefined) data.dueAt = dueAt ? new Date(dueAt) : null;
    if (timeCapMinutes !== undefined) data.timeCapMinutes = Number(timeCapMinutes);
    if (recurrence !== undefined) data.recurrence = recurrence;
    if (recurrenceEvery !== undefined) data.recurrenceEvery = Number(recurrenceEvery);
    if (recurrenceDow !== undefined) data.recurrenceDow = Number(recurrenceDow);
    if (recurrenceMonth !== undefined) data.recurrenceMonth = Number(recurrenceMonth);
    if (recurrenceDom !== undefined) data.recurrenceDom = Number(recurrenceDom);
    if (recurrenceEnd !== undefined) data.recurrenceEnd = recurrenceEnd ? new Date(recurrenceEnd) : null;
    if (labelDone !== undefined) data.labelDone = labelDone === "true";




    // set previous status
    if (data.status === 'DONE') {
      // fetch current status first (or rely on the row you already have)
      const current = await prisma.task.findUnique({ where: { id } });
      data.previousStatus = current?.status ?? null;
    }

    /* ❹ Update row only if it belongs to the user */
    const upd = await prisma.task.updateMany({ where: { id, userId }, data });
    if (upd.count === 0) return rep.code(404).send({ error: "Task not found" });
    

    /* ❺ Images ‍– add new, delete removed */
    /* ❺ Images – delete removed, then add new */
    if (keep !== undefined) {
      const keepIds = keep.split(',').map(Number).filter(Boolean);

      await prisma.image.deleteMany({
        where: { taskId: id, id: { notIn: keepIds } }
      });
    }

    if (newImgs.length) {
      await prisma.image.createMany({ data: newImgs });
    }

    if (keepDocs !== undefined) {
      const ids = keepDocs.split(',').map(Number).filter(Boolean);
      await prisma.document.deleteMany({
        where: { taskId: id, id: { notIn: ids } }
      });
    }

    if (newDocs.length) {
      await prisma.document.createMany({ data: newDocs });
    }
    



    /* ❻ Return fresh record */
    const task = await prisma.task.findUnique({
      where: { id },
      include: { images: true, documents: true }
    });
    return task;
  });

}, { prefix: '/tasks' });

startRecurrenceRoller();

/* ───── Start server ───── */
const PORT = Number(process.env.PORT) || 3000;
app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`🚀  API ready on 0.0.0.0:${PORT}`);
});
