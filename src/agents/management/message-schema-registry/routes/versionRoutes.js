/**
 * Rotas para gerenciamento de versões de esquemas
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
 * /api/v1/versions/{subject}:
 *   get:
 *     summary: Listar versões de um esquema
 *     tags: [Versions]
 *     parameters:
 *       - in: path
 *         name: subject
 *         required: true
 *         schema:
 *           type: string
 *         description: Nome do subject do esquema
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
 *         description: Lista de versões
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 versions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       version:
 *                         type: integer
 *                       id:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       format:
 *                         type: string
 *                       size:
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
 *       404:
 *         description: Subject não encontrado
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/:subject',
  [
    param('subject').notEmpty().withMessage('Subject é obrigatório'),
    query('page').optional().isInt({ min: 1 }).withMessage('Página deve ser um número positivo'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limite deve ser entre 1 e 100')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { subject } = req.params
      const page = parseInt(req.query.page) || 1
      const limit = parseInt(req.query.limit) || 20
      
      const result = await req.services.version.listVersions(subject, {
        page,
        limit
      })
      
      if (!result.versions.length && page === 1) {
        return res.status(404).json({
          error: 'Subject não encontrado',
          subject
        })
      }
      
      res.json(result)
    } catch (error) {
      req.logger.error('Erro ao listar versões:', error)
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      })
    }
  }
)

/**
 * @swagger
 * /api/v1/versions/{subject}/{version}:
 *   get:
 *     summary: Obter versão específica de um esquema
 *     tags: [Versions]
 *     parameters:
 *       - in: path
 *         name: subject
 *         required: true
 *         schema:
 *           type: string
 *         description: Nome do subject do esquema
 *       - in: path
 *         name: version
 *         required: true
 *         schema:
 *           type: string
 *         description: Número da versão ou 'latest'
 *     responses:
 *       200:
 *         description: Dados da versão
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 subject:
 *                   type: string
 *                 version:
 *                   type: integer
 *                 schema:
 *                   type: object
 *                 format:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 hash:
 *                   type: string
 *                 size:
 *                   type: integer
 *       404:
 *         description: Versão não encontrada
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/:subject/:version',
  [
    param('subject').notEmpty().withMessage('Subject é obrigatório'),
    param('version').notEmpty().withMessage('Versão é obrigatória')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { subject, version } = req.params
      
      const schemaVersion = await req.services.version.getVersion(subject, version)
      
      if (!schemaVersion) {
        return res.status(404).json({
          error: 'Versão não encontrada',
          subject,
          version
        })
      }
      
      res.json(schemaVersion)
    } catch (error) {
      req.logger.error('Erro ao obter versão:', error)
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      })
    }
  }
)

/**
 * @swagger
 * /api/v1/versions/{subject}/{version}:
 *   delete:
 *     summary: Deletar versão específica de um esquema
 *     tags: [Versions]
 *     parameters:
 *       - in: path
 *         name: subject
 *         required: true
 *         schema:
 *           type: string
 *         description: Nome do subject do esquema
 *       - in: path
 *         name: version
 *         required: true
 *         schema:
 *           type: integer
 *         description: Número da versão
 *     responses:
 *       200:
 *         description: Versão deletada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 subject:
 *                   type: string
 *                 version:
 *                   type: integer
 *                 deletedAt:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: Versão não encontrada
 *       409:
 *         description: Não é possível deletar a versão (conflito)
 *       500:
 *         description: Erro interno do servidor
 */
router.delete('/:subject/:version',
  [
    param('subject').notEmpty().withMessage('Subject é obrigatório'),
    param('version').isInt({ min: 1 }).withMessage('Versão deve ser um número positivo')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { subject, version } = req.params
      const versionNumber = parseInt(version)
      
      const result = await req.services.version.deleteVersion(subject, versionNumber)
      
      if (!result.success) {
        if (result.error === 'VERSION_NOT_FOUND') {
          return res.status(404).json({
            error: 'Versão não encontrada',
            subject,
            version: versionNumber
          })
        }
        
        if (result.error === 'CANNOT_DELETE_LATEST') {
          return res.status(409).json({
            error: 'Não é possível deletar a versão mais recente',
            subject,
            version: versionNumber
          })
        }
        
        return res.status(409).json({
          error: result.error,
          subject,
          version: versionNumber
        })
      }
      
      res.json({
        message: 'Versão deletada com sucesso',
        subject,
        version: versionNumber,
        deletedAt: new Date().toISOString()
      })
    } catch (error) {
      req.logger.error('Erro ao deletar versão:', error)
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      })
    }
  }
)

/**
 * @swagger
 * /api/v1/versions/{subject}/latest:
 *   get:
 *     summary: Obter a versão mais recente de um esquema
 *     tags: [Versions]
 *     parameters:
 *       - in: path
 *         name: subject
 *         required: true
 *         schema:
 *           type: string
 *         description: Nome do subject do esquema
 *     responses:
 *       200:
 *         description: Versão mais recente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 subject:
 *                   type: string
 *                 version:
 *                   type: integer
 *                 schema:
 *                   type: object
 *                 format:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 hash:
 *                   type: string
 *                 size:
 *                   type: integer
 *       404:
 *         description: Subject não encontrado
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/:subject/latest',
  [
    param('subject').notEmpty().withMessage('Subject é obrigatório')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { subject } = req.params
      
      const latestVersion = await req.services.version.getLatestVersion(subject)
      
      if (!latestVersion) {
        return res.status(404).json({
          error: 'Subject não encontrado',
          subject
        })
      }
      
      res.json(latestVersion)
    } catch (error) {
      req.logger.error('Erro ao obter versão mais recente:', error)
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      })
    }
  }
)

/**
 * @swagger
 * /api/v1/versions/{subject}/compare:
 *   post:
 *     summary: Comparar duas versões de um esquema
 *     tags: [Versions]
 *     parameters:
 *       - in: path
 *         name: subject
 *         required: true
 *         schema:
 *           type: string
 *         description: Nome do subject do esquema
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fromVersion
 *               - toVersion
 *             properties:
 *               fromVersion:
 *                 type: string
 *                 description: Versão de origem (número ou 'latest')
 *               toVersion:
 *                 type: string
 *                 description: Versão de destino (número ou 'latest')
 *               includeDetails:
 *                 type: boolean
 *                 default: false
 *                 description: Incluir detalhes das diferenças
 *     responses:
 *       200:
 *         description: Resultado da comparação
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subject:
 *                   type: string
 *                 fromVersion:
 *                   type: integer
 *                 toVersion:
 *                   type: integer
 *                 compatible:
 *                   type: boolean
 *                 differences:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                       path:
 *                         type: string
 *                       description:
 *                         type: string
 *                       severity:
 *                         type: string
 *                 summary:
 *                   type: object
 *                   properties:
 *                     addedFields:
 *                       type: integer
 *                     removedFields:
 *                       type: integer
 *                     modifiedFields:
 *                       type: integer
 *                     breakingChanges:
 *                       type: integer
 *       404:
 *         description: Uma das versões não foi encontrada
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/:subject/compare',
  [
    param('subject').notEmpty().withMessage('Subject é obrigatório'),
    body('fromVersion').notEmpty().withMessage('Versão de origem é obrigatória'),
    body('toVersion').notEmpty().withMessage('Versão de destino é obrigatória'),
    body('includeDetails').optional().isBoolean().withMessage('includeDetails deve ser boolean')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { subject } = req.params
      const { fromVersion, toVersion, includeDetails = false } = req.body
      
      const comparison = await req.services.version.compareVersions(
        subject,
        fromVersion,
        toVersion,
        { includeDetails }
      )
      
      if (!comparison) {
        return res.status(404).json({
          error: 'Uma ou ambas as versões não foram encontradas',
          subject,
          fromVersion,
          toVersion
        })
      }
      
      res.json(comparison)
    } catch (error) {
      req.logger.error('Erro ao comparar versões:', error)
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      })
    }
  }
)

/**
 * @swagger
 * /api/v1/versions/stats:
 *   get:
 *     summary: Obter estatísticas de versionamento
 *     tags: [Versions]
 *     responses:
 *       200:
 *         description: Estatísticas de versionamento
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalSubjects:
 *                   type: integer
 *                 totalVersions:
 *                   type: integer
 *                 averageVersionsPerSubject:
 *                   type: number
 *                 mostVersionedSubjects:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       subject:
 *                         type: string
 *                       versions:
 *                         type: integer
 *                 recentActivity:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       subject:
 *                         type: string
 *                       version:
 *                         type: integer
 *                       action:
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
      const stats = await req.services.version.getVersioningStats()
      res.json(stats)
    } catch (error) {
      req.logger.error('Erro ao obter estatísticas de versionamento:', error)
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      })
    }
  }
)

module.exports = router