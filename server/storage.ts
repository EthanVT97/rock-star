import { requestLogs, serverStats, proxyTargets, errorLogs, apiAnalytics, type InsertRequestLog, type InsertServerStat, type InsertProxyTarget, type InsertErrorLog, type InsertApiAnalytic, type RequestLog, type ServerStat, type ProxyTarget, type ErrorLog, type ApiAnalytic } from "../shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";

export interface IStorage {
  // Request logs
  logRequest(request: InsertRequestLog): Promise<RequestLog>;
  getRequestLogs(limit?: number, offset?: number): Promise<RequestLog[]>;
  getRequestById(requestId: string): Promise<RequestLog | undefined>;
  
  // Server stats
  recordServerStats(stats: InsertServerStat): Promise<ServerStat>;
  getLatestServerStats(): Promise<ServerStat | undefined>;
  getServerStatsHistory(hours?: number): Promise<ServerStat[]>;
  
  // Proxy targets
  createProxyTarget(target: InsertProxyTarget): Promise<ProxyTarget>;
  getProxyTargets(): Promise<ProxyTarget[]>;
  getEnabledProxyTargets(): Promise<ProxyTarget[]>;
  updateProxyTarget(id: number, target: Partial<InsertProxyTarget>): Promise<ProxyTarget | undefined>;
  deleteProxyTarget(id: number): Promise<boolean>;
  
  // Error logs
  logError(error: InsertErrorLog): Promise<ErrorLog>;
  getErrorLogs(limit?: number, resolved?: boolean): Promise<ErrorLog[]>;
  markErrorResolved(id: number): Promise<boolean>;
  
