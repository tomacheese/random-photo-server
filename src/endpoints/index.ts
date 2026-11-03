import { FastifyInstance } from 'fastify'

/**
 * Base class for REST API routers.
 */
export abstract class BaseRouter {
  protected fastify: FastifyInstance

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify
  }

  /**
   * Registers the router's routes via this.fastify.get() / this.fastify.register().
   */
  abstract init(): Promise<void>
}
