const dbService = require('../services/db.service');
const auditService = require('../services/audit.service');

/**
 * Enforces Tenant Scoping & Isolation
 * Never trusts organizationId provided in req.body or req.query.
 */
async function resolveTenantContext(req, res, next) {
  // Default fallback organization for unauthenticated / legacy system triggers
  let resolvedOrgId = req.user?.organizationId || 'default-org-id';

  // Support Organization Switching via X-Organization-Id header ONLY IF user has membership
  const requestedOrgId = req.headers['x-organization-id'];
  if (requestedOrgId && req.user && req.user.id !== 'usr_system_default') {
    if (dbService.isDbConnected && dbService.prisma) {
      const membership = await dbService.prisma.organizationMember.findFirst({
        where: {
          organizationId: requestedOrgId,
          userId: req.user.id,
          status: 'ACTIVE'
        }
      });

      if (membership || req.user.role === 'SUPER_ADMIN') {
        resolvedOrgId = requestedOrgId;
      } else {
        await auditService.log({
          organizationId: req.user.organizationId,
          userId: req.user.id,
          action: 'UNAUTHORIZED_ORG_SWITCH_ATTEMPT',
          entity: 'ORGANIZATION',
          entityId: requestedOrgId,
          details: { requestedOrgId, userOrgId: req.user.organizationId }
        });

        return res.status(403).json({
          success: false,
          message: 'Access Denied: You do not have active membership in the target organization.'
        });
      }
    } else {
      // Memory mode checking
      if (req.user.organizationId === requestedOrgId || req.user.role === 'SUPER_ADMIN') {
        resolvedOrgId = requestedOrgId;
      } else {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: You do not have active membership in the target organization.'
        });
      }
    }
  }

  // Inject verified organizationId context into request
  req.organizationId = resolvedOrgId;

  // Sanitize req.body & req.query to prevent injection of foreign organizationId
  if (req.body && typeof req.body === 'object') {
    req.body.organizationId = resolvedOrgId;
  }
  if (req.query && typeof req.query === 'object') {
    delete req.query.organizationId;
  }

  next();
}

/**
 * Verifies that a target Project belongs strictly to req.organizationId
 */
async function enforceProjectBelongsToTenant(req, res, next) {
  const projId = req.params.projectId || req.params.id || req.body.projectId;
  if (!projId) return next();

  const orgId = req.organizationId || 'default-org-id';
  const projectService = require('../services/project.service');

  try {
    const projects = await projectService.listProjects(orgId);
    const numericId = Number(projId);
    const isNumeric = !isNaN(numericId) && numericId > 0;
    const exists = projects.find(p => (isNumeric && p.id === numericId) || p.dbId === String(projId));

    if (!exists && req.user?.role !== 'SUPER_ADMIN') {
      return res.status(404).json({
        success: false,
        message: `Project ${projId} not found in current organization context.`
      });
    }

    req.targetProject = exists;
  } catch (e) {
    console.error('[TENANT-MIDDLEWARE] Project verification error:', e.message);
  }

  next();
}

module.exports = {
  resolveTenantContext,
  enforceProjectBelongsToTenant
};
