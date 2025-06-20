/**
 * Response Handler para Interface Agent
 * Responsável por processar respostas de outros agentes
 */

const { v4: uuidv4 } = require('uuid');
const config = require('../../../../config');

/**
 * Processa mensagens de resposta recebidas via SQS
 * @param {Object} message - Mensagem SQS recebida
 * @param {Object} logger - Logger instance
 */
async function handleResponse(message, logger) {
  try {
    logger.info('Processing response message', { messageId: message.MessageId });
    
    // Parse do corpo da mensagem
    const messageBody = JSON.parse(message.Body);
    
    // Log da resposta recebida
    logger.info('Response received', {
      messageId: message.MessageId,
      responseType: messageBody.type,
      source: messageBody.source
    });
    
    // Aqui você pode adicionar lógica específica para processar diferentes tipos de resposta
    switch (messageBody.type) {
      case 'planning_response':
        await handlePlanningResponse(messageBody, logger);
        break;
      case 'execution_response':
        await handleExecutionResponse(messageBody, logger);
        break;
      case 'event_response':
        await handleEventResponse(messageBody, logger);
        break;
      default:
        logger.warn('Unknown response type', { type: messageBody.type });
    }
    
    return true;
  } catch (error) {
    logger.error('Error processing response message', {
      error: error.message,
      messageId: message.MessageId
    });
    throw error;
  }
}

/**
 * Processa resposta de planejamento
 */
async function handlePlanningResponse(messageBody, logger) {
  try {
    logger.info('Processing planning response', { data: messageBody.data });
    
    // Validar estrutura da resposta
    if (!messageBody.data || !messageBody.data.planId) {
      throw new Error('Invalid planning response: missing planId');
    }

    const { planId, status, plan, error, metadata } = messageBody.data;

    // Processar baseado no status
    switch (status) {
      case 'completed':
        logger.info(`Plan ${planId} completed successfully`);
        if (plan && plan.steps) {
          logger.info(`Plan contains ${plan.steps.length} steps`);
          // Notificar interface sobre plano pronto
          notifyInterface('plan_ready', {
            planId,
            plan,
            timestamp: new Date().toISOString()
          }, logger);
        }
        break;

      case 'failed':
        logger.error(`Plan ${planId} failed:`, error);
        notifyInterface('plan_failed', {
          planId,
          error: error || 'Unknown planning error',
          timestamp: new Date().toISOString()
        }, logger);
        break;

      case 'in_progress':
        logger.info(`Plan ${planId} is in progress`);
        notifyInterface('plan_progress', {
          planId,
          progress: metadata?.progress || 0,
          timestamp: new Date().toISOString()
        }, logger);
        break;

      default:
        logger.warn(`Unknown planning status: ${status}`);
    }

  } catch (error) {
    logger.error('Error processing planning response:', error);
    notifyInterface('plan_error', {
      error: error.message,
      timestamp: new Date().toISOString()
    }, logger);
  }
}

/**
 * Processa resposta de execução
 */
async function handleExecutionResponse(messageBody, logger) {
  try {
    logger.info('Processing execution response', { data: messageBody.data });
    
    // Validar estrutura da resposta
    if (!messageBody.data || !messageBody.data.executionId) {
      throw new Error('Invalid execution response: missing executionId');
    }

    const { executionId, status, result, error, progress, stepId } = messageBody.data;

    // Processar baseado no status
    switch (status) {
      case 'step_completed':
        logger.info(`Execution ${executionId} - Step ${stepId} completed`);
        notifyInterface('execution_step_completed', {
          executionId,
          stepId,
          result,
          progress: progress || 0,
          timestamp: new Date().toISOString()
        }, logger);
        break;

      case 'completed':
        logger.info(`Execution ${executionId} completed successfully`);
        notifyInterface('execution_completed', {
          executionId,
          result,
          timestamp: new Date().toISOString()
        }, logger);
        break;

      case 'failed':
        logger.error(`Execution ${executionId} failed:`, error);
        notifyInterface('execution_failed', {
          executionId,
          stepId,
          error: error || 'Unknown execution error',
          timestamp: new Date().toISOString()
        }, logger);
        break;

      case 'in_progress':
        logger.info(`Execution ${executionId} is in progress`);
        notifyInterface('execution_progress', {
          executionId,
          stepId,
          progress: progress || 0,
          timestamp: new Date().toISOString()
        }, logger);
        break;

      default:
        logger.warn(`Unknown execution status: ${status}`);
    }

  } catch (error) {
    logger.error('Error processing execution response:', error);
    notifyInterface('execution_error', {
      error: error.message,
      timestamp: new Date().toISOString()
    }, logger);
  }
}

/**
 * Processa resposta de evento
 */
async function handleEventResponse(messageBody, logger) {
  try {
    logger.info('Processing event response', { data: messageBody.data });
    
    // Validar estrutura da resposta
    if (!messageBody.data || !messageBody.data.eventId) {
      throw new Error('Invalid event response: missing eventId');
    }

    const { eventId, eventType, status, data, error, severity } = messageBody.data;

    // Processar baseado no tipo de evento
    switch (eventType) {
      case 'system_alert':
        logger.warn(`System alert: ${eventId}`);
        notifyInterface('system_alert', {
          eventId,
          severity: severity || 'medium',
          message: data?.message || 'System alert received',
          timestamp: new Date().toISOString()
        }, logger);
        break;

      case 'agent_status':
        logger.info(`Agent status update: ${eventId}`);
        notifyInterface('agent_status_update', {
          eventId,
          agentId: data?.agentId,
          status: data?.status,
          timestamp: new Date().toISOString()
        }, logger);
        break;

      case 'resource_usage':
        logger.info(`Resource usage update: ${eventId}`);
        notifyInterface('resource_update', {
          eventId,
          metrics: data?.metrics,
          timestamp: new Date().toISOString()
        }, logger);
        break;

      case 'error_event':
        logger.error(`Error event: ${eventId}`, error);
        notifyInterface('error_notification', {
          eventId,
          error: error || data?.error || 'Unknown error',
          severity: severity || 'high',
          timestamp: new Date().toISOString()
        }, logger);
        break;

      default:
        logger.info(`Generic event: ${eventType}`);
        notifyInterface('generic_event', {
          eventId,
          eventType,
          data,
          timestamp: new Date().toISOString()
        }, logger);
    }

  } catch (error) {
    logger.error('Error processing event response:', error);
    notifyInterface('event_error', {
      error: error.message,
      timestamp: new Date().toISOString()
    }, logger);
  }
}

/**
 * Notificar interface do usuário via WebSocket
 */
function notifyInterface(type, data, logger) {
  try {
    // Verificar se há WebSocket handler disponível
    if (global.websocketHandler && typeof global.websocketHandler.broadcast === 'function') {
      global.websocketHandler.broadcast({
        type,
        data,
        timestamp: new Date().toISOString()
      });
      logger.debug(`Interface notified: ${type}`);
    } else {
      logger.warn('WebSocket handler not available for interface notification');
      // Fallback: log the notification
      logger.info(`Interface notification [${type}]:`, data);
    }
  } catch (error) {
    logger.error('Error notifying interface:', error);
  }
}

module.exports = handleResponse;