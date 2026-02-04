// SQL Security - Parameterized queries and injection prevention

// Allowed table names (whitelist)
export const ALLOWED_TABLES = new Set([
  'agents',
  'swarms',
  'events',
  'users',
  'api_keys',
  'tasks',
  'workflows'
]);

// Allowed column names (whitelist)
export const ALLOWED_COLUMNS = new Set([
  'id', 'name', 'status', 'type', 'created_at', 'updated_at',
  'config', 'metadata', 'user_id', 'swarm_id', 'agent_id',
  'payload', 'timestamp', 'scope', 'hash', 'is_revoked',
  'expires_at', 'last_used_at'
]);

// SQL injection pattern detection
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b)/i,
  /(\b(UNION|EXEC|EXECUTE|SCRIPT)\b)/i,
  /(--|#|\/\*|\*\/)/,
  /(\bOR\b.+?=.+?\b|\bAND\b.+?=.+?\b)/i,
  /(\bxp_|sp_|sys_)/i,
  /(\bWAITFOR\b|\bDELAY\b|\bSHUTDOWN\b)/i
];

/**
 * Validate SQL identifier (table/column name)
 */
export function validateIdentifier(identifier: string): boolean {
  // Must be alphanumeric with underscores only
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    return false;
  }
  
  // Check whitelist
  return ALLOWED_TABLES.has(identifier) || ALLOWED_COLUMNS.has(identifier);
}

/**
 * Validate table name
 */
export function validateTableName(table: string): boolean {
  return ALLOWED_TABLES.has(table);
}

/**
 * Validate column name
 */
export function validateColumnName(column: string): boolean {
  return ALLOWED_COLUMNS.has(column);
}

/**
 * Check for SQL injection attempts in input
 */
export function detectSqlInjection(input: string): boolean {
  if (typeof input !== 'string') return false;
  
  return SQL_INJECTION_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Create parameterized query with validation
 */
export function createParameterizedQuery(
  table: string,
  columns: string[],
  whereClause?: { column: string; operator: string }
): { sql: string; valid: boolean; error?: string } {
  
  // Validate table
  if (!validateTableName(table)) {
    return { sql: '', valid: false, error: `Invalid table: ${table}` };
  }
  
  // Validate columns
  for (const col of columns) {
    if (!validateColumnName(col)) {
      return { sql: '', valid: false, error: `Invalid column: ${col}` };
    }
  }
  
  // Build query
  const cols = columns.join(', ');
  let sql = `SELECT ${cols} FROM ${table}`;
  
  if (whereClause) {
    if (!validateColumnName(whereClause.column)) {
      return { sql: '', valid: false, error: `Invalid where column: ${whereClause.column}` };
    }
    
    const validOperators = ['=', '<', '>', '<=', '>=', '!=', 'LIKE', 'IN'];
    if (!validOperators.includes(whereClause.operator.toUpperCase())) {
      return { sql: '', valid: false, error: `Invalid operator: ${whereClause.operator}` };
    }
    
    sql += ` WHERE ${whereClause.column} ${whereClause.operator} ?`;
  }
  
  return { sql, valid: true };
}

/**
 * Sanitize user input for SQL
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return '';
  
  // Remove null bytes
  let sanitized = input.replace(/\x00/g, '');
  
  // Escape single quotes (for defense in depth - parameterized queries should be used)
  sanitized = sanitized.replace(/'/g, "''");
  
  return sanitized;
}

/**
 * Build safe INSERT query
 */
export function buildInsertQuery(
  table: string,
  data: Record<string, any>
): { sql: string; values: any[]; valid: boolean; error?: string } {
  
  if (!validateTableName(table)) {
    return { sql: '', values: [], valid: false, error: `Invalid table: ${table}` };
  }
  
  const columns: string[] = [];
  const placeholders: string[] = [];
  const values: any[] = [];
  
  for (const [key, value] of Object.entries(data)) {
    if (!validateColumnName(key)) {
      return { sql: '', values: [], valid: false, error: `Invalid column: ${key}` };
    }
    
    columns.push(key);
    placeholders.push('?');
    values.push(value);
  }
  
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
  
  return { sql, values, valid: true };
}

/**
 * Build safe UPDATE query
 */
export function buildUpdateQuery(
  table: string,
  data: Record<string, any>,
  whereColumn: string
): { sql: string; values: any[]; valid: boolean; error?: string } {
  
  if (!validateTableName(table)) {
    return { sql: '', values: [], valid: false, error: `Invalid table: ${table}` };
  }
  
  if (!validateColumnName(whereColumn)) {
    return { sql: '', values: [], valid: false, error: `Invalid where column: ${whereColumn}` };
  }
  
  const setClauses: string[] = [];
  const values: any[] = [];
  
  for (const [key, value] of Object.entries(data)) {
    if (!validateColumnName(key)) {
      return { sql: '', values: [], valid: false, error: `Invalid column: ${key}` };
    }
    
    setClauses.push(`${key} = ?`);
    values.push(value);
  }
  
  const sql = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${whereColumn} = ?`;
  
  return { sql, values, valid: true };
}
