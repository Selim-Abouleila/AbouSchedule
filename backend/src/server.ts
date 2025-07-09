import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/', async () => ({ ok: true }));

// ── listen on Railway’s injected PORT and bind to all interfaces ──
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

app.listen({ port: PORT, host: HOST }, err => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`🚀  API ready on http://${HOST}:${PORT}`);
});
