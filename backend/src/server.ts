/* ───────────────  server.ts  ─────────────── */
import Fastify from 'fastify';
import jwt         from '@fastify/jwt';
import multipart   from '@fastify/multipart';
import { PrismaClient } from '@prisma/client';
import argon2      from 'argon2';
import * as dotenv from 'dotenv';
import { z }       from 'zod';
import { randomUUID } from 'crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client }  from './s3.js';

dotenv.config();

const prisma = new PrismaClient();
const app    = Fastify({ logger: true });

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
  attachFieldsToBody: 'keyValues',               // ← puts text parts into req.body
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



app.register(
  async (f) => {
    f.addHook('preHandler', f.auth);

    /* GET /tasks */
    f.get('/', async (req: any) => {
      return prisma.task.findMany({
        where: { userId: req.user.sub as number },
        orderBy: [{ priority: 'asc' }, { dueAt: 'asc' }],
        include: { images: true },
      });
    });

    /* POST /tasks */
    f.post('/', async (req: any, rep) => {
      const userId = req.user.sub as number;
      const { title, priority, status = 'PENDING', size, dueAt } = req.body ?? {};

      /* 1  create Task */
      const task = await prisma.task.create({
        data: {
          title,
          priority,
          status,
          size,
          dueAt: dueAt ? new Date(dueAt) : undefined,
          userId,
        },
      });

      /* 2  upload images (if any) */
      const images: { taskId: number; url: string; mime: string }[] = [];

      if (req.isMultipart()) {
        for await (const part of req.parts()) {
          if (part.type !== 'file') continue;

          const key = `tasks/${task.id}/${randomUUID()}_${part.filename}`;

          await s3Client.send(
            new PutObjectCommand({
              Bucket: process.env.AWS_BUCKET!,
              Key: key,
              Body: part.file,
              ContentType: part.mimetype,
            })
          );

          images.push({
            taskId: task.id,
            url: `https://${process.env.AWS_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
            mime: part.mimetype,
          });
        }
      }

      if (images.length) {
        await prisma.image.createMany({ data: images });
      }

      const full = await prisma.task.findUnique({
        where: { id: task.id },
        include: { images: true },
      });

      return rep.code(201).send(full);
    });
  },
  { prefix: '/tasks' }
);

/* ───── Start server ───── */
const PORT = Number(process.env.PORT) || 3000;
app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`🚀  API ready on 0.0.0.0:${PORT}`);
});
