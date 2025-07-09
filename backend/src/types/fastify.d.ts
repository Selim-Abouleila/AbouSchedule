import 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    auth: (
      request: Fastify.FastifyRequest,
      reply: Fastify.FastifyReply
    ) => Promise<void>;
  }
}
