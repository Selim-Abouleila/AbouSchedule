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
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

//helpers for sorting
import { SORT_PRESETS } from './lib/helpers';
import { nextDate } from "./lib/recur";
import { startRecurrenceRoller } from "./lib/roll-recurrence"
import { startAdminNotificationChecker } from "./lib/admin-notifications"

// Import Firebase admin to initialize it
import './firebase-admin.js';
import admin from './firebase-admin.js';




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
  limits: { fileSize: 50 * 1024 * 1024 },  // 50 MB per file
});

/* ───── Auth routes ───── */
const RegisterBody = z.object({
  username: z.string().min(3).max(30),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'EMPLOYEE']).default('EMPLOYEE'),
});

app.post('/auth/register', async (req, rep) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    return rep.code(400).send({ error: parsed.error.flatten() });
  }
  const { username, email, password, role } = parsed.data;

  // Check if email is already in use
  if (await prisma.user.findUnique({ where: { email } })) {
    return rep.code(409).send({ error: 'Email already in use' });
  }

  // Check if username is already in use
  if (await prisma.user.findUnique({ where: { username } })) {
    return rep.code(409).send({ error: 'Username already in use' });
  }

  const hash = await argon2.hash(password);
  await prisma.user.create({ data: { username, email, password: hash, role } });
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
    const images: { taskId: number; url: string; mime: string; fileName?: string }[] = [];
    const documents: { taskId: number; url: string; mime: string; fileName?: string }[] = [];
    const videos: { taskId: number; url: string; mime: string; fileName?: string; duration?: number; thumbnail?: string }[] = [];


    /* same loop, just decide where to push */
    if (req.isMultipart()) {
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          const url = await uploadToS3(part, 'tasks/tmp');

          /* Debug: Log the MIME type and filename */
          console.log('File upload:', {
            filename: part.filename,
            mimetype: part.mimetype,
            fieldname: part.fieldname
          });

          /* heuristics: treat PDFs, DOCX, etc. as documents, videos as videos */
          const isDoc = /^(application|text)\//.test(part.mimetype ?? '');
          const isVideo = /^video\//.test(part.mimetype ?? '');

          console.log('File classification:', {
            filename: part.filename,
            isVideo,
            isDoc,
            mimetype: part.mimetype
          });

          if (isVideo) {
            videos.push({
              taskId: 0,                 // patched after .create()
              url,
              mime: part.mimetype,
              fileName: part.filename,
            });
          } else if (isDoc) {
            documents.push({
              taskId: 0,                 // patched after .create()
              url,
              mime: part.mimetype,
              fileName: part.filename,
            });
          } else {
            images.push({
              taskId: 0,                 // patched after .create()
              url,
              mime: part.mimetype,
            });
          }

        } else if (part.type === 'field') {
          fields[part.fieldname] = part.value;
        }
      }
    } else {
      Object.assign(fields, req.body);
    }

    /* Debug: Log what we collected */
    console.log('Collected files:', {
      images: images.length,
      videos: videos.length,
      documents: documents.length
    });

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
    const prevStatus = initStatus !== 'DONE' ? initStatus : null;


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

    /* --- ❸c  Persist video metadata ------------------------------- */
    if (videos.length) {
      for (const vid of videos) vid.taskId = task.id;
      await prisma.video.createMany({ data: videos });
      console.log('✅ Stored videos in database:', videos.length);
    }

    const full = await prisma.task.findUnique({
      where: { id: task.id },
      include: { images: true, documents: true, videos: true }
    });

    return rep.code(201).send(full);

  });



  /* -----------------------  GET /tasks  ----------------------- */
