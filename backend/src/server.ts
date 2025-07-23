/* ───────────────  server.ts  ─────────────── */
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import * as dotenv from 'dotenv';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { s3Client } from './s3.js';
import { Status } from '@prisma/client';
import { Priority } from '@prisma/client';
import { Size } from '@prisma/client';
import { Recurrence } from '@prisma/client';
import { Upload } from '@aws-sdk/lib-storage';
import {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
} from 'fastify';





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


    if (req.isMultipart()) {
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          const key = `tasks/tmp/${randomUUID()}_${part.filename}`;

          await new Upload({
            client: s3Client,
            params: {
              Bucket: process.env.AWS_BUCKET!,
              Key: key,
              Body: part.file,                               // live stream
              ContentType: part.mimetype || 'application/octet-stream',
              ACL: 'public-read',
            },
          }).done();

          images.push({
            taskId: 0,
            url: `https://${process.env.AWS_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
            mime: part.mimetype,
          });
        } else if (part.type === 'field') {
          fields[part.fieldname] = part.value;               // ← keep titles, etc.
        }
      }
    } else {
      Object.assign(fields, req.body);                       // JSON / urlencoded
    }


    /* --- ❷  Create the Task -------------------------------------- */
    const {
      title,
      description,
      priority,
      status = 'PENDING',
      size,
      dueAt,
      timeCapMinutes,
      recurrence,        // DAILY | WEEKLY | … (string)
      recurrenceEvery,   // "1" | "2" | …
      recurrenceEnd,
      labelDone
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
      recurrenceEnd?: string;
      labelDone?: string;
    };

    const done = labelDone ? labelDone === 'true' : undefined;


    const task = await prisma.task.create({
      data: {
        title,
        description,
        priority: priority as Priority,
        status: status as Status,
        size: size as Size,
        dueAt: dueAt ? new Date(dueAt) : undefined,
        timeCapMinutes: timeCapMinutes ? Number(timeCapMinutes) : undefined,
        recurrence: recurrence ? recurrence as Recurrence : 'NONE',
        recurrenceEvery: recurrenceEvery ? Number(recurrenceEvery) : undefined,
        recurrenceEnd: recurrenceEnd ? new Date(recurrenceEnd) : undefined,
        labelDone: done,
        userId
      }
    });

    /* --- ❸  Persist image metadata (if any) ---------------------- */
    if (images.length) {
      for (const img of images) img.taskId = task.id;        // patch IDs
      await prisma.image.createMany({ data: images });
    }

    const full = await prisma.task.findUnique({
      where: { id: task.id },
      include: { images: true }
    });

    return rep.code(201).send(full);

  });



  /* -----------------------  GET /tasks  ----------------------- */
  f.get('/', async (req: any) => {
    const userId = req.user.sub as number;
    const page = Math.max(Number(req.query.page) || 1, 1); // 1-based
    const take = Math.min(Number(req.query.take) || 50, 100);

    const tasks = await prisma.task.findMany({
      where: { userId },
      skip: (page - 1) * take,
      take,
      orderBy: [
        { status: 'asc' },
        { priority: 'asc' },
        { size: 'asc' },
        { dueAt: 'asc' },
      ],
      include: { images: true },
    });

    return {
      tasks,
      nextPage: tasks.length === take ? page + 1 : null,
    };
  });




  /* GET /tasks/:id – single task for the logged-in user */
  f.get('/:id', async (req: any, rep) => {
    const userId = req.user.sub as number;
    const id = Number(req.params.id);

    const task = await prisma.task.findFirst({
      where: { id, userId },
      include: { images: true },
    });

    if (!task) return rep.code(404).send({ error: 'Task not found' });
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



  /* PATCH /tasks/:id – update fields on a task the user owns */
  f.patch('/:id', async (req: any, rep) => {
    const userId = req.user.sub as number;
    const id = Number(req.params.id);

    /* 1️⃣  Accept a JSON body with only the fields we allow */
    const {
      title,
      description,
      priority,
      status,
      size,
      dueAt,
      timeCapMinutes,
      recurrence,
      recurrenceEvery,
      recurrenceEnd,
      labelDone,
    } = req.body as Partial<{
      title: string;
      description: string;
      priority: Priority;
      status: Status;
      size: Size;
      dueAt: string;
      timeCapMinutes: number;
      recurrence: Recurrence;
      recurrenceEvery: number;
      recurrenceEnd: string;
      labelDone: boolean;
    }>;

    /* 2️⃣  Build the `data` object dynamically so we don't overwrite
           unspecified columns with null / undefined */
    const data: Record<string, any> = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (priority !== undefined) data.priority = priority;
    if (status !== undefined) data.status = status;
    if (size !== undefined) data.size = size;
    if (dueAt !== undefined) data.dueAt = dueAt ? new Date(dueAt) : null;
    if (timeCapMinutes !== undefined) data.timeCapMinutes = timeCapMinutes;
    if (recurrence !== undefined) data.recurrence = recurrence;
    if (recurrenceEvery !== undefined) data.recurrenceEvery = recurrenceEvery;
    if (recurrenceEnd !== undefined) data.recurrenceEnd = recurrenceEnd ? new Date(recurrenceEnd) : null;
    if (labelDone !== undefined) data.labelDone = labelDone;

    /* 3️⃣  Run the update, but only if the task belongs to this user */
    const updated = await prisma.task.updateMany({
      where: { id, userId },
      data,
    });

    if (updated.count === 0) {
      return rep.code(404).send({ error: 'Task not found' });
    }

    /* 4️⃣  Return the fresh record */
    const task = await prisma.task.findUnique({
      where: { id },
      include: { images: true },
    });

    return task;
  });




}, { prefix: '/tasks' });

/* ───── Start server ───── */
const PORT = Number(process.env.PORT) || 3000;
app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`🚀  API ready on 0.0.0.0:${PORT}`);
});
