/**
 * Rotas para gerenciamento de migrações de esquemas
 */

const express = require('express')
const router = express.Router()
const { body, param, query, validationResult } = require('express-validator')

// Middleware de validação
const validateRequest = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Dados de entrada inválidos',
      details: errors.array()
    })
  }
  next()
}

/**
 * @swagger
 * /api/v1/migration/plan:
 *   post:
 *     summary: Criar plano de migração
 *     tags: [Migration]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subject
 *               - fromVersion
 *               - toVersion
 *             properties:
 *               subject:
 *                 type: string
 *                 description: Nome do subject do esquema
 *               fromVersion:
 *                 type: string
 *                 description: Versão de origem
 *               toVersion:
 *                 type: string
 *                 description: Versão de destino
 *               options:
 *                 type: object
 *                 properties:
 *                   dryRun:
 *                     type: boolean
 *                     default: false
 *                   batchSize:
 *                     type: integer
 *                     default: 100
 *                   timeout:
 *                     type: integer
 *                     default: 300000
 *     responses:
 *       200:
 *         description: Plano de migração criado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 planId:
 *                   type: string
 *                 subject:
 *                   type: string
 *                 fromVersion:
 *                   type: integer
 *                 toVersion:
 *                   type: integer
 *                 steps:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       type:
 *                         type: string
 *                       description:
 *                         type: string
 *                       estimatedDuration:
 *                         type: integer
 *                       dependencies:
 *                         type: array
 *                         items:
 *                           type: string
 *                 estimatedDuration:
 *                   type: integer
 *                 risks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       level:
 *                         type: string
 *                       description:
 *                         type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Dados de entrada inválidos
 *       404:
 *         description: Versão não encontrada
 *       409:
 *         description: Migração não é possível
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/plan',
  [
    body('subject').notEmpty().withMessage('Subject é obrigatório'),
    body('fromVersion').notEmpty().withMessage('Versão de origem é obrigatória'),
    body('toVersion').notEmpty().withMessage('Versão de destino é obrigatória'),
    body('options.dryRun').optional().isBoolean().withMessage('dryRun deve ser boolean'),
    body('options.batchSize').optional().isInt({ min: 1, max: 1000 }).withMessage('batchSize deve ser entre 1 e 1000'),
    body('options.timeout').optional().isInt({ min: 1000 }).withMessage('timeout deve ser pelo menos 1000ms')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { subject, fromVersion, toVersion, options = {} } = req.body
      
      const plan = await req.services.migration.createMigrationPlan(
        subject,
        fromVersion,
        toVersion,
        options
      )
      
      if (!plan.success) {
        if (plan.error === 'VERSION_NOT_FOUND') {
          return res.status(404).json({
            error: 'Uma das versões não foi encontrada',
            subject,
            fromVersion,
            toVersion
          })
        }
        
        if (plan.error === 'MIGRATION_NOT_POSSIBLE') {
          return res.status(409).json({
            error: 'Migração não é possível',
            reason: plan.reason,
            subject,
            fromVersion,
            toVersion
          })
        }
        
        return res.status(400).json({
          error: plan.error,
          details: plan.details
        })
      }
      
      res.json(plan.data)
    } catch (error) {
      req.logger.error('Erro ao criar plano de migração:', error)
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      })
    }
  }
)

/**
 * @swagger
 * /api/v1/migration/execute:
 *   post:
 *     summary: Executar migração
 *     tags: [Migration]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - planId
 *             properties:
 *               planId:
 *                 type: string
 *                 description: ID do plano de migração
 *               options:
 *                 type: object
 *                 properties:
 *                   async:
 *                     type: boolean
 *                     default: true
 *                   notifyOnComplete:
 *                     type: boolean
 *                     default: false
 *                   rollbackOnError:
 *                     type: boolean
 *                     default: true
 *     responses:
 *       200:
 *         description: Migração iniciada ou concluída
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 executionId:
 *                   type: string
 *                 planId:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [started, completed, failed]
 *                 startedAt:
 *                   type: string
 *                   format: date-time
 *                 completedAt:
 *                   type: string
 *                   format: date-time
 *                 progress:
 *                   type: object
 *                   properties:
 *                     completed:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     percentage:
 *                       type: number
 *                 results:
 *                   type: object
 *                   properties:
 *                     migratedRecords:
 *                       type: integer
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: object
 *       404:
 *         description: Plano de migração não encontrado
 *       409:
 *         description: Migração já em execução
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/execute',
  [
    body('planId').notEmpty().withMessage('ID do plano é obrigatório'),
    body('options.async').optional().isBoolean().withMessage('async deve ser boolean'),
    body('options.notifyOnComplete').optional().isBoolean().withMessage('notifyOnComplete deve ser boolean'),
    body('options.rollbackOnError').optional().isBoolean().withMessage('rollbackOnError deve ser boolean')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { planId, options = {} } = req.body
      
      const execution = await req.services.migration.executeMigration(planId, options)
      
      if (!execution.success) {
        if (execution.error === 'PLAN_NOT_FOUND') {
          return res.status(404).json({
            error: 'Plano de migração não encontrado',
            planId
          })
        }
        
        if (execution.error === 'MIGRATION_IN_PROGRESS') {
          return res.status(409).json({
            error: 'Migração já em execução',
            planId,
            executionId: execution.executionId
          })
        }
        
        return res.status(400).json({
          error: execution.error,
          details: execution.details
        })
      }
      
      res.json(execution.data)
    } catch (error) {
      req.logger.error('Erro ao executar migração:', error)
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      })
    }
  }
)

/**
 * @swagger
 * /api/v1/migration/status/{executionId}:
 *   get:
 *     summary: Obter status de execução de migração
 *     tags: [Migration]
 *     parameters:
 *       - in: path
 *         name: executionId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID da execução da migração
 *     responses:
 *       200:
 *         description: Status da migração
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 executionId:
 *                   type: string
 *                 planId:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [pending, running, completed, failed, cancelled]
 *                 startedAt:
 *                   type: string
 *                   format: date-time
 *                 completedAt:
 *                   type: string
 *                   format: date-time
 *                 progress:
 *                   type: object
 *                   properties:
 *                     completed:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     percentage:
 *                       type: number
 *                     currentStep:
 *                       type: string
 *                 results:
 *                   type: object
 *                   properties:
 *                     migratedRecords:
 *                       type: integer
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: object
 *                     warnings:
 *                       type: array
 *                       items:
 *                         type: object
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       level:
 *                         type: string
 *                       message:
 *                         type: string
 *       404:
 *         description: Execução não encontrada
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/status/:executionId',
  [
    param('executionId').notEmpty().withMessage('ID da execução é obrigatório')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { executionId } = req.params
      
      const status = await req.services.migration.getMigrationStatus(executionId)
      
      if (!status) {
        return res.status(404).json({
          error: 'Execução de migração não encontrada',
          executionId
        })
      }
      
      res.json(status)
    } catch (error) {
      req.logger.error('Erro ao obter status da migração:', error)
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      })
    }
  }
)

/**
 * @swagger
 * /api/v1/migration/cancel/{executionId}:
 *   post:
 *     summary: Cancelar execução de migração
 *     tags: [Migration]
 *     parameters:
 *       - in: path
 *         name: executionId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID da execução da migração
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Motivo do cancelamento
 *               rollback:
 *                 type: boolean
 *                 default: true
 *                 description: Fazer rollback das alterações
 *     responses:
 *       200:
 *         description: Migração cancelada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 executionId:
 *                   type: string
 *                 cancelledAt:
 *                   type: string
 *                   format: date-time
 *                 rollbackStatus:
 *                   type: string
 *       404:
 *         description: Execução não encontrada
 *       409:
 *         description: Não é possível cancelar
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/cancel/:executionId',
  [
    param('executionId').notEmpty().withMessage('ID da execução é obrigatório'),
    body('reason').optional().isString().withMessage('Motivo deve ser uma string'),
    body('rollback').optional().isBoolean().withMessage('rollback deve ser boolean')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { executionId } = req.params
      const { reason, rollback = true } = req.body
      
      const result = await req.services.migration.cancelMigration(executionId, {
        reason,
        rollback
      })
      
      if (!result.success) {
        if (result.error === 'EXECUTION_NOT_FOUND') {
          return res.status(404).json({
            error: 'Execução de migração não encontrada',
            executionId
          })
        }
        
        if (result.error === 'CANNOT_CANCEL') {
          return res.status(409).json({
            error: 'Não é possível cancelar a migração',
            reason: result.reason,
            executionId
          })
        }
        
        return res.status(400).json({
          error: result.error,
          details: result.details
        })
      }
      
      res.json({
        message: 'Migração cancelada com sucesso',
        executionId,
        cancelledAt: new Date().toISOString(),
        rollbackStatus: result.rollbackStatus
      })
    } catch (error) {
      req.logger.error('Erro ao cancelar migração:', error)
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      })
    }
  }
)

/**
 * @swagger
 * /api/v1/migration/history:
 *   get:
 *     summary: Obter histórico de migrações
 *     tags: [Migration]
 *     parameters:
 *       - in: query
 *         name: subject
 *         schema:
 *           type: string
 *         description: Filtrar por subject
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, running, completed, failed, cancelled]
 *         description: Filtrar por status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Página para paginação
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Limite de itens por página
 *     responses:
 *       200:
 *         description: Histórico de migrações
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 migrations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       executionId:
 *                         type: string
 *                       planId:
 *                         type: string
 *                       subject:
 *                         type: string
 *                       fromVersion:
 *                         type: integer
 *                       toVersion:
 *                         type: integer
 *                       status:
 *                         type: string
 *                       startedAt:
 *                         type: string
 *                         format: date-time
 *                       completedAt:
 *                         type: string
 *                         format: date-time
 *                       duration:
 *                         type: integer
 *                       migratedRecords:
 *                         type: integer
 *                       errorCount:
 *                         type: integer
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/history',
  [
    query('subject').optional().isString().withMessage('Subject deve ser uma string'),
    query('status').optional().isIn(['pending', 'running', 'completed', 'failed', 'cancelled']).withMessage('Status inválido'),
    query('page').optional().isInt({ min: 1 }).withMessage('Página deve ser um número positivo'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limite deve ser entre 1 e 100')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { subject, status, page = 1, limit = 20 } = req.query
      
      const history = await req.services.migration.getMigrationHistory({
        subject,
        status,
        page: parseInt(page),
        limit: parseInt(limit)
      })
      
      res.json(history)
    } catch (error) {
      req.logger.error('Erro ao obter histórico de migrações:', error)
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      })
    }
  }
)

/**
 * @swagger
 * /api/v1/migration/rollback:
 *   post:
 *     summary: Fazer rollback de uma migração
 *     tags: [Migration]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - executionId
 *             properties:
 *               executionId:
 *                 type: string
 *                 description: ID da execução da migração
 *               options:
 *                 type: object
 *                 properties:
 *                   async:
 *                     type: boolean
 *                     default: true
 *                   validateBeforeRollback:
 *                     type: boolean
 *                     default: true
 *     responses:
 *       200:
 *         description: Rollback iniciado ou concluído
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rollbackId:
 *                   type: string
 *                 executionId:
 *                   type: string
 *                 status:
 *                   type: string
 *                 startedAt:
 *                   type: string
 *                   format: date-time
 *                 estimatedDuration:
 *                   type: integer
 *       404:
 *         description: Execução não encontrada
 *       409:
 *         description: Rollback não é possível
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/rollback',
  [
    body('executionId').notEmpty().withMessage('ID da execução é obrigatório'),
    body('options.async').optional().isBoolean().withMessage('async deve ser boolean'),
    body('options.validateBeforeRollback').optional().isBoolean().withMessage('validateBeforeRollback deve ser boolean')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { executionId, options = {} } = req.body
      
      const rollback = await req.services.migration.rollbackMigration(executionId, options)
      
      if (!rollback.success) {
        if (rollback.error === 'EXECUTION_NOT_FOUND') {
          return res.status(404).json({
            error: 'Execução de migração não encontrada',
            executionId
          })
        }
        
        if (rollback.error === 'ROLLBACK_NOT_POSSIBLE') {
          return res.status(409).json({
            error: 'Rollback não é possível',
            reason: rollback.reason,
            executionId
          })
        }
        
        return res.status(400).json({
          error: rollback.error,
          details: rollback.details
        })
      }
      
      res.json(rollback.data)
    } catch (error) {
      req.logger.error('Erro ao fazer rollback da migração:', error)
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      })
    }
  }
)

/**
 * @swagger
 * /api/v1/migration/stats:
 *   get:
 *     summary: Obter estatísticas de migrações
 *     tags: [Migration]
 *     responses:
 *       200:
 *         description: Estatísticas de migrações
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalMigrations:
 *                   type: integer
 *                 successfulMigrations:
 *                   type: integer
 *                 failedMigrations:
 *                   type: integer
 *                 averageDuration:
 *                   type: number
 *                 totalRecordsMigrated:
 *                   type: integer
 *                 mostMigratedSubjects:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       subject:
 *                         type: string
 *                       migrations:
 *                         type: integer
 *                 recentActivity:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       executionId:
 *                         type: string
 *                       subject:
 *                         type: string
 *                       status:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/stats',
  async (req, res) => {
    try {
      const stats = await req.services.migration.getMigrationStats()
      res.json(stats)
    } catch (error) {
      req.logger.error('Erro ao obter estatísticas de migrações:', error)
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      })
    }
  }
)

module.exports = router