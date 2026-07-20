import { FastifyInstance } from 'fastify'

/**
 * REST API ルーターの基底クラス
 */
export abstract class BaseRouter {
  protected fastify: FastifyInstance

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify
  }

  /**
   * ルーターを初期化する
   *
   * this.fastify.get() / this.fastify.register() でルートを登録する
   */
  abstract init(): Promise<void>
}
