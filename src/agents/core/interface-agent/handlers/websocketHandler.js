/**
 * WebSocket Handler para Interface Agent
 * Responsável por gerenciar conexões WebSocket e comunicação em tempo real
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const config = require('../../../../config');

class WebSocketHandler {
  constructor(server, logger, metrics, eventHandler) {
    this.server = server;
    this.logger = logger;
    this.metrics = metrics;
    this.eventHandler = eventHandler;
    this.clients = new Map(); // Map de conexões ativas
    this.subscriptions = new Map(); // Map de subscrições por tópico
    this.wss = null;
    
    if (config.interface.websocket.enabled) {
      this.initializeWebSocketServer();
    }
  }

  /**
   * Inicializa servidor WebSocket
   */
  initializeWebSocketServer() {
    try {
      this.wss = new WebSocket.Server({
        server: this.server,
        path: '/ws',
        clientTracking: true,
        perMessageDeflate: {
          zlibDeflateOptions: {
            level: 3,
            chunkSize: 1024
          },
          threshold: 1024,
          concurrencyLimit: 10
        }
      });

      this.wss.on('connection', this.handleConnection.bind(this));
      this.wss.on('error', this.handleServerError.bind(this));
      
      // Configurar ping/pong para manter conexões vivas
      this.setupHeartbeat();
      
      this.logger.info('WebSocket server initialized', {
        path: '/ws',
        pingTimeout: config.interface.websocket.pingTimeout,
        pingInterval: config.interface.websocket.pingInterval
      });
      
    } catch (error) {
      this.logger.error('Failed to initialize WebSocket server', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Manipula nova conexão WebSocket
   */
  handleConnection(ws, req) {
    const clientId = uuidv4();
    const clientInfo = {
      id: clientId,
      ws,
      ip: req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      connectedAt: new Date(),
      lastPing: new Date(),
      subscriptions: new Set(),
      isAlive: true
    };

    // Adicionar cliente ao mapa
    this.clients.set(clientId, clientInfo);
    
    // Configurar handlers da conexão
    ws.on('message', (data) => this.handleMessage(clientId, data));
    ws.on('close', (code, reason) => this.handleDisconnection(clientId, code, reason));
    ws.on('error', (error) => this.handleConnectionError(clientId, error));
    ws.on('pong', () => this.handlePong(clientId));

    // Atualizar métricas
    this.metrics.websocketConnections.inc();
    this.metrics.websocketActiveConnections.set(this.clients.size);

    // Log da conexão
    this.logger.info('WebSocket client connected', {
      clientId,
      ip: clientInfo.ip,
      userAgent: clientInfo.userAgent,
      totalConnections: this.clients.size
    });

    // Enviar mensagem de boas-vindas
    this.sendToClient(clientId, {
      type: 'connection_established',
      clientId,
      timestamp: new Date().toISOString(),
      serverInfo: {
        version: process.env.npm_package_version || '1.0.0',
        features: ['event_streaming', 'status_updates', 'real_time_metrics']
      }
    });
  }

  /**
   * Manipula mensagens recebidas do cliente
   */
  async handleMessage(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const message = JSON.parse(data.toString());
      
      this.logger.debug('WebSocket message received', {
        clientId,
        type: message.type,
        messageId: message.id
      });

      // Atualizar métricas
      this.metrics.websocketMessagesReceived.inc({ type: message.type || 'unknown' });

      switch (message.type) {
        case 'subscribe':
          await this.handleSubscription(clientId, message);
          break;
          
        case 'unsubscribe':
          await this.handleUnsubscription(clientId, message);
          break;
          
        case 'event_submit':
          await this.handleEventSubmission(clientId, message);
          break;
          
        case 'event_status':
          await this.handleEventStatusRequest(clientId, message);
          break;
          
        case 'ping':
          this.handlePingMessage(clientId, message);
          break;
          
        default:
          this.sendError(clientId, {
            messageId: message.id,
            error: 'Unknown message type',
            type: message.type
          });
      }
      
    } catch (error) {
      this.metrics.websocketMessageErrors.inc();
      this.logger.error('Error processing WebSocket message', {
        clientId,
        error: error.message,
        data: data.toString().substring(0, 200)
      });
      
      this.sendError(clientId, {
        error: 'Invalid message format',
        details: error.message
      });
    }
  }

  /**
   * Manipula subscrição a tópicos
   */
  async handleSubscription(clientId, message) {
    const { topics, filters } = message;
    const client = this.clients.get(clientId);
    
    if (!client || !Array.isArray(topics)) {
      return this.sendError(clientId, {
        messageId: message.id,
        error: 'Invalid subscription request'
      });
    }

    const validTopics = ['events', 'status_updates', 'metrics', 'system_alerts'];
    const subscribedTopics = [];
    
    for (const topic of topics) {
      if (validTopics.includes(topic)) {
        // Adicionar à subscrição do cliente
        client.subscriptions.add(topic);
        
        // Adicionar cliente à lista de subscrições do tópico
        if (!this.subscriptions.has(topic)) {
          this.subscriptions.set(topic, new Set());
        }
        this.subscriptions.get(topic).add(clientId);
        
        subscribedTopics.push(topic);
      }
    }

    this.logger.info('Client subscribed to topics', {
      clientId,
      topics: subscribedTopics,
      filters
    });

    // Confirmar subscrição
    this.sendToClient(clientId, {
      type: 'subscription_confirmed',
      messageId: message.id,
      topics: subscribedTopics,
      timestamp: new Date().toISOString()
    });

    // Atualizar métricas
    this.metrics.websocketSubscriptions.inc({ topics: subscribedTopics.join(',') });
  }

  /**
   * Manipula cancelamento de subscrição
   */
  async handleUnsubscription(clientId, message) {
    const { topics } = message;
    const client = this.clients.get(clientId);
    
    if (!client || !Array.isArray(topics)) {
      return this.sendError(clientId, {
        messageId: message.id,
        error: 'Invalid unsubscription request'
      });
    }

    const unsubscribedTopics = [];
    
    for (const topic of topics) {
      if (client.subscriptions.has(topic)) {
        // Remover da subscrição do cliente
        client.subscriptions.delete(topic);
        
        // Remover cliente da lista de subscrições do tópico
        const topicSubscribers = this.subscriptions.get(topic);
        if (topicSubscribers) {
          topicSubscribers.delete(clientId);
          if (topicSubscribers.size === 0) {
            this.subscriptions.delete(topic);
          }
        }
        
        unsubscribedTopics.push(topic);
      }
    }

    this.logger.info('Client unsubscribed from topics', {
      clientId,
      topics: unsubscribedTopics
    });

    // Confirmar cancelamento
    this.sendToClient(clientId, {
      type: 'unsubscription_confirmed',
      messageId: message.id,
      topics: unsubscribedTopics,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Manipula submissão de evento via WebSocket
   */
  async handleEventSubmission(clientId, message) {
    try {
      // Simular requisição HTTP para reutilizar lógica do eventHandler
      const mockReq = {
        body: message.event,
        ip: this.clients.get(clientId)?.ip || 'unknown',
        get: (header) => header === 'User-Agent' ? 'WebSocket-Client' : undefined
      };
      
      const mockRes = {
        status: (code) => ({
          json: (data) => {
            this.sendToClient(clientId, {
              type: 'event_submission_response',
              messageId: message.id,
              statusCode: code,
              ...data
            });
          }
        }),
        json: (data) => {
          this.sendToClient(clientId, {
            type: 'event_submission_response',
            messageId: message.id,
            statusCode: 202,
            ...data
          });
        }
      };
      
      await this.eventHandler.handleEventSubmission(mockReq, mockRes);
      
    } catch (error) {
      this.logger.error('Error handling WebSocket event submission', {
        clientId,
        messageId: message.id,
        error: error.message
      });
      
      this.sendError(clientId, {
        messageId: message.id,
        error: 'Failed to submit event',
        details: error.message
      });
    }
  }

  /**
   * Manipula requisição de status de evento
   */
  async handleEventStatusRequest(clientId, message) {
    try {
      const { eventId } = message;
      
      const mockReq = {
        params: { eventId }
      };
      
      const mockRes = {
        status: (code) => ({
          json: (data) => {
            this.sendToClient(clientId, {
              type: 'event_status_response',
              messageId: message.id,
              statusCode: code,
              ...data
            });
          }
        }),
        json: (data) => {
          this.sendToClient(clientId, {
            type: 'event_status_response',
            messageId: message.id,
            statusCode: 200,
            ...data
          });
        }
      };
      
      await this.eventHandler.handleEventStatus(mockReq, mockRes);
      
    } catch (error) {
      this.logger.error('Error handling WebSocket status request', {
        clientId,
        messageId: message.id,
        error: error.message
      });
      
      this.sendError(clientId, {
        messageId: message.id,
        error: 'Failed to get event status',
        details: error.message
      });
    }
  }

  /**
   * Manipula mensagem de ping
   */
  handlePingMessage(clientId, message) {
    this.sendToClient(clientId, {
      type: 'pong',
      messageId: message.id,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Manipula desconexão de cliente
   */
  handleDisconnection(clientId, code, reason) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remover subscrições
    for (const topic of client.subscriptions) {
      const topicSubscribers = this.subscriptions.get(topic);
      if (topicSubscribers) {
        topicSubscribers.delete(clientId);
        if (topicSubscribers.size === 0) {
          this.subscriptions.delete(topic);
        }
      }
    }

    // Remover cliente
    this.clients.delete(clientId);

    // Atualizar métricas
    this.metrics.websocketDisconnections.inc({ code: code.toString() });
    this.metrics.websocketActiveConnections.set(this.clients.size);

    // Log da desconexão
    this.logger.info('WebSocket client disconnected', {
      clientId,
      code,
      reason: reason?.toString(),
      connectionDuration: Date.now() - client.connectedAt.getTime(),
      totalConnections: this.clients.size
    });
  }

  /**
   * Manipula erros de conexão
   */
  handleConnectionError(clientId, error) {
    this.metrics.websocketConnectionErrors.inc();
    this.logger.error('WebSocket connection error', {
      clientId,
      error: error.message,
      stack: error.stack
    });
  }

  /**
   * Manipula erros do servidor WebSocket
   */
  handleServerError(error) {
    this.metrics.websocketServerErrors.inc();
    this.logger.error('WebSocket server error', {
      error: error.message,
      stack: error.stack
    });
  }

  /**
   * Manipula resposta pong
   */
  handlePong(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      client.isAlive = true;
      client.lastPing = new Date();
    }
  }

  /**
   * Envia mensagem para cliente específico
   */
  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      const data = JSON.stringify({
        ...message,
        timestamp: message.timestamp || new Date().toISOString()
      });
      
      client.ws.send(data);
      this.metrics.websocketMessagesSent.inc({ type: message.type || 'unknown' });
      return true;
      
    } catch (error) {
      this.logger.error('Error sending WebSocket message', {
        clientId,
        error: error.message,
        messageType: message.type
      });
      return false;
    }
  }

  /**
   * Envia mensagem de erro para cliente
   */
  sendError(clientId, error) {
    this.sendToClient(clientId, {
      type: 'error',
      ...error,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Faz broadcast para todos os clientes subscritos a um tópico
   */
  broadcast(topic, message) {
    const subscribers = this.subscriptions.get(topic);
    if (!subscribers || subscribers.size === 0) {
      return 0;
    }

    let sent = 0;
    for (const clientId of subscribers) {
      if (this.sendToClient(clientId, {
        type: 'broadcast',
        topic,
        ...message
      })) {
        sent++;
      }
    }

    this.logger.debug('Broadcast sent', {
      topic,
      subscribers: subscribers.size,
      sent,
      messageType: message.type
    });

    return sent;
  }

  /**
   * Configura sistema de heartbeat
   */
  setupHeartbeat() {
    const interval = setInterval(() => {
      if (!this.wss) {
        clearInterval(interval);
        return;
      }

      const now = Date.now();
      const timeout = config.interface.websocket.pingTimeout;
      
      for (const [clientId, client] of this.clients.entries()) {
        if (!client.isAlive) {
          // Cliente não respondeu ao ping anterior
          this.logger.warn('Terminating unresponsive WebSocket client', {
            clientId,
            lastPing: client.lastPing
          });
          client.ws.terminate();
          continue;
        }

        // Verificar se precisa enviar ping
        if (now - client.lastPing.getTime() > timeout / 2) {
          client.isAlive = false;
          client.ws.ping();
        }
      }
    }, config.interface.websocket.pingInterval);

    // Limpar interval quando servidor for fechado
    this.wss.on('close', () => {
      clearInterval(interval);
    });
  }

  /**
   * Retorna estatísticas do WebSocket
   */
  getStats() {
    const stats = {
      enabled: config.interface.websocket.enabled,
      totalConnections: this.clients.size,
      subscriptions: {},
      clientInfo: []
    };

    // Estatísticas de subscrições
    for (const [topic, subscribers] of this.subscriptions.entries()) {
      stats.subscriptions[topic] = subscribers.size;
    }

    // Informações dos clientes (sem dados sensíveis)
    for (const [clientId, client] of this.clients.entries()) {
      stats.clientInfo.push({
        id: clientId,
        connectedAt: client.connectedAt,
        subscriptions: Array.from(client.subscriptions),
        isAlive: client.isAlive,
        connectionDuration: Date.now() - client.connectedAt.getTime()
      });
    }

    return stats;
  }

  /**
   * Fecha servidor WebSocket
   */
  close() {
    if (this.wss) {
      this.logger.info('Closing WebSocket server');
      
      // Fechar todas as conexões
      for (const [clientId, client] of this.clients.entries()) {
        client.ws.close(1001, 'Server shutting down');
      }
      
      // Fechar servidor
      this.wss.close();
      this.wss = null;
    }
  }
}

module.exports = WebSocketHandler;