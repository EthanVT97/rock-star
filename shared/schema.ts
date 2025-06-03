import { pgTable, serial, text, timestamp, integer, jsonb, boolean, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Request logs table
export const requestLogs = pgTable('request_logs', {
  id: serial('id').primaryKey(),
  requestId: text('request_id').notNull().unique(),
  method: text('method').notNull(),
  url: text('url').notNull(),
  originalUrl: text('original_url').notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  headers: jsonb('headers'),
  body: text('body'),
  statusCode: integer('status_code'),
  responseTime: integer('response_time'),
  proxyTarget: text('proxy_target'),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  error: text('error'),
  success: boolean('success').default(true),
}, (table) => ({
  timestampIdx: index('timestamp_idx').on(table.timestamp),
  methodIdx: index('method_idx').on(table.method),
  statusCodeIdx: index('status_code_idx').on(table.statusCode),
  ipIdx: index('ip_idx').on(table.ip),
}));

// Server statistics table
export const serverStats = pgTable('server_stats', {
  id: serial('id').primaryKey(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  totalRequests: integer('total_requests').default(0),
  successfulRequests: integer('successful_requests').default(0),
  failedRequests: integer('failed_requests').default(0),
  averageResponseTime: integer('average_response_time').default(0),
  memoryUsage: jsonb('memory_usage'),
  uptime: integer('uptime').default(0),
  activeConnections: integer('active_connections').default(0),
}, (table) => ({
  timestampIdx: index('stats_timestamp_idx').on(table.timestamp),
}));

// Proxy targets configuration table
export const proxyTargets = pgTable('proxy_targets', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  target: text('target').notNull(),
  pattern: text('pattern'),
  enabled: boolean('enabled').default(true),
  timeout: integer('timeout').default(30000),
  secure: boolean('secure').default(true),
  changeOrigin: boolean('change_origin').default(true),
  headers: jsonb('headers'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  nameIdx: index('target_name_idx').on(table.name),
  enabledIdx: index('target_enabled_idx').on(table.enabled),
}));

// Error logs table
export const errorLogs = pgTable('error_logs', {
  id: serial('id').primaryKey(),
  requestId: text('request_id'),
  errorType: text('error_type').notNull(),
  errorMessage: text('error_message').notNull(),
  errorStack: text('error_stack'),
  context: jsonb('context'),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  resolved: boolean('resolved').default(false),
}, (table) => ({
  timestampIdx: index('error_timestamp_idx').on(table.timestamp),
  typeIdx: index('error_type_idx').on(table.errorType),
  resolvedIdx: index('error_resolved_idx').on(table.resolved),
}));

// API usage analytics table
export const apiAnalytics = pgTable('api_analytics', {
  id: serial('id').primaryKey(),
  endpoint: text('endpoint').notNull(),
  method: text('method').notNull(),
  date: timestamp('date').defaultNow().notNull(),
  requestCount: integer('request_count').default(0),
  averageResponseTime: integer('average_response_time').default(0),
  errorCount: integer('error_count').default(0),
  uniqueIps: integer('unique_ips').default(0),
}, (table) => ({
  endpointDateIdx: index('endpoint_date_idx').on(table.endpoint, table.date),
  dateIdx: index('analytics_date_idx').on(table.date),
}));

// Relations
export const requestLogsRelations = relations(requestLogs, ({ one }) => ({
  errorLog: one(errorLogs, {
    fields: [requestLogs.requestId],
    references: [errorLogs.requestId],
  }),
}));

export const errorLogsRelations = relations(errorLogs, ({ one }) => ({
  requestLog: one(requestLogs, {
    fields: [errorLogs.requestId],
    references: [requestLogs.requestId],
  }),
}));

// TypeScript types
export type RequestLog = typeof requestLogs.$inferSelect;
export type InsertRequestLog = typeof requestLogs.$inferInsert;

export type ServerStat = typeof serverStats.$inferSelect;
export type InsertServerStat = typeof serverStats.$inferInsert;

export type ProxyTarget = typeof proxyTargets.$inferSelect;
export type InsertProxyTarget = typeof proxyTargets.$inferInsert;

export type ErrorLog = typeof errorLogs.$inferSelect;
export type InsertErrorLog = typeof errorLogs.$inferInsert;

export type ApiAnalytic = typeof apiAnalytics.$inferSelect;
export type InsertApiAnalytic = typeof apiAnalytics.$inferInsert;