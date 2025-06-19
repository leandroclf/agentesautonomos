/**
 * Database Service - Serviço de Banco de Dados
 * Gerencia conexões e operações com diferentes tipos de banco de dados
 */

const { MongoClient } = require('mongodb');
const { Pool } = require('pg');
const mysql = require('mysql2/promise');
const EventEmitter = require('events');

class DatabaseService extends EventEmitter {
  constructor(config, logger, metrics) {
    super();
    this.config = config;
    this.logger = logger;
    this.metrics = metrics;
    this.client = null;
    this.pool = null;
    this.isConnected = false;
    this.connectionRetries = 0;
    this.maxRetries = 5;
    this.retryDelay = 5000;
  }

  /**
   * Inicializa o serviço de banco de dados
   */
  async initialize() {
    try {
      this.logger.info('Inicializando Database Service...');
      
      await this.connect();
      await this.setupDatabase();
      
      this.logger.info('Database Service inicializado com sucesso');
    } catch (error) {
      this.logger.error('Erro ao inicializar Database Service:', error);
      throw error;
    }
  }

  /**
   * Conecta ao banco de dados baseado no tipo configurado
   */
  async connect() {
    const dbType = this.config.persistence.database.type;
    
    try {
      switch (dbType) {
        case 'mongodb':
          await this.connectMongoDB();
          break;
        case 'postgresql':
          await this.connectPostgreSQL();
          break;
        case 'mysql':
          await this.connectMySQL();
          break;
        default:
          throw new Error(`Tipo de banco não suportado: ${dbType}`);
      }
      
      this.isConnected = true;
      this.connectionRetries = 0;
      this.metrics.databaseConnections.set(1);
      
      this.logger.info(`Conectado ao banco ${dbType} com sucesso`);
    } catch (error) {
      this.isConnected = false;
      this.metrics.databaseConnections.set(0);
      
      if (this.connectionRetries < this.maxRetries) {
        this.connectionRetries++;
        this.logger.warn(`Tentativa de conexão ${this.connectionRetries}/${this.maxRetries} falhou. Tentando novamente em ${this.retryDelay}ms...`);
        
        await this.sleep(this.retryDelay);
        return this.connect();
      }
      
      throw error;
    }
  }

  /**
   * Conecta ao MongoDB
   */
  async connectMongoDB() {
    const { host, port, database, username, password, ssl } = this.config.persistence.database;
    
    let uri = `mongodb://${host}:${port}/${database}`;
    
    if (username && password) {
      uri = `mongodb://${username}:${password}@${host}:${port}/${database}`;
    }
    
    const options = {
      useUnifiedTopology: true,
      maxPoolSize: this.config.persistence.database.poolSize,
      serverSelectionTimeoutMS: this.config.persistence.database.timeout,
      ssl: ssl.enabled,
      sslValidate: ssl.validate,
      sslCA: ssl.ca,
      sslCert: ssl.cert,
      sslKey: ssl.key
    };
    
    this.client = new MongoClient(uri, options);
    await this.client.connect();
    
    // Testar conexão
    await this.client.db().admin().ping();
  }

  /**
   * Conecta ao PostgreSQL
   */
  async connectPostgreSQL() {
    const { host, port, database, username, password, ssl } = this.config.persistence.database;
    
    const config = {
      host,
      port,
      database,
      user: username,
      password,
      max: this.config.persistence.database.poolSize,
      connectionTimeoutMillis: this.config.persistence.database.timeout,
      ssl: ssl.enabled ? {
        rejectUnauthorized: ssl.validate,
        ca: ssl.ca,
        cert: ssl.cert,
        key: ssl.key
      } : false
    };
    
    this.pool = new Pool(config);
    
    // Testar conexão
    const client = await this.pool.connect();
    await client.query('SELECT NOW()');
    client.release();
  }

