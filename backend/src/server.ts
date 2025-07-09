import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/', async () => ({ ok: true }));

app.listen({ port: 3000 }, err => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info('🚀  Server running on http://localhost:3000');
});