  // Analytics
  recordApiAnalytics(analytics: InsertApiAnalytic): Promise<ApiAnalytic>;
  getApiAnalytics(endpoint?: string, days?: number): Promise<ApiAnalytic[]>;
  getDashboardStats(): Promise<{
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    uniqueIps: number;
    topEndpoints: Array<{ endpoint: string; count: number }>;
    errorRate: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  // Request logs
  async logRequest(request: InsertRequestLog): Promise<RequestLog> {
    const [log] = await db
      .insert(requestLogs)
      .values(request)
      .returning();
    return log;
  }

  async getRequestLogs(limit = 100, offset = 0): Promise<RequestLog[]> {
    return await db
      .select()
      .from(requestLogs)
      .orderBy(desc(requestLogs.timestamp))
      .limit(limit)
      .offset(offset);
  }

  async getRequestById(requestId: string): Promise<RequestLog | undefined> {
    const [log] = await db
      .select()
      .from(requestLogs)
      .where(eq(requestLogs.requestId, requestId));
    return log || undefined;
  }

  // Server stats
  async recordServerStats(stats: InsertServerStat): Promise<ServerStat> {
    const [stat] = await db
      .insert(serverStats)
      .values(stats)
      .returning();
    return stat;
  }

  async getLatestServerStats(): Promise<ServerStat | undefined> {
    const [stat] = await db
      .select()
      .from(serverStats)
      .orderBy(desc(serverStats.timestamp))
      .limit(1);
    return stat || undefined;
  }

  async getServerStatsHistory(hours = 24): Promise<ServerStat[]> {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    return await db
      .select()
      .from(serverStats)
      .where(gte(serverStats.timestamp, cutoffTime))
      .orderBy(desc(serverStats.timestamp));
  }

  // Proxy targets
  async createProxyTarget(target: InsertProxyTarget): Promise<ProxyTarget> {
    const [proxyTarget] = await db
      .insert(proxyTargets)
      .values({
        ...target,
        updatedAt: new Date(),
      })
      .returning();
    return proxyTarget;
  }

  async getProxyTargets(): Promise<ProxyTarget[]> {
    return await db
      .select()
      .from(proxyTargets)
      .orderBy(proxyTargets.name);
  }

  async getEnabledProxyTargets(): Promise<ProxyTarget[]> {
    return await db
      .select()
      .from(proxyTargets)
      .where(eq(proxyTargets.enabled, true))
      .orderBy(proxyTargets.name);
  }

  async updateProxyTarget(id: number, target: Partial<InsertProxyTarget>): Promise<ProxyTarget | undefined> {
    const [updated] = await db
      .update(proxyTargets)
      .set({
        ...target,
        updatedAt: new Date(),
      })
      .where(eq(proxyTargets.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteProxyTarget(id: number): Promise<boolean> {
    const result = await db
      .delete(proxyTargets)
      .where(eq(proxyTargets.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Error logs
  async logError(error: InsertErrorLog): Promise<ErrorLog> {
    const [log] = await db
      .insert(errorLogs)
      .values(error)
      .returning();
    return log;
  }

  async getErrorLogs(limit = 100, resolved?: boolean): Promise<ErrorLog[]> {
    if (resolved !== undefined) {
      return await db
        .select()
        .from(errorLogs)
        .where(eq(errorLogs.resolved, resolved))
        .orderBy(desc(errorLogs.timestamp))
        .limit(limit);
    }

    return await db
      .select()
      .from(errorLogs)
      .orderBy(desc(errorLogs.timestamp))
      .limit(limit);
  }

  async markErrorResolved(id: number): Promise<boolean> {
    const result = await db
      .update(errorLogs)
      .set({ resolved: true })
      .where(eq(errorLogs.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Analytics
  async recordApiAnalytics(analytics: InsertApiAnalytic): Promise<ApiAnalytic> {
    const [analytic] = await db
      .insert(apiAnalytics)
      .values(analytics)
      .returning();
    return analytic;
  }

  async getApiAnalytics(endpoint?: string, days = 7): Promise<ApiAnalytic[]> {
    const cutoffTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    let query = db
      .select()
      .from(apiAnalytics)
      .where(gte(apiAnalytics.date, cutoffTime))
      .orderBy(desc(apiAnalytics.date));

    if (endpoint) {
      query = query.where(eq(apiAnalytics.endpoint, endpoint));
    }

    return await query;
  }

  async getDashboardStats(): Promise<{
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    uniqueIps: number;
    topEndpoints: Array<{ endpoint: string; count: number }>;
    errorRate: number;
  }> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get request statistics
    const [requestStats] = await db
      .select({
        totalRequests: sql<number>`count(*)`,
        successfulRequests: sql<number>`count(*) filter (where ${requestLogs.success} = true)`,
        failedRequests: sql<number>`count(*) filter (where ${requestLogs.success} = false)`,
        averageResponseTime: sql<number>`avg(${requestLogs.responseTime})`,
        uniqueIps: sql<number>`count(distinct ${requestLogs.ip})`,
      })
      .from(requestLogs)
      .where(gte(requestLogs.timestamp, twentyFourHoursAgo));

    // Get top endpoints
    const topEndpoints = await db
      .select({
        endpoint: requestLogs.url,
        count: sql<number>`count(*)`,
      })
      .from(requestLogs)
      .where(gte(requestLogs.timestamp, twentyFourHoursAgo))
      .groupBy(requestLogs.url)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    const errorRate = requestStats.totalRequests > 0 
      ? (requestStats.failedRequests / requestStats.totalRequests) * 100 
      : 0;

    return {
      totalRequests: requestStats.totalRequests || 0,
      successfulRequests: requestStats.successfulRequests || 0,
      failedRequests: requestStats.failedRequests || 0,
      averageResponseTime: Math.round(requestStats.averageResponseTime || 0),
      uniqueIps: requestStats.uniqueIps || 0,
      topEndpoints: topEndpoints.map(e => ({ endpoint: e.endpoint, count: e.count })),
      errorRate: Math.round(errorRate * 100) / 100,
    };
  }
}

export const storage = new DatabaseStorage();