/**
 * Models Index - Message Schema Registry
 * Exporta todos os modelos do sistema
 */

const Schema = require('./Schema');
const { CompatibilityConfig, SystemConfig } = require('./Config');
const AuditLog = require('./AuditLog');
const User = require('./User');

module.exports = {
  Schema,
  CompatibilityConfig,
  SystemConfig,
  AuditLog,
  User
};