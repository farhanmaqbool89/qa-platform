const dbService = require('./db.service');

class AuditService {
  async log({ organizationId, userId, action, entity, entityId, details, ipAddress }) {
    const timestamp = new Date().toISOString();
    const entry = {
      organizationId: organizationId || 'default-org-id',
      userId: userId || null,
      action: action || 'UNKNOWN_ACTION',
      entity: entity || 'SYSTEM',
      entityId: entityId || null,
      details: typeof details === 'object' ? JSON.stringify(details) : (details || ''),
      createdAt: timestamp
    };

    console.log(`[AUDIT-LOG] [Org: ${entry.organizationId}] User: ${entry.userId || 'System'} | ${entry.action} on ${entry.entity}:${entry.entityId || 'N/A'}`);

    if (dbService.isDbConnected && dbService.prisma) {
      try {
        await dbService.prisma.auditLog.create({
          data: {
            organizationId: entry.organizationId,
            userId: entry.userId,
            action: entry.action,
            entity: entry.entity,
            entityId: entry.entityId,
            details: entry.details
          }
        });
      } catch (e) {
        console.error('[AUDIT-SERVICE] Failed to save audit log to DB:', e.message);
      }
    }

    return entry;
  }

  async getAuditLogs(organizationId, limit = 50) {
    const orgId = organizationId || 'default-org-id';
    if (dbService.isDbConnected && dbService.prisma) {
      try {
        return await dbService.prisma.auditLog.findMany({
          where: { organizationId: orgId },
          orderBy: { createdAt: 'desc' },
          take: limit
        });
      } catch (e) {
        return [];
      }
    }
    return [];
  }
}

module.exports = new AuditService();
