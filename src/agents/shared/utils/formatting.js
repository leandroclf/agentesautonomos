/**
 * Utilitários de formatação para os agentes autônomos
 */
class FormattingUtils {
  /**
   * Formata bytes em formato legível
   */
  static formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Formata duração em milissegundos para formato legível
   */
  static formatDuration(milliseconds) {
    if (milliseconds < 1000) {
      return `${milliseconds}ms`;
    }
    
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
    }
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    
    return `${seconds}s`;
  }

  /**
   * Formata timestamp para formato legível
   */
  static formatTimestamp(timestamp, options = {}) {
    const {
      includeTime = true,
      includeSeconds = true,
      includeMilliseconds = false,
      timezone = 'UTC'
    } = options;
    
    const date = new Date(timestamp);
    
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    
    const dateOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone
    };
    
    if (includeTime) {
      dateOptions.hour = '2-digit';
      dateOptions.minute = '2-digit';
      
      if (includeSeconds) {
        dateOptions.second = '2-digit';
      }
    }
    
    let formatted = date.toLocaleString('pt-BR', dateOptions);
    
    if (includeMilliseconds && includeTime) {
      const ms = date.getMilliseconds().toString().padStart(3, '0');
      formatted += `.${ms}`;
    }
    
    return formatted;
  }

  /**
   * Formata número com separadores de milhares
   */
  static formatNumber(number, options = {}) {
    const {
      decimals = 0,
      locale = 'pt-BR',
      currency = null
    } = options;
    
    if (typeof number !== 'number' || isNaN(number)) {
      return '0';
    }
    
    const formatOptions = {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    };
    
    if (currency) {
      formatOptions.style = 'currency';
      formatOptions.currency = currency;
    }
    
    return number.toLocaleString(locale, formatOptions);
  }

  /**
   * Formata porcentagem
   */
  static formatPercentage(value, total, decimals = 1) {
    if (total === 0) return '0%';
    
    const percentage = (value / total) * 100;
    return `${percentage.toFixed(decimals)}%`;
  }

  /**
   * Trunca texto com reticências
   */
  static truncateText(text, maxLength = 100, suffix = '...') {
    if (typeof text !== 'string') {
      return '';
    }
    
    if (text.length <= maxLength) {
      return text;
    }
    
    return text.substring(0, maxLength - suffix.length) + suffix;
  }

  /**
   * Formata objeto para exibição em logs
   */
  static formatObjectForLog(obj, options = {}) {
    const {
      maxDepth = 3,
      maxArrayLength = 10,
      hideSecrets = true,
      secretKeys = ['password', 'token', 'key', 'secret', 'auth']
    } = options;
    
    const formatValue = (value, depth = 0) => {
      if (depth > maxDepth) {
        return '[Max Depth Reached]';
      }
      
      if (value === null) return 'null';
      if (value === undefined) return 'undefined';
      
      if (typeof value === 'string') {
        return `"${this.truncateText(value, 200)}"`;
      }
      
      if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }
      
      if (value instanceof Date) {
        return `Date(${value.toISOString()})`;
      }
      
      if (Array.isArray(value)) {
        const items = value.slice(0, maxArrayLength).map(item => formatValue(item, depth + 1));
        const truncated = value.length > maxArrayLength ? `, ... +${value.length - maxArrayLength} more` : '';
        return `[${items.join(', ')}${truncated}]`;
      }
      
      if (typeof value === 'object') {
        const entries = Object.entries(value).map(([key, val]) => {
          let formattedValue = val;
          
          // Ocultar valores sensíveis
          if (hideSecrets && secretKeys.some(secretKey => 
            key.toLowerCase().includes(secretKey.toLowerCase())
          )) {
            formattedValue = '[HIDDEN]';
          } else {
            formattedValue = formatValue(val, depth + 1);
          }
          
          return `${key}: ${formattedValue}`;
        });
        
        return `{${entries.join(', ')}}`;
      }
      
      return String(value);
    };
    
    return formatValue(obj);
  }

  /**
   * Formata status com cores para terminal
   */
  static formatStatus(status, useColors = true) {
    if (!useColors) {
      return status.toUpperCase();
    }
    
    const colors = {
      success: '\x1b[32m', // Verde
      error: '\x1b[31m',   // Vermelho
      warning: '\x1b[33m', // Amarelo
      info: '\x1b[36m',    // Ciano
      pending: '\x1b[35m', // Magenta
      running: '\x1b[34m', // Azul
      reset: '\x1b[0m'     // Reset
    };
    
    const statusMap = {
      'completed': 'success',
      'success': 'success',
      'failed': 'error',
      'error': 'error',
      'warning': 'warning',
      'info': 'info',
      'pending': 'pending',
      'running': 'running',
      'cancelled': 'warning'
    };
    
    const colorKey = statusMap[status.toLowerCase()] || 'info';
    const color = colors[colorKey];
    
    return `${color}${status.toUpperCase()}${colors.reset}`;
  }

  /**
   * Formata tabela simples para exibição em terminal
   */
  static formatTable(data, options = {}) {
    if (!Array.isArray(data) || data.length === 0) {
      return 'No data to display';
    }
    
    const {
      headers = Object.keys(data[0]),
      maxColumnWidth = 30,
      separator = ' | '
    } = options;
    
    // Calcular larguras das colunas
    const columnWidths = headers.map(header => {
      const headerWidth = header.length;
      const maxDataWidth = Math.max(
        ...data.map(row => String(row[header] || '').length)
      );
      return Math.min(Math.max(headerWidth, maxDataWidth), maxColumnWidth);
    });
    
    // Função para truncar e preencher texto
    const padAndTruncate = (text, width) => {
      const str = String(text || '');
      if (str.length > width) {
        return str.substring(0, width - 3) + '...';
      }
      return str.padEnd(width);
    };
    
    // Criar linhas
    const lines = [];
    
    // Cabeçalho
    const headerLine = headers
      .map((header, i) => padAndTruncate(header, columnWidths[i]))
      .join(separator);
    lines.push(headerLine);
    
    // Linha separadora
    const separatorLine = columnWidths
      .map(width => '-'.repeat(width))
      .join(separator.replace(/\s/g, '-'));
    lines.push(separatorLine);
    
    // Dados
    data.forEach(row => {
      const dataLine = headers
        .map((header, i) => padAndTruncate(row[header], columnWidths[i]))
        .join(separator);
      lines.push(dataLine);
    });
    
    return lines.join('\n');
  }

  /**
   * Formata métricas para exibição
   */
  static formatMetrics(metrics) {
    const formatted = {};
    
    for (const [key, value] of Object.entries(metrics)) {
      if (typeof value === 'number') {
        if (key.includes('bytes') || key.includes('size')) {
          formatted[key] = this.formatBytes(value);
        } else if (key.includes('duration') || key.includes('time')) {
          formatted[key] = this.formatDuration(value);
        } else if (key.includes('percentage') || key.includes('rate')) {
          formatted[key] = `${value.toFixed(2)}%`;
        } else {
          formatted[key] = this.formatNumber(value);
        }
      } else if (value instanceof Date) {
        formatted[key] = this.formatTimestamp(value);
      } else {
        formatted[key] = value;
      }
    }
    
    return formatted;
  }

  /**
   * Formata erro para exibição
   */
  static formatError(error, options = {}) {
    const {
      includeStack = false,
      maxStackLines = 10
    } = options;
    
    if (!error) {
      return 'Unknown error';
    }
    
    let formatted = {
      message: error.message || 'Unknown error',
      name: error.name || 'Error',
      code: error.code,
      timestamp: this.formatTimestamp(new Date())
    };
    
    if (includeStack && error.stack) {
      const stackLines = error.stack.split('\n');
      formatted.stack = stackLines.slice(0, maxStackLines).join('\n');
      
      if (stackLines.length > maxStackLines) {
        formatted.stack += `\n... +${stackLines.length - maxStackLines} more lines`;
      }
    }
    
    return formatted;
  }

  /**
   * Formata progresso como barra de progresso
   */
  static formatProgressBar(current, total, options = {}) {
    const {
      width = 20,
      fillChar = '█',
      emptyChar = '░',
      showPercentage = true,
      showNumbers = true
    } = options;
    
    if (total === 0) {
      return `${emptyChar.repeat(width)} 0%`;
    }
    
    const percentage = Math.min(current / total, 1);
    const filled = Math.floor(percentage * width);
    const empty = width - filled;
    
    let bar = fillChar.repeat(filled) + emptyChar.repeat(empty);
    
    if (showPercentage) {
      bar += ` ${(percentage * 100).toFixed(1)}%`;
    }
    
    if (showNumbers) {
      bar += ` (${current}/${total})`;
    }
    
    return bar;
  }

  /**
   * Converte camelCase para snake_case
   */
  static camelToSnake(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  /**
   * Converte snake_case para camelCase
   */
  static snakeToCamel(str) {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * Converte objeto com chaves camelCase para snake_case
   */
  static objectToSnakeCase(obj) {
    if (Array.isArray(obj)) {
      return obj.map(item => this.objectToSnakeCase(item));
    }
    
    if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
      const converted = {};
      for (const [key, value] of Object.entries(obj)) {
        converted[this.camelToSnake(key)] = this.objectToSnakeCase(value);
      }
      return converted;
    }
    
    return obj;
  }

  /**
   * Converte objeto com chaves snake_case para camelCase
   */
  static objectToCamelCase(obj) {
    if (Array.isArray(obj)) {
      return obj.map(item => this.objectToCamelCase(item));
    }
    
    if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
      const converted = {};
      for (const [key, value] of Object.entries(obj)) {
        converted[this.snakeToCamel(key)] = this.objectToCamelCase(value);
      }
      return converted;
    }
    
    return obj;
  }
}

module.exports = FormattingUtils;