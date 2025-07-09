import Fastify from 'fastify';
import fp       from 'fastify-plugin';
import jwt      from '@fastify/jwt';
import { PrismaClient } from '@prisma/client';
import argon2   from 'argon2';
import * as dotenv from 'dotenv';
import { z } from 'zod';
dotenv.config();

const prisma = new PrismaClient();
const app = Fastify({ logger: true });

/* ───── Root ping (unchanged) ───── */
app.get('/', () => ({ ok: true }));

/* ───── JWT plugin ───── */
app.register(jwt, { secret: process.env.JWT_SECRET || 'dev-secret' });
app.decorate('auth', async (req: any, rep: any) => {
  try { await req.jwtVerify(); }
  catch { rep.code(401).send({ error: 'Unauthorized' }); }
});

/* ───── Login route ───── */
app.post('/auth/login', async (req, rep) => {
  const { email, password } = req.body as { email: string; password: string };
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await argon2.verify(user.password, password))) {
    return rep.code(401).send({ error: 'Bad credentials' });
  }
  const token = app.jwt.sign({ sub: user.id, role: user.role });
  return { token };
});

const RegisterBody = z.object({
  email:    z.string().email(),
  password: z.string().min(6),
  role:     z.enum(['ADMIN', 'EMPLOYEE']).default('EMPLOYEE'),
});

app.post('/auth/register', async (req, rep) => {
  // 1  validate
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    return rep.code(400).send({ error: parsed.error.flatten() });
  }
  const { email, password, role } = parsed.data;

  // 2  check uniqueness
  if (await prisma.user.findUnique({ where: { email } })) {
    return rep.code(409).send({ error: 'Email already in use' });
  }

  // 3  hash & save
  const hash = await argon2.hash(password);
  await prisma.user.create({ data: { email, password: hash, role } });

  return rep.code(201).send({ ok: true });
});

/* ───── Task routes ───── */
app.register(fp(async instance => {
  instance.addHook('preHandler', instance.auth);

  instance.get('/tasks', async (req: any) => {
    const userId = req.user.sub as number;
    return prisma.task.findMany({
      where: { userId },
      orderBy: [{ priority: 'asc' }, { dueAt: 'asc' }],
    });
  });

  instance.post('/tasks', async (req: any, rep) => {
    const userId = req.user.sub as number;
    const { title, priority, dueAt } = req.body as any;
    const task = await prisma.task.create({
      data: { title, priority, dueAt, userId },
    });
    rep.code(201).send(task);
  });
}));

/* ───── Start server ───── */
const PORT = Number(process.env.PORT) || 3000;
app.listen({ port: PORT, host: '0.0.0.0' }, err => {
  if (err) { app.log.error(err); process.exit(1); }
  app.log.info(`🚀  API ready on 0.0.0.0:${PORT}`);
});