f.get('/', async (req: any, rep) => {
  const userId = req.user.sub as number;

  /* paging */
  const take   = Math.min(Number(req.query.take) || 50, 100);
  const cursor = req.query.cursor ? Number(req.query.cursor) : null;
  const since  = req.query.since ? new Date(req.query.since) : null;

  /* pick preset from query or default */
  const preset  = String(req.query.sort || 'priority');
  const orderBy = SORT_PRESETS[preset] ?? SORT_PRESETS.priority;  // ← array

  const tasks = await prisma.task.findMany({
    where: { 
      userId,
      ...(since && { createdAt: { gt: since } })
    },
    take,
    skip: cursor ? 1 : 0,
    ...(cursor && { cursor: { id: cursor } }),
    orderBy,                               // ✅ now valid
    include: { images: true, documents: true, videos: true },
  });

  const nextCursor =
    tasks.length === take ? tasks[tasks.length - 1].id : null;

  return { tasks, nextCursor };
});


  // GET /media
  f.get('/media', async (req: any) => {
    const userId = req.user.sub as number;

    /* fetch original DB rows */
    const [images, docs, videos] = await Promise.all([
      prisma.image.findMany({ where: { task: { userId } } }),
      prisma.document.findMany({ where: { task: { userId } } }),
      prisma.video.findMany({ where: { task: { userId } } }),
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

    /* generate pre-signed URLs for documents */
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const { GetObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
    
    // Create a new S3 client instance for pre-signed URLs
    const presignerClient = new S3Client({
      region: process.env.AWS_REGION ?? 'eu-north-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    
    const documentsWithSignedUrls = await Promise.all(
      docs.map(async (doc) => {
        try {
          // Extract the key from the S3 URL
          const url = new URL(doc.url);
          const key = url.pathname.substring(1); // Remove leading slash
          
          // Generate pre-signed URL (valid for 1 hour)
          const command = new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET!,
            Key: key,
          });
          
          const signedUrl = await getSignedUrl(presignerClient as any, command, { expiresIn: 3600 });
          
          return {
            ...doc,
            url: signedUrl, // Replace with pre-signed URL
          };
        } catch (error) {
          console.error('Error generating signed URL for document:', error);
          // Return original URL if signing fails
          return doc;
        }
      })
    );

    return { images: thumbImages, documents: documentsWithSignedUrls, videos };
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

  /* 2. fetch exactly what's in the DB */
  const task = await prisma.task.findFirst({
    where: { id: dbId, userId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      size: true,
      dueAt: true,
      timeCapMinutes: true,
      createdAt: true,
      recurrence: true,
      recurrenceEvery: true,
      recurrenceDow: true,
      recurrenceDom: true,
      recurrenceMonth: true,
      lastOccurrence: true,
      nextOccurrence: true,
      recurrenceEnd: true,
      readByUser: true,
      readAt: true,
      wasAddedByAdmin: true,
      labelDone: true,
      requiresCompletionApproval: true,
      images: true,
      documents: true,
      videos: true,
    },
  });

  if (!task) return rep.code(404).send({ error: 'Task not found' });

  /* 2.5. Mark task as read by the user */
  await prisma.task.update({
    where: { id: dbId },
    data: {
      readByUser: true,
      readAt: new Date(),
    },
  });

  /* 3. Generate pre-signed URLs for documents */
  const documentsWithSignedUrls = await Promise.all(
    task.documents.map(async (doc) => {
      try {
        const url = new URL(doc.url);
        const key = url.pathname.substring(1);
        
        const command = new GetObjectCommand({
          Bucket: process.env.AWS_BUCKET!,
          Key: key,
        });
        
        // Create a new S3 client instance for pre-signed URLs
        const presignerClient = new S3Client({
          region: process.env.AWS_REGION ?? 'eu-north-1',
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          },
        });
        
        const signedUrl = await getSignedUrl(presignerClient as any, command, { expiresIn: 3600 });
        
        return {
          ...doc,
          url: signedUrl,
        };
      } catch (error) {
        console.error('Error generating signed URL for document:', error);
        return doc;
      }
    })
  );

  /* 3b. Generate pre-signed URLs for videos */
  const videosWithSignedUrls = await Promise.all(
    task.videos.map(async (vid) => {
      try {
        const url = new URL(vid.url);
        const key = url.pathname.substring(1);
        
        const command = new GetObjectCommand({
          Bucket: process.env.AWS_BUCKET!,
          Key: key,
        });
        
        // Create a new S3 client instance for pre-signed URLs
        const presignerClient = new S3Client({
          region: process.env.AWS_REGION ?? 'eu-north-1',
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          },
        });
        
        const signedUrl = await getSignedUrl(presignerClient as any, command, { expiresIn: 3600 });
        
        return {
          ...vid,
          url: signedUrl,
        };
      } catch (error) {
        console.error('Error generating signed URL for video:', error);
        return vid;
      }
    })
  );

  /* 4. return task with pre-signed document and video URLs */
  return {
    ...task,
    documents: documentsWithSignedUrls,
    videos: videosWithSignedUrls,
  };
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

  /* POST /tasks/:id/mark-done – mark task as done with approval logic */
  f.post('/:id/mark-done', async (req: any, rep) => {
    const userId = req.user.sub as number;
    const id = Number(req.params.id);

    /* Check if task exists and belongs to user */
    const task = await prisma.task.findFirst({
      where: { id, userId },
      select: {
        id: true,
        status: true,
        labelDone: true,
        requiresCompletionApproval: true,
      },
    });

    if (!task) {
      return rep.code(404).send({ error: 'Task not found' });
    }

    /* Check if task is already done */
    if (task.status === 'DONE') {
      return rep.code(400).send({ error: 'Task is already marked as done' });
    }

    /* Check if task already requires approval */
    if (task.requiresCompletionApproval) {
      return rep.code(400).send({ error: 'Task already requires completion approval' });
    }

    /* Update task based on labelDone setting */
    if (task.labelDone) {
      // User can mark as done directly
      await prisma.task.update({
        where: { id },
        data: {
          status: 'DONE',
          isDone: true,
        },
      });
      return { success: true, message: 'Task marked as done' };
    } else {
      // User cannot mark as done, set requires approval
      await prisma.task.update({
        where: { id },
        data: {
          requiresCompletionApproval: true,
        },
      });
      return { success: true, message: 'Task requires completion approval', requiresApproval: true };
    }
  });



  /* -----------------------------------------------------------------
 * PATCH /tasks/:id – update fields and optionally upload / delete images
 * ---------------------------------------------------------------- */
  f.patch("/:id", async (req: any, rep) => {
    const userId = req.user.sub as number;
    const id = Number(req.params.id);

    /* ❶ Read multipart (or JSON) */
    const fields: Record<string, string> = {};
    const newImgs: { taskId: number; url: string; mime: string; fileName?: string }[] = [];
    const newDocs: { taskId: number; url: string; mime: string; fileName?: string }[] = [];
    const newVideos: { taskId: number; url: string; mime: string; fileName?: string; duration?: number; thumbnail?: string }[] = [];

    if (req.isMultipart()) {
      for await (const part of req.parts()) {
        if (part.type === "file") {
          const url = await uploadToS3(part, `tasks/tmp/`);   // helper
          
          /* heuristics: treat PDFs, DOCX, etc. as documents, videos as videos */
          const isDoc = /^(application|text)\//.test(part.mimetype ?? '');
          const isVideo = /^video\//.test(part.mimetype ?? '');

          if (isVideo) {
            newVideos.push({
              taskId: id,
              url,
              mime: part.mimetype,
              fileName: part.filename,
            });
          } else if (isDoc) {
            newDocs.push({ 
              taskId: id, 
              url, 
              mime: part.mimetype,
              fileName: part.filename,
            });
          } else {
            newImgs.push({ 
              taskId: id, 
              url, 
              mime: part.mimetype,
            });
          }
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
      recurrenceEnd, labelDone, runNotification, keep, keepDocs, keepVideos
    } = fields as Partial<{
      title: string; description: string; priority: Priority; status: Status; size: Size;
      dueAt: string; timeCapMinutes: string; recurrence: Recurrence; recurrenceDow: string; recurrenceDom: string; recurrenceMonth: string;
      recurrenceEvery: string; recurrenceEnd: string; labelDone: string; runNotification: string; keep: string; keepDocs: string; keepVideos: string;
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
    if (runNotification !== undefined) data.runNotification = runNotification === "true";




    // set previous status
    /* ── previousStatus logic ─────────────────────────── */
    if (status !== undefined && status !== 'DONE') {
      // only copy when the new status is NOT 'DONE'
      data.previousStatus = status;
    }
    /* ❸a · Check if task was added by admin and prevent regular users from editing */
    const existing = await prisma.task.findUnique({
      where: { id, userId },
      select: {
        dueAt: true,
        recurrence: true,
        recurrenceEvery: true,
        recurrenceDow: true,
        recurrenceDom: true,
        recurrenceMonth: true,
        recurrenceEnd: true,
      },
    });
    if (!existing) return rep.code(404).send({ error: "Task not found" });

    /// ❸b · If the user changed any recurrence field, recompute nextOccurrence */

    const recFieldsChanged =
      recurrence !== undefined ||
      recurrenceEvery !== undefined ||
      recurrenceDow !== undefined ||
      recurrenceDom !== undefined ||
      recurrenceMonth !== undefined;

    if (recFieldsChanged) {
      // pick up either the new dueAt or fall back to the old one or now
      const anchor = data.dueAt ?? existing.dueAt ?? new Date();

      // merge in new or existing recurrence settings
      const everyVal = data.recurrenceEvery ?? existing.recurrenceEvery ?? 1;
      const typeVal = (data.recurrence as Recurrence) ?? existing.recurrence;
      const dowVal = data.recurrenceDow ?? existing.recurrenceDow ?? null;
      const domVal = data.recurrenceDom ?? existing.recurrenceDom ?? null;
      const monthVal = data.recurrenceMonth ?? existing.recurrenceMonth ?? null;

      // re‑run your nextDate helper
      data.nextOccurrence = nextDate(
    /* last */ null,
    /* start */ anchor,
    /* every */ everyVal,
    /* type  */ typeVal,
    /* dow   */ dowVal,
    /* dom   */ domVal,
    /* month */ monthVal,
    /* recDom*/ domVal
      );

      // clear lastOccurrence so it truly restarts
      data.lastOccurrence = null;
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

    /* Videos – delete removed, then add new */
    if (keepVideos !== undefined) {
      const keepVideoIds = keepVideos.split(',').map(Number).filter(Boolean);
      await prisma.video.deleteMany({
        where: { taskId: id, id: { notIn: keepVideoIds } }
      });
    }

    if (newVideos.length) {
      await prisma.video.createMany({ data: newVideos });
    }
    

    /* ❻ Return fresh record */
    const task = await prisma.task.findUnique({
      where: { id },
      include: { images: true, documents: true, videos: true }
    });
    return task;
  });

}, { prefix: '/tasks' });

/* ───── Admin routes ───── */
app.register(async (f) => {
  f.addHook('preHandler', f.auth);

  // Get all users (admin only)
  f.get('/users', async (req: any, rep) => {
    const userRole = req.user.role;
    if (userRole !== 'ADMIN') {
      return rep.code(403).send({ error: 'Admin access required' });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
      },
      orderBy: {
        username: 'asc',
      },
    });
    return users;
  });

  // Get single user by ID (admin only)
  f.get('/users/:id', async (req: any, rep) => {
    const userRole = req.user.role;
    if (userRole !== 'ADMIN') {
      return rep.code(403).send({ error: 'Admin access required' });
    }

    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return rep.code(400).send({ error: 'Invalid user ID' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
      },
    });

    if (!user) {
      return rep.code(404).send({ error: 'User not found' });
    }

    return user;
  });

  // Toggle user role (admin only)
  f.post('/users/:id/toggle-role', async (req: any, rep) => {
    const userRole = req.user.role;
    if (userRole !== 'ADMIN') {
      return rep.code(403).send({ error: 'Admin access required' });
    }

    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return rep.code(400).send({ error: 'Invalid user ID' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return rep.code(404).send({ error: 'User not found' });
    }

    // Prevent admin from demoting themselves
    if (user.id === req.user.sub) {
      return rep.code(400).send({ error: 'Cannot modify your own role' });
    }

    const newRole = user.role === 'ADMIN' ? 'EMPLOYEE' : 'ADMIN';
    await prisma.user.update({
      where: { id: userId },
      data: { role: newRole },
    });

    return { message: 'Role updated successfully' };
  });

  // Delete user (admin only)
  f.post('/users/:id/delete', async (req: any, rep) => {
    const userRole = req.user.role;
    if (userRole !== 'ADMIN') {
      return rep.code(403).send({ error: 'Admin access required' });
    }

    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return rep.code(400).send({ error: 'Invalid user ID' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return rep.code(404).send({ error: 'User not found' });
    }

    // Prevent admin from deleting themselves
    if (user.id === req.user.sub) {
      return rep.code(400).send({ error: 'Cannot delete your own account' });
    }

    // Delete user's tasks first (due to foreign key constraint)
    await prisma.task.deleteMany({
      where: { userId },
    });

    // Delete the user
    await prisma.user.delete({
      where: { id: userId },
    });

    return { message: 'User deleted successfully' };
  });

  // Change user password (admin only)
  f.post('/users/:id/change-password', async (req: any, rep) => {
    const userRole = req.user.role;
    if (userRole !== 'ADMIN') {
      return rep.code(403).send({ error: 'Admin access required' });
    }

    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return rep.code(400).send({ error: 'Invalid user ID' });
    }

    const { newPassword } = req.body as { newPassword: string };
    if (!newPassword || newPassword.length < 6) {
      return rep.code(400).send({ error: 'Password must be at least 6 characters long' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return rep.code(404).send({ error: 'User not found' });
    }

    // Prevent admin from changing their own password through this endpoint
    if (user.id === req.user.sub) {
      return rep.code(400).send({ error: 'Cannot change your own password through admin endpoint' });
    }

    // Hash the new password
    const hash = await argon2.hash(newPassword);
    
    // Update the user's password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hash },
    });

    return { message: 'Password changed successfully' };
  });

  // Get tasks for a specific user (admin only) - similar to regular user endpoint
  f.get('/users/:id/tasks', async (req: any, rep) => {
    const userRole = req.user.role;
    if (userRole !== 'ADMIN') {
      return rep.code(403).send({ error: 'Admin access required' });
    }

    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return rep.code(400).send({ error: 'Invalid user ID' });
    }

    /* paging */
    const take   = Math.min(Number(req.query.take) || 50, 100);
    const cursor = req.query.cursor ? Number(req.query.cursor) : null;

    /* pick preset from query or default */
    const preset  = String(req.query.sort || 'priority');
    const orderBy = SORT_PRESETS[preset] ?? SORT_PRESETS.priority;  // ← array

    const tasks = await prisma.task.findMany({
      where: { userId },
      take,
      skip: cursor ? 1 : 0,
      ...(cursor && { cursor: { id: cursor } }),
      orderBy,                               // ✅ now valid
      include: { 
        images: true, 
        documents: true,
        videos: true,
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            role: true,
          },
        },
      },
    });

    const nextCursor =
      tasks.length === take ? tasks[tasks.length - 1].id : null;

    return { tasks, nextCursor };
  });

  // Create task for a specific user (admin only)
  f.post('/users/:id/tasks', async (req: any, rep) => {
    const userRole = req.user.role;
    if (userRole !== 'ADMIN') {
      return rep.code(403).send({ error: 'Admin access required' });
    }

    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return rep.code(400).send({ error: 'Invalid user ID' });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return rep.code(404).send({ error: 'User not found' });
    }

    /* --- ❶  Collect parts in ONE pass ----------------------------- */
    const fields: Record<string, string> = {};
    const images: { taskId: number; url: string; mime: string }[] = [];
    const documents: { taskId: number; url: string; mime: string; fileName?: string }[] = [];
    const videos: { taskId: number; url: string; mime: string; fileName?: string; duration?: number; thumbnail?: string }[] = [];

    /* same loop, just decide where to push */
    if (req.isMultipart()) {
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          const url = await uploadToS3(part, 'tasks/tmp');

          /* Debug: Log the MIME type and filename */
          console.log('File upload:', {
            filename: part.filename,
            mimetype: part.mimetype,
            fieldname: part.fieldname
          });

          /* heuristics: treat PDFs, DOCX, etc. as documents, videos as videos */
          const isDoc = /^(application|text)\//.test(part.mimetype ?? '');
          const isVideo = /^video\//.test(part.mimetype ?? '');

          console.log('File classification:', {
            filename: part.filename,
            isVideo,
            isDoc,
            mimetype: part.mimetype
          });

          if (isVideo) {
            videos.push({
              taskId: 0,                 // patched after .create()
              url,
              mime: part.mimetype,
              fileName: part.filename,
            });
          } else if (isDoc) {
            documents.push({
              taskId: 0,                 // patched after .create()
              url,
              mime: part.mimetype,
              fileName: part.filename,
            });
          } else {
            images.push({
              taskId: 0,                 // patched after .create()
              url,
              mime: part.mimetype,
            });
          }

        } else if (part.type === 'field') {
          fields[part.fieldname] = part.value;
        }
      }
    } else {
      Object.assign(fields, req.body);
    }

    /* Debug: Log what we collected */
    console.log('Collected files:', {
      images: images.length,
      videos: videos.length,
      documents: documents.length
    });

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

    /* ── 2. work out the first "next" occurrence ───────── */
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
    const prevStatus = initStatus !== 'DONE' ? initStatus : null;

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
        wasAddedByAdmin: true,
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

    /* --- ❸c  Persist video metadata ------------------------------- */
    if (videos.length) {
      for (const vid of videos) vid.taskId = task.id;
      await prisma.video.createMany({ data: videos });
      console.log('✅ Stored videos in database:', videos.length);
    }

    const full = await prisma.task.findUnique({
      where: { id: task.id },
      include: { images: true, documents: true, videos: true }
    });

    // Send notification for immediate tasks
    if (full && full.status === 'ACTIVE' && !full.dueAt) {
      try {
        console.log('🔔 Checking for immediate task notification...');
        console.log('📋 Task details:', { id: full.id, title: full.title, userId: full.userId, status: full.status, dueAt: full.dueAt });
        
        // Get all push tokens for the target user
        const pushTokens = await prisma.pushToken.findMany({
          where: { userId: userId }
        });

        const expoTokens = pushTokens
          .map(pt => pt.token)
          .filter(t => t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['));

        console.log('📱 Found Expo push tokens for user:', expoTokens.length);
        console.log('🔑 Expo tokens:', expoTokens);

        if (expoTokens.length > 0) {
          // Send notification using Expo's push service
          const expoMessages = expoTokens.map(token => ({
            to: token,
            sound: 'default',
            channelId: 'default',
            title: 'New Task Assigned',
            body: `You have a new immediate task: ${full.title}`,
            data: {
              taskId: full.id.toString(),
              type: 'immediate_task'
            }
          }));

          console.log('📤 Sending notification to Expo...');
          console.log('📨 Message payload:', JSON.stringify(expoMessages, null, 2));

          const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Accept-encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(expoMessages)
          });

          const result = await response.json();
          console.log('✅ Expo notification response:', result);
          console.log('📱 Push tokens used:', expoTokens);
          console.log('📋 Task details:', { id: full.id, title: full.title, userId: full.userId });
        } else {
          console.log('❌ No Expo push tokens found for user:', userId);
        }
      } catch (error) {
        console.error('❌ Failed to send notification:', error);
        // Don't fail the task creation if notification fails
      }
    } else {
      console.log('⏭️ Skipping notification - not an immediate task');
      console.log('📋 Task details:', { 
        id: full?.id, 
        title: full?.title, 
        userId: full?.userId, 
        status: full?.status, 
        dueAt: full?.dueAt 
      });
    }

    return rep.code(201).send(full);
  });

  // Update task for a specific user (admin only)
  f.patch('/users/:userId/tasks/:taskId', async (req: any, rep) => {
    const userRole = req.user.role;
    if (userRole !== 'ADMIN') {
      return rep.code(403).send({ error: 'Admin access required' });
    }

    const userId = parseInt(req.params.userId);
    const taskId = parseInt(req.params.taskId);
    
    if (isNaN(userId) || isNaN(taskId)) {
      return rep.code(400).send({ error: 'Invalid user ID or task ID' });
    }

    /* ❶ Read multipart (or JSON) */
    const fields: Record<string, string> = {};
    const newImgs: { taskId: number; url: string; mime: string; fileName?: string }[] = [];
    const newDocs: { taskId: number; url: string; mime: string; fileName?: string }[] = [];
    const newVideos: { taskId: number; url: string; mime: string; fileName?: string; duration?: number; thumbnail?: string }[] = [];

    if (req.isMultipart()) {
      for await (const part of req.parts()) {
        if (part.type === "file") {
          const url = await uploadToS3(part, `tasks/tmp/`);   // helper
          
          /* heuristics: treat PDFs, DOCX, etc. as documents, videos as videos */
          const isDoc = /^(application|text)\//.test(part.mimetype ?? '');
          const isVideo = /^video\//.test(part.mimetype ?? '');

          if (isVideo) {
            newVideos.push({
              taskId,
              url,
              mime: part.mimetype,
              fileName: part.filename,
            });
          } else if (isDoc) {
            newDocs.push({ 
              taskId, 
              url, 
              mime: part.mimetype,
              fileName: part.filename,
            });
          } else {
            newImgs.push({ 
              taskId, 
              url, 
              mime: part.mimetype,
            });
          }
        } else if (part.type === "field") {
          fields[part.fieldname] = part.value;
        }
      }
    } else {
      Object.assign(fields, req.body);                         // JSON / url‑encoded
    }

    /* ❷ Extract scalars */
    const {
      title, description, priority, status, size,
      dueAt, timeCapMinutes, recurrence, recurrenceDow, recurrenceDom, recurrenceMonth, recurrenceEvery,
      recurrenceEnd, labelDone, runNotification, keep, keepDocs, keepVideos
    } = fields as Partial<{
      title: string; description: string; priority: Priority; status: Status; size: Size;
      dueAt: string; timeCapMinutes: string; recurrence: Recurrence; recurrenceDow: string; recurrenceDom: string; recurrenceMonth: string;
      recurrenceEvery: string; recurrenceEnd: string; labelDone: string; runNotification: string; keep: string; keepDocs: string; keepVideos: string;
    }>;

    /* ❸ Build `data` dynamically */
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
    if (recurrenceDow !== undefined) {
      if (recurrenceDow === null || recurrenceDow === "null" || recurrenceDow === "") {
        data.recurrenceDow = null;
      } else {
        data.recurrenceDow = Number(recurrenceDow);
      }
    }
    if (recurrenceMonth !== undefined) {
      if (recurrenceMonth === null || recurrenceMonth === "null" || recurrenceMonth === "") {
        data.recurrenceMonth = null;
      } else {
        data.recurrenceMonth = Number(recurrenceMonth);
      }
    }
    if (recurrenceDom !== undefined) {
      if (recurrenceDom === null || recurrenceDom === "null" || recurrenceDom === "") {
        data.recurrenceDom = null;
      } else {
        data.recurrenceDom = Number(recurrenceDom);
      }
    }
    if (recurrenceEnd !== undefined) data.recurrenceEnd = recurrenceEnd ? new Date(recurrenceEnd) : null;
    if (labelDone !== undefined) data.labelDone = labelDone === "true";

    // set previous status
    /* ── previousStatus logic ─────────────────────────── */
    if (status !== undefined && status !== 'DONE') {
      // only copy when the new status is NOT 'DONE'
      data.previousStatus = status;
    }

    /// ❸b · If the user changed any recurrence field, recompute nextOccurrence
    const existing = await prisma.task.findUnique({
      where: { id: taskId, userId },
      select: {
        dueAt: true,
        recurrence: true,
        recurrenceEvery: true,
        recurrenceDow: true,
        recurrenceDom: true,
        recurrenceMonth: true,
        recurrenceEnd: true,
      },
    });
    if (!existing) return rep.code(404).send({ error: "Task not found" });

    const recFieldsChanged =
      recurrence !== undefined ||
      recurrenceEvery !== undefined ||
      recurrenceDow !== undefined ||
      recurrenceDom !== undefined ||
      recurrenceMonth !== undefined;

    if (recFieldsChanged) {
      // pick up either the new dueAt or fall back to the old one or now
      const anchor = data.dueAt ?? existing.dueAt ?? new Date();

      // merge in new or existing recurrence settings
      const everyVal = data.recurrenceEvery ?? existing.recurrenceEvery ?? 1;
      const typeVal = (data.recurrence as Recurrence) ?? existing.recurrence;
      const dowVal = data.recurrenceDow ?? existing.recurrenceDow ?? null;
      const domVal = data.recurrenceDom ?? existing.recurrenceDom ?? null;
      const monthVal = data.recurrenceMonth ?? existing.recurrenceMonth ?? null;

      // re‑run your nextDate helper
      data.nextOccurrence = nextDate(
    /* last */ null,
    /* start */ anchor,
    /* every */ everyVal,
    /* type  */ typeVal,
    /* dow   */ dowVal,
    /* dom   */ domVal,
    /* month */ monthVal,
    /* recDom*/ domVal
      );

      // clear lastOccurrence so it truly restarts
      data.lastOccurrence = null;
    }

    /* ❹ Update row only if it belongs to the user */
    const upd = await prisma.task.updateMany({ where: { id: taskId, userId }, data });
    if (upd.count === 0) return rep.code(404).send({ error: "Task not found" });
    
    /* ❺ Images – delete removed, then add new */
    if (keep !== undefined) {
      const keepIds = keep.split(',').map(Number).filter(Boolean);

      await prisma.image.deleteMany({
        where: { taskId, id: { notIn: keepIds } }
      });
    }

    if (newImgs.length) {
      await prisma.image.createMany({ data: newImgs });
    }

    if (keepDocs !== undefined) {
      const ids = keepDocs.split(',').map(Number).filter(Boolean);
      await prisma.document.deleteMany({
        where: { taskId, id: { notIn: ids } }
      });
    }

    if (newDocs.length) {
      await prisma.document.createMany({ data: newDocs });
    }

    /* Videos – delete removed, then add new */
    if (keepVideos !== undefined) {
      const keepVideoIds = keepVideos.split(',').map(Number).filter(Boolean);
      await prisma.video.deleteMany({
        where: { taskId, id: { notIn: keepVideoIds } }
      });
    }

    if (newVideos.length) {
      await prisma.video.createMany({ data: newVideos });
    }
    
    /* ❻ Return fresh record */
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { images: true, documents: true, videos: true }
    });
    return task;
  });

  // Delete task for a specific user (admin only)
  f.delete('/users/:userId/tasks/:taskId', async (req: any, rep) => {
    const userRole = req.user.role;
    if (userRole !== 'ADMIN') {
      return rep.code(403).send({ error: 'Admin access required' });
    }

    const userId = parseInt(req.params.userId);
    const taskId = parseInt(req.params.taskId);
    
    if (isNaN(userId) || isNaN(taskId)) {
      return rep.code(400).send({ error: 'Invalid user ID or task ID' });
    }

    /* delete and make sure it belonged to this user */
    const deleted = await prisma.task.deleteMany({
      where: { id: taskId, userId },
    });

    if (deleted.count === 0) {
      return rep.code(404).send({ error: 'Task not found' });
    }
    // Images go automatically because Image.task has onDelete: Cascade
    return { ok: true };
  });

  // GET /media/:userId - Get media for a specific user (admin only)
  f.get('/media/:userId', async (req: any, rep) => {
    const userRole = req.user.role;
    if (userRole !== 'ADMIN') {
      return rep.code(403).send({ error: 'Admin access required' });
    }

    const targetUserId = parseInt(req.params.userId);
    if (isNaN(targetUserId)) {
      return rep.code(400).send({ error: 'Invalid user ID' });
    }

    // Check if target user exists
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      return rep.code(404).send({ error: 'User not found' });
    }

    /* fetch original DB rows for the target user */
    const [images, docs, videos] = await Promise.all([
      prisma.image.findMany({ where: { task: { userId: targetUserId } } }),
      prisma.document.findMany({ where: { task: { userId: targetUserId } } }),
      prisma.video.findMany({ where: { task: { userId: targetUserId } } }),
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

    /* generate pre-signed URLs for documents */
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const { GetObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
    
    // Create a new S3 client instance for pre-signed URLs
    const presignerClient = new S3Client({
      region: process.env.AWS_REGION ?? 'eu-north-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    
    const documentsWithSignedUrls = await Promise.all(
      docs.map(async (doc) => {
        try {
          // Extract the key from the S3 URL
          const url = new URL(doc.url);
          const key = url.pathname.substring(1); // Remove leading slash
          
          // Generate pre-signed URL (valid for 1 hour)
          const command = new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET!,
            Key: key,
          });
          
          const signedUrl = await getSignedUrl(presignerClient as any, command, { expiresIn: 3600 });
          
          return {
            ...doc,
            url: signedUrl, // Replace with pre-signed URL
          };
        } catch (error) {
          console.error('Error generating signed URL for document:', error);
          // Return original URL if signing fails
          return doc;
        }
      })
    );

    /* Generate pre-signed URLs for videos */
    const videosWithSignedUrls = await Promise.all(
      videos.map(async (vid) => {
        try {
          const url = new URL(vid.url);
          const key = url.pathname.substring(1);
          
          const command = new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET!,
            Key: key,
          });
          
          const signedUrl = await getSignedUrl(presignerClient as any, command, { expiresIn: 3600 });
          
          return {
            ...vid,
            url: signedUrl,
          };
        } catch (error) {
          console.error('Error generating signed URL for video:', error);
          return vid;
        }
      })
    );

    return { 
      images: thumbImages, 
      documents: documentsWithSignedUrls,
      videos: videosWithSignedUrls,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        username: targetUser.username,
        role: targetUser.role,
      }
    };
  });

  // Get a specific task for a user (admin only)
  f.get('/users/:userId/tasks/:taskId', async (req: any, rep) => {
    const userRole = req.user.role;
    if (userRole !== 'ADMIN') {
      return rep.code(403).send({ error: 'Admin access required' });
    }

    const userId = parseInt(req.params.userId);
    const taskId = parseInt(req.params.taskId);
    
    if (isNaN(userId) || isNaN(taskId)) {
      return rep.code(400).send({ error: 'Invalid user ID or task ID' });
    }

    const task = await prisma.task.findFirst({
      where: { id: taskId, userId },
      include: { 
        images: true, 
        documents: true,
        videos: true,
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            role: true,
          },
        },
      },
    });

    if (!task) return rep.code(404).send({ error: 'Task not found' });

    /* Generate pre-signed URLs for documents */
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const { GetObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
    
    // Create a new S3 client instance for pre-signed URLs
    const presignerClient = new S3Client({
      region: process.env.AWS_REGION ?? 'eu-north-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    
    const documentsWithSignedUrls = await Promise.all(
      task.documents.map(async (doc) => {
        try {
          const url = new URL(doc.url);
          const key = url.pathname.substring(1);
          
          const command = new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET!,
            Key: key,
          });
          
          const signedUrl = await getSignedUrl(presignerClient as any, command, { expiresIn: 3600 });
          
          return {
            ...doc,
            url: signedUrl,
          };
        } catch (error) {
          console.error('Error generating signed URL for document:', error);
          return doc;
        }
      })
    );

    /* Generate pre-signed URLs for videos */
    const videosWithSignedUrls = await Promise.all(
      task.videos.map(async (vid) => {
        try {
          const url = new URL(vid.url);
          const key = url.pathname.substring(1);
          
          const command = new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET!,
            Key: key,
          });
          
          const signedUrl = await getSignedUrl(presignerClient as any, command, { expiresIn: 3600 });
          
          return {
            ...vid,
            url: signedUrl,
          };
        } catch (error) {
          console.error('Error generating signed URL for video:', error);
          return vid;
        }
      })
    );

    /* return task with pre-signed document and video URLs and user data */
    return {
      ...task,
      documents: documentsWithSignedUrls,
      videos: videosWithSignedUrls,
      user: task.user, // Ensure user data is explicitly included
    };
  });

  // GET /media/all - Get all media for all users (admin only)
  f.get('/media/all', async (req: any, rep) => {
    try {
      const userRole = req.user.role;
      if (userRole !== 'ADMIN') {
        return rep.code(403).send({ error: 'Admin access required' });
      }

      console.log('Fetching all media for admin user');

      /* fetch all media from all users */
      const [images, docs] = await Promise.all([
        prisma.image.findMany({ 
          include: { 
            task: { 
              include: { 
                user: { 
                  select: { id: true, email: true, username: true, role: true } 
                } 
              } 
            } 
          } 
        }),
        prisma.document.findMany({ 
          include: { 
            task: { 
              include: { 
                user: { 
                  select: { id: true, email: true, username: true, role: true } 
                } 
              } 
            } 
          } 
        }),
      ]);

          console.log(`Found ${images.length} images and ${docs.length} documents`);

      /* add thumbUrl for each image row */
      const thumbImages = images.map(img => ({
        ...img,
        thumbUrl: `${img.url}?w=200&h=200&fit=cover`,
      }));

      console.log('Processing images and documents...');

    /* generate pre-signed URLs for documents */
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const { GetObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
    
    // Create a new S3 client instance for pre-signed URLs
    const presignerClient = new S3Client({
      region: process.env.AWS_REGION ?? 'eu-north-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    
    const documentsWithSignedUrls = await Promise.all(
      docs.map(async (doc) => {
        try {
          // Extract the key from the S3 URL
          const url = new URL(doc.url);
          const key = url.pathname.substring(1); // Remove leading slash
          
          // Generate pre-signed URL (valid for 1 hour)
          const command = new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET!,
            Key: key,
          });
          
          const signedUrl = await getSignedUrl(presignerClient as any, command, { expiresIn: 3600 });
          
          return {
            ...doc,
            url: signedUrl, // Replace with pre-signed URL
          };
        } catch (error) {
          console.error('Error generating signed URL for document:', error);
          // Return original URL if signing fails
          return doc;
        }
      })
    );

    return { 
      images: thumbImages, 
      documents: documentsWithSignedUrls,
      totalUsers: new Set([
        ...images.map(img => img.task?.user?.id).filter(Boolean), 
        ...docs.map(doc => doc.task?.user?.id).filter(Boolean)
      ]).size
    };
    } catch (error) {
      console.error('Error in /media/all endpoint:', error);
      return rep.code(500).send({ error: 'Internal server error' });
    }
  });

  // Admin notification ignore endpoint - disable notifications for a specific task
  f.post('/tasks/:id/ignore-notifications', async (req: any, rep) => {
    const userRole = req.user.role;
    if (userRole !== 'ADMIN') {
      return rep.code(403).send({ error: 'Admin access required' });
    }

    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) {
      return rep.code(400).send({ error: 'Invalid task ID' });
    }

    try {
      // Check if task exists
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          title: true,
          runNotification: true,
        },
      });

      if (!task) {
        return rep.code(404).send({ error: 'Task not found' });
      }

      // Update the task to disable notifications
      await prisma.task.update({
        where: { id: taskId },
        data: { runNotification: false },
      });

      console.log(`🔕 Admin disabled notifications for task ${taskId} (${task.title})`);

      return { 
        success: true, 
        message: 'Notifications disabled for this task',
        taskId: taskId,
        taskTitle: task.title
      };
    } catch (error) {
      console.error('Error disabling notifications for task:', error);
      return rep.code(500).send({ error: 'Failed to disable notifications' });
    }
  });

}, { prefix: '/admin' });

/* ───── Settings Management ───── */
app.get('/settings', { preHandler: app.auth }, async (req, rep) => {
  try {
    const userId = (req.user as any).sub as number;
    const userRole = (req.user as any).role as string;

    // Get settings for the current user
    let settings = await prisma.settings.findUnique({
      where: { userId },
    });

    // If no user-specific settings, get global settings
    if (!settings) {
      settings = await prisma.settings.findFirst({
        where: { userId: undefined },
      });
    }

    // If no settings exist at all, return defaults
    if (!settings) {
      return {
        defaultLabelDone: true,
      };
    }

    return {
      defaultLabelDone: settings.defaultLabelDone,
    };
  } catch (error) {
    console.error('Error getting settings:', error);
    return rep.code(500).send({ error: 'Failed to get settings' });
  }
});

app.put('/settings', { preHandler: app.auth }, async (req, rep) => {
  try {
    const userId = (req.user as any).sub as number;
    const { defaultLabelDone } = req.body as { defaultLabelDone: boolean };

    // Upsert settings for the current user
    const settings = await prisma.settings.upsert({
      where: { userId },
      update: { defaultLabelDone },
      create: { userId, defaultLabelDone },
    });

    return { 
      defaultLabelDone: settings.defaultLabelDone,
    };
  } catch (error) {
    console.error('Error updating settings:', error);
    return rep.code(500).send({ error: 'Failed to update settings' });
  }
});

// Admin-only endpoints for managing other users' settings

// Admin mark-done endpoint - can mark any task as done
app.post('/admin/tasks/:id/mark-done', { preHandler: app.auth }, async (req: any, rep) => {
  try {
    const userRole = (req.user as any).role as string;
    if (userRole !== 'ADMIN') {
      return rep.code(403).send({ error: 'Admin access required' });
    }

    const taskId = parseInt(req.params.id as string);
    if (isNaN(taskId)) {
      return rep.code(400).send({ error: 'Invalid task ID' });
    }

    /* Check if task exists */
    const task = await prisma.task.findFirst({
      where: { id: taskId },
      select: {
        id: true,
        status: true,
        requiresCompletionApproval: true,
      },
    });

    if (!task) {
      return rep.code(404).send({ error: 'Task not found' });
    }

    /* Check if task is already done */
    if (task.status === 'DONE') {
      return rep.code(400).send({ error: 'Task is already marked as done' });
    }

    /* Admin can mark any task as done */
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'DONE',
        isDone: true,
        requiresCompletionApproval: false, // Clear any pending approval
      },
    });

    return { success: true, message: 'Task marked as done by admin' };
  } catch (error) {
    console.error('Error marking task as done:', error);
    return rep.code(500).send({ error: 'Failed to mark task as done' });
  }
});
app.get('/admin/settings/:userId', { preHandler: app.auth }, async (req: any, rep) => {
  try {
    const userRole = (req.user as any).role as string;
    if (userRole !== 'ADMIN') {
      return rep.code(403).send({ error: 'Admin access required' });
    }

    const targetUserId = parseInt(req.params.userId as string);
    if (isNaN(targetUserId)) {
      return rep.code(400).send({ error: 'Invalid user ID' });
    }

    // Get settings for the target user
    let settings = await prisma.settings.findUnique({
      where: { userId: targetUserId },
    });

    // If no user-specific settings, get global settings
    if (!settings) {
      settings = await prisma.settings.findFirst({
        where: { userId: undefined },
      });
    }

    // If no settings exist at all, return defaults
    if (!settings) {
      return {
        defaultLabelDone: true,
      };
    }

    return {
      defaultLabelDone: settings.defaultLabelDone,
    };
  } catch (error) {
    console.error('Error getting user settings:', error);
    return rep.code(500).send({ error: 'Failed to get user settings' });
  }
});

app.put('/admin/settings/:userId', { preHandler: app.auth }, async (req: any, rep) => {
  try {
    const userRole = (req.user as any).role as string;
    if (userRole !== 'ADMIN') {
      return rep.code(403).send({ error: 'Admin access required' });
    }

    const targetUserId = parseInt(req.params.userId as string);
    if (isNaN(targetUserId)) {
      return rep.code(400).send({ error: 'Invalid user ID' });
    }

    const { defaultLabelDone } = req.body as { defaultLabelDone: boolean };

    // Upsert settings for the target user
    const settings = await prisma.settings.upsert({
      where: { userId: targetUserId },
      update: { defaultLabelDone },
      create: { userId: targetUserId, defaultLabelDone },
    });

    return { 
      defaultLabelDone: settings.defaultLabelDone,
    };
  } catch (error) {
    console.error('Error updating user settings:', error);
    return rep.code(500).send({ error: 'Failed to update user settings' });
  }
});

// Global settings management (admin only)
app.get('/admin/settings/global', { preHandler: app.auth }, async (req, rep) => {
  try {
    const userRole = (req.user as any).role as string;
    if (userRole !== 'ADMIN') {
      return rep.code(403).send({ error: 'Admin access required' });
    }

    // Get global settings
    let settings = await prisma.settings.findFirst({
      where: { userId: undefined },
    });

    // If no global settings exist, return defaults
    if (!settings) {
      return {
        defaultLabelDone: true,
      };
    }

    return {
      defaultLabelDone: settings.defaultLabelDone,
    };
  } catch (error) {
    console.error('Error getting global settings:', error);
    return rep.code(500).send({ error: 'Failed to get global settings' });
  }
});

app.put('/admin/settings/global', { preHandler: app.auth }, async (req, rep) => {
  try {
    const userRole = (req.user as any).role as string;
    if (userRole !== 'ADMIN') {
      return rep.code(403).send({ error: 'Admin access required' });
    }

    const { defaultLabelDone } = req.body as { defaultLabelDone: boolean };

    // Upsert global settings
    const settings = await prisma.settings.upsert({
      where: { userId: undefined },
      update: { defaultLabelDone },
      create: { userId: undefined, defaultLabelDone },
    });

    return { 
      defaultLabelDone: settings.defaultLabelDone,
    };
  } catch (error) {
    console.error('Error updating global settings:', error);
    return rep.code(500).send({ error: 'Failed to update global settings' });
  }
});

/* ───── Push Token Management ───── */
app.post('/push-tokens/register', { preHandler: app.auth }, async (req, rep) => {
  try {
    const { token } = req.body as { token: string };
    const userId = (req.user as any).sub as number;

    if (!token) {
      return rep.code(400).send({ error: 'Push token is required' });
    }

    // Upsert the token (create or update)
    await prisma.pushToken.upsert({
      where: { token },
      update: { userId },
      create: { token, userId }
    });

    return { success: true, message: 'Push token registered successfully' };
  } catch (error) {
    console.error('Error registering push token:', error);
    return rep.code(500).send({ error: 'Failed to register push token' });
  }
});

app.delete('/push-tokens/unregister', { preHandler: app.auth }, async (req, rep) => {
  try {
    const { token } = req.body as { token: string };
    const userId = (req.user as any).sub as number;

    if (!token) {
      return rep.code(400).send({ error: 'Push token is required' });
    }

    // Delete the token
    await prisma.pushToken.deleteMany({
      where: { token, userId }
    });

    return { success: true, message: 'Push token unregistered successfully' };
  } catch (error) {
    console.error('Error unregistering push token:', error);
    return rep.code(500).send({ error: 'Failed to unregister push token' });
  }
});



startRecurrenceRoller();
startAdminNotificationChecker();

/* ───── Start server ───── */
const PORT = Number(process.env.PORT) || 3000;
app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`🚀  API ready on 0.0.0.0:${PORT}`);
});