  /**
   * Conecta ao MySQL
   */
  async connectMySQL() {
    const { host, port, database, username, password, ssl } = this.config.persistence.database;
    
    const config = {
      host,
      port,
      database,
      user: username,
      password,
      connectionLimit: this.config.persistence.database.poolSize,
      acquireTimeout: this.config.persistence.database.timeout,
      ssl: ssl.enabled ? {
        rejectUnauthorized: ssl.validate,
        ca: ssl.ca,
        cert: ssl.cert,
        key: ssl.key
      } : false
    };
    
    this.pool = mysql.createPool(config);
    
    // Testar conexão
    const connection = await this.pool.getConnection();
    await connection.query('SELECT 1');
    connection.release();
  }

  /**
   * Configura o banco de dados (cria tabelas/coleções se necessário)
   */
  async setupDatabase() {
    const dbType = this.config.persistence.database.type;
    
    try {
      switch (dbType) {
        case 'mongodb':
          await this.setupMongoDB();
          break;
        case 'postgresql':
          await this.setupPostgreSQL();
          break;
        case 'mysql':
          await this.setupMySQL();
          break;
      }
      
      this.logger.info('Estrutura do banco configurada');
    } catch (error) {
      this.logger.error('Erro ao configurar estrutura do banco:', error);
      throw error;
    }
  }

  /**
   * Configura estrutura do MongoDB
   */
  async setupMongoDB() {
    const db = this.client.db();
    
    // Criar coleções principais
    const collections = ['events', 'documents', 'metadata', 'backups'];
    
    for (const collectionName of collections) {
      try {
        await db.createCollection(collectionName);
        
        // Criar índices
        if (collectionName === 'events') {
          await db.collection(collectionName).createIndex({ timestamp: 1 });
          await db.collection(collectionName).createIndex({ type: 1 });
          await db.collection(collectionName).createIndex({ 'metadata.id': 1 }, { unique: true });
        }
        
        if (collectionName === 'documents') {
          await db.collection(collectionName).createIndex({ id: 1 }, { unique: true });
          await db.collection(collectionName).createIndex({ createdAt: 1 });
          await db.collection(collectionName).createIndex({ type: 1 });
        }
        
      } catch (error) {
        // Coleção já existe
        if (error.code !== 48) {
          throw error;
        }
      }
    }
  }

  /**
   * Configura estrutura do PostgreSQL
   */
  async setupPostgreSQL() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        event_id VARCHAR(255) UNIQUE NOT NULL,
        type VARCHAR(100) NOT NULL,
        data JSONB NOT NULL,
        metadata JSONB,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        doc_id VARCHAR(255) UNIQUE NOT NULL,
        content JSONB NOT NULL,
        metadata JSONB,
        type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS backups (
        id SERIAL PRIMARY KEY,
        backup_id VARCHAR(255) UNIQUE NOT NULL,
        data JSONB NOT NULL,
        type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)`,
      `CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type)`,
      `CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at)`
    ];
    
    for (const query of queries) {
      await this.pool.query(query);
    }
  }

  /**
   * Configura estrutura do MySQL
   */
  async setupMySQL() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_id VARCHAR(255) UNIQUE NOT NULL,
        type VARCHAR(100) NOT NULL,
        data JSON NOT NULL,
        metadata JSON,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        doc_id VARCHAR(255) UNIQUE NOT NULL,
        content JSON NOT NULL,
        metadata JSON,
        type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS backups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        backup_id VARCHAR(255) UNIQUE NOT NULL,
        data JSON NOT NULL,
        type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)`,
      `CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type)`,
      `CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at)`
    ];
    
    for (const query of queries) {
      await this.pool.execute(query);
    }
  }

  /**
   * Armazena dados no banco
   */
  async store(data) {
    if (!this.isConnected) {
      throw new Error('Banco de dados não conectado');
    }
    
    const dbType = this.config.persistence.database.type;
    
    try {
      switch (dbType) {
        case 'mongodb':
          return await this.storeMongoDB(data);
        case 'postgresql':
          return await this.storePostgreSQL(data);
        case 'mysql':
          return await this.storeMySQL(data);
        default:
          throw new Error(`Operação store não implementada para ${dbType}`);
      }
    } catch (error) {
      this.logger.error('Erro ao armazenar dados:', error);
      this.metrics.errorCount.inc({ type: 'database_store', operation: 'store' });
      throw error;
    }
  }

  /**
   * Armazena dados no MongoDB
   */
  async storeMongoDB(data) {
    const db = this.client.db();
    const collection = data.collection || 'documents';
    
    const document = {
      ...data,
      createdAt: new Date(),
      _id: data.id || data._metadata?.id
    };
    
    const result = await db.collection(collection).insertOne(document);
    return { id: result.insertedId, ...document };
  }

  /**
   * Armazena dados no PostgreSQL
   */
  async storePostgreSQL(data) {
    const table = data.collection || 'documents';
    const id = data.id || data._metadata?.id;
    
    if (table === 'events') {
      const query = `
        INSERT INTO events (event_id, type, data, metadata, timestamp)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      
      const values = [
        id,
        data.type,
        JSON.stringify(data.data || data),
        JSON.stringify(data._metadata || {}),
        data.timestamp || new Date()
      ];
      
      const result = await this.pool.query(query, values);
      return result.rows[0];
    } else {
      const query = `
        INSERT INTO documents (doc_id, content, metadata, type)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;
      
      const values = [
        id,
        JSON.stringify(data),
        JSON.stringify(data._metadata || {}),
        data.type
      ];
      
      const result = await this.pool.query(query, values);
      return result.rows[0];
    }
  }

  /**
   * Armazena dados no MySQL
   */
  async storeMySQL(data) {
    const table = data.collection || 'documents';
    const id = data.id || data._metadata?.id;
    
    if (table === 'events') {
      const query = `
        INSERT INTO events (event_id, type, data, metadata, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `;
      
      const values = [
        id,
        data.type,
        JSON.stringify(data.data || data),
        JSON.stringify(data._metadata || {}),
        data.timestamp || new Date()
      ];
      
      const [result] = await this.pool.execute(query, values);
      return { id: result.insertId, ...data };
    } else {
      const query = `
        INSERT INTO documents (doc_id, content, metadata, type)
        VALUES (?, ?, ?, ?)
      `;
      
      const values = [
        id,
        JSON.stringify(data),
        JSON.stringify(data._metadata || {}),
        data.type
      ];
      
      const [result] = await this.pool.execute(query, values);
      return { id: result.insertId, ...data };
    }
  }

  /**
   * Recupera dados por ID
   */
  async retrieve(id, options = {}) {
    if (!this.isConnected) {
      throw new Error('Banco de dados não conectado');
    }
    
    const dbType = this.config.persistence.database.type;
    
    try {
      switch (dbType) {
        case 'mongodb':
          return await this.retrieveMongoDB(id, options);
        case 'postgresql':
          return await this.retrievePostgreSQL(id, options);
        case 'mysql':
          return await this.retrieveMySQL(id, options);
        default:
          throw new Error(`Operação retrieve não implementada para ${dbType}`);
      }
    } catch (error) {
      this.logger.error('Erro ao recuperar dados:', error);
      this.metrics.errorCount.inc({ type: 'database_retrieve', operation: 'retrieve' });
      throw error;
    }
  }

  /**
   * Recupera dados do MongoDB
   */
  async retrieveMongoDB(id, options) {
    const db = this.client.db();
    const collection = options.collection || 'documents';
    
    return await db.collection(collection).findOne({ _id: id });
  }

  /**
   * Recupera dados do PostgreSQL
   */
  async retrievePostgreSQL(id, options) {
    const table = options.collection || 'documents';
    
    if (table === 'events') {
      const query = 'SELECT * FROM events WHERE event_id = $1';
      const result = await this.pool.query(query, [id]);
      return result.rows[0];
    } else {
      const query = 'SELECT * FROM documents WHERE doc_id = $1';
      const result = await this.pool.query(query, [id]);
      return result.rows[0];
    }
  }

  /**
   * Recupera dados do MySQL
   */
  async retrieveMySQL(id, options) {
    const table = options.collection || 'documents';
    
    if (table === 'events') {
      const query = 'SELECT * FROM events WHERE event_id = ?';
      const [rows] = await this.pool.execute(query, [id]);
      return rows[0];
    } else {
      const query = 'SELECT * FROM documents WHERE doc_id = ?';
      const [rows] = await this.pool.execute(query, [id]);
      return rows[0];
    }
  }

  /**
   * Busca dados com filtros
   */
  async search(filters, options = {}) {
    if (!this.isConnected) {
      throw new Error('Banco de dados não conectado');
    }
    
    const dbType = this.config.persistence.database.type;
    
    try {
      switch (dbType) {
        case 'mongodb':
          return await this.searchMongoDB(filters, options);
        case 'postgresql':
          return await this.searchPostgreSQL(filters, options);
        case 'mysql':
          return await this.searchMySQL(filters, options);
        default:
          throw new Error(`Operação search não implementada para ${dbType}`);
      }
    } catch (error) {
      this.logger.error('Erro na busca:', error);
      this.metrics.errorCount.inc({ type: 'database_search', operation: 'search' });
      throw error;
    }
  }

  /**
   * Busca dados no MongoDB
   */
  async searchMongoDB(filters, options) {
    const db = this.client.db();
    const collection = options.collection || 'documents';
    
    const cursor = db.collection(collection).find(filters);
    
    if (options.limit) {
      cursor.limit(options.limit);
    }
    
    if (options.skip) {
      cursor.skip(options.skip);
    }
    
    if (options.sort) {
      cursor.sort(options.sort);
    }
    
    return await cursor.toArray();
  }

  /**
   * Busca dados no PostgreSQL
   */
  async searchPostgreSQL(filters, options) {
    const table = options.collection || 'documents';
    let query = `SELECT * FROM ${table}`;
    const values = [];
    
    if (Object.keys(filters).length > 0) {
      const conditions = [];
      let paramIndex = 1;
      
      for (const [key, value] of Object.entries(filters)) {
        conditions.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
      
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    if (options.sort) {
      const sortClauses = Object.entries(options.sort)
        .map(([key, direction]) => `${key} ${direction === 1 ? 'ASC' : 'DESC'}`)
        .join(', ');
      query += ` ORDER BY ${sortClauses}`;
    }
    
    if (options.limit) {
      query += ` LIMIT ${options.limit}`;
    }
    
    if (options.skip) {
      query += ` OFFSET ${options.skip}`;
    }
    
    const result = await this.pool.query(query, values);
    return result.rows;
  }

  /**
   * Busca dados no MySQL
   */
  async searchMySQL(filters, options) {
    const table = options.collection || 'documents';
    let query = `SELECT * FROM ${table}`;
    const values = [];
    
    if (Object.keys(filters).length > 0) {
      const conditions = [];
      
      for (const [key, value] of Object.entries(filters)) {
        conditions.push(`${key} = ?`);
        values.push(value);
      }
      
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    if (options.sort) {
      const sortClauses = Object.entries(options.sort)
        .map(([key, direction]) => `${key} ${direction === 1 ? 'ASC' : 'DESC'}`)
        .join(', ');
      query += ` ORDER BY ${sortClauses}`;
    }
    
    if (options.limit) {
      query += ` LIMIT ${options.limit}`;
    }
    
    if (options.skip) {
      query += ` OFFSET ${options.skip}`;
    }
    
    const [rows] = await this.pool.execute(query, values);
    return rows;
  }

  /**
   * Atualiza dados
   */
  async update(id, updates, options = {}) {
    if (!this.isConnected) {
      throw new Error('Banco de dados não conectado');
    }
    
    const dbType = this.config.persistence.database.type;
    
    try {
      switch (dbType) {
        case 'mongodb':
          return await this.updateMongoDB(id, updates, options);
        case 'postgresql':
          return await this.updatePostgreSQL(id, updates, options);
        case 'mysql':
          return await this.updateMySQL(id, updates, options);
        default:
          throw new Error(`Operação update não implementada para ${dbType}`);
      }
    } catch (error) {
      this.logger.error('Erro ao atualizar dados:', error);
      this.metrics.errorCount.inc({ type: 'database_update', operation: 'update' });
      throw error;
    }
  }

  /**
   * Atualiza dados no MongoDB
   */
  async updateMongoDB(id, updates, options) {
    const db = this.client.db();
    const collection = options.collection || 'documents';
    
    const result = await db.collection(collection).updateOne(
      { _id: id },
      { $set: { ...updates, updatedAt: new Date() } }
    );
    
    return result.modifiedCount > 0;
  }

  /**
   * Atualiza dados no PostgreSQL
   */
  async updatePostgreSQL(id, updates, options) {
    const table = options.collection || 'documents';
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const query = `UPDATE ${table} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE doc_id = $1`;
    const values = [id, ...Object.values(updates)];
    
    const result = await this.pool.query(query, values);
    return result.rowCount > 0;
  }

  /**
   * Atualiza dados no MySQL
   */
  async updateMySQL(id, updates, options) {
    const table = options.collection || 'documents';
    const setClause = Object.keys(updates)
      .map(key => `${key} = ?`)
      .join(', ');
    
    const query = `UPDATE ${table} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE doc_id = ?`;
    const values = [...Object.values(updates), id];
    
    const [result] = await this.pool.execute(query, values);
    return result.affectedRows > 0;
  }

  /**
   * Remove dados
   */
  async delete(id, options = {}) {
    if (!this.isConnected) {
      throw new Error('Banco de dados não conectado');
    }
    
    const dbType = this.config.persistence.database.type;
    
    try {
      switch (dbType) {
        case 'mongodb':
          return await this.deleteMongoDB(id, options);
        case 'postgresql':
          return await this.deletePostgreSQL(id, options);
        case 'mysql':
          return await this.deleteMySQL(id, options);
        default:
          throw new Error(`Operação delete não implementada para ${dbType}`);
      }
    } catch (error) {
      this.logger.error('Erro ao remover dados:', error);
      this.metrics.errorCount.inc({ type: 'database_delete', operation: 'delete' });
      throw error;
    }
  }

  /**
   * Remove dados do MongoDB
   */
  async deleteMongoDB(id, options) {
    const db = this.client.db();
    const collection = options.collection || 'documents';
    
    const result = await db.collection(collection).deleteOne({ _id: id });
    return result.deletedCount > 0;
  }

  /**
   * Remove dados do PostgreSQL
   */
  async deletePostgreSQL(id, options) {
    const table = options.collection || 'documents';
    const query = `DELETE FROM ${table} WHERE doc_id = $1`;
    
    const result = await this.pool.query(query, [id]);
    return result.rowCount > 0;
  }

  /**
   * Remove dados do MySQL
   */
  async deleteMySQL(id, options) {
    const table = options.collection || 'documents';
    const query = `DELETE FROM ${table} WHERE doc_id = ?`;
    
    const [result] = await this.pool.execute(query, [id]);
    return result.affectedRows > 0;
  }

  /**
   * Função de sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Para o serviço
   */
  async stop() {
    this.logger.info('Parando Database Service...');
    
    try {
      if (this.client) {
        await this.client.close();
      }
      
      if (this.pool) {
        await this.pool.end();
      }
      
      this.isConnected = false;
      this.metrics.databaseConnections.set(0);
      
      this.logger.info('Database Service parado');
    } catch (error) {
      this.logger.error('Erro ao parar Database Service:', error);
    }
  }

  /**
   * Retorna status do serviço
   */
  getStatus() {
    return {
      connected: this.isConnected,
      type: this.config.persistence.database.type,
      retries: this.connectionRetries,
      maxRetries: this.maxRetries
    };
  }
}

module.exports = DatabaseService;