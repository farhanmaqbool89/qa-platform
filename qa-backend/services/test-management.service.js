const dbService = require('./db.service');
const auditService = require('./audit.service');

class TestManagementService {

  // =================================================================
  // 📋 1. REQUIREMENTS MANAGEMENT
  // =================================================================
  async listRequirements(organizationId, projectId) {
    const orgId = organizationId || await dbService.getDefaultOrganizationId();
    if (dbService.isDbConnected && dbService.prisma) {
      try {
        const where = { organizationId: orgId };
        if (projectId) where.projectId = projectId;
        return await dbService.prisma.requirement.findMany({
          where,
          include: { testCases: true },
          orderBy: { createdAt: 'desc' }
        });
      } catch (e) {
        console.warn('[TEST-MGMT] DB query failed for requirements:', e.message);
      }
    }
    return [];
  }

  async createRequirement(data, organizationId, userId) {
    const orgId = organizationId || await dbService.getDefaultOrganizationId();
    if (dbService.isDbConnected && dbService.prisma) {
      const created = await dbService.prisma.requirement.create({
        data: {
          organizationId: orgId,
          projectId: data.projectId,
          title: data.title,
          description: data.description || '',
          externalKey: data.externalKey || null,
          status: data.status || 'OPEN'
        }
      });
      await auditService.log({
        organizationId: orgId,
        userId,
        action: 'CREATE_REQUIREMENT',
        entity: 'REQUIREMENT',
        entityId: created.id,
        details: { title: data.title }
      });
      return created;
    }
    return { id: `req_${Date.now()}`, ...data, organizationId: orgId };
  }

  // =================================================================
  // 🧪 2. MANUAL & AUTOMATED TEST CASES
  // =================================================================
  async listTestCases(organizationId, projectId) {
    const orgId = organizationId || await dbService.getDefaultOrganizationId();
    if (dbService.isDbConnected && dbService.prisma) {
      try {
        const where = { organizationId: orgId };
        if (projectId) where.projectId = projectId;
        return await dbService.prisma.testCase.findMany({
          where,
          include: { requirement: true, featureFile: true },
          orderBy: { createdAt: 'desc' }
        });
      } catch (e) {
        console.warn('[TEST-MGMT] DB query failed for test cases:', e.message);
      }
    }
    return [];
  }

  async createTestCase(data, organizationId, userId) {
    const orgId = organizationId || await dbService.getDefaultOrganizationId();
    if (dbService.isDbConnected && dbService.prisma) {
      const created = await dbService.prisma.testCase.create({
        data: {
          organizationId: orgId,
          projectId: data.projectId,
          title: data.title,
          description: data.description || '',
          steps: typeof data.steps === 'object' ? JSON.stringify(data.steps) : (data.steps || ''),
          expectedResult: data.expectedResult || '',
          priority: data.priority || 'MEDIUM',
          severity: data.severity || 'NORMAL',
          automationStatus: data.automationStatus || 'MANUAL',
          testType: data.testType || 'FUNCTIONAL',
          requirementId: data.requirementId || null,
          featureFileId: data.featureFileId || null
        }
      });
      await auditService.log({
        organizationId: orgId,
        userId,
        action: 'CREATE_TEST_CASE',
        entity: 'TEST_CASE',
        entityId: created.id,
        details: { title: data.title }
      });
      return created;
    }
    return { id: `tc_${Date.now()}`, ...data, organizationId: orgId };
  }

  // =================================================================
  // 📂 3. TEST SUITES
  // =================================================================
  async listTestSuites(organizationId, projectId) {
    const orgId = organizationId || await dbService.getDefaultOrganizationId();
    if (dbService.isDbConnected && dbService.prisma) {
      try {
        const where = { organizationId: orgId };
        if (projectId) where.projectId = projectId;
        return await dbService.prisma.testSuite.findMany({
          where,
          include: { testCases: true },
          orderBy: { createdAt: 'desc' }
        });
      } catch (e) {
        console.warn('[TEST-MGMT] DB query failed for test suites:', e.message);
      }
    }
    return [];
  }

  async createTestSuite(data, organizationId, userId) {
    const orgId = organizationId || await dbService.getDefaultOrganizationId();
    if (dbService.isDbConnected && dbService.prisma) {
      const created = await dbService.prisma.testSuite.create({
        data: {
          organizationId: orgId,
          projectId: data.projectId,
          name: data.name,
          description: data.description || '',
          tags: data.tags || null
        }
      });
      await auditService.log({
        organizationId: orgId,
        userId,
        action: 'CREATE_TEST_SUITE',
        entity: 'TEST_SUITE',
        entityId: created.id,
        details: { name: data.name }
      });
      return created;
    }
    return { id: `suite_${Date.now()}`, ...data, organizationId: orgId };
  }

  // =================================================================
  // 🎯 4. TEST PLANS
  // =================================================================
  async listTestPlans(organizationId, projectId) {
    const orgId = organizationId || await dbService.getDefaultOrganizationId();
    if (dbService.isDbConnected && dbService.prisma) {
      try {
        const where = { organizationId: orgId };
        if (projectId) where.projectId = projectId;
        return await dbService.prisma.testPlan.findMany({
          where,
          include: { testSuites: true, testExecutions: true },
          orderBy: { createdAt: 'desc' }
        });
      } catch (e) {
        console.warn('[TEST-MGMT] DB query failed for test plans:', e.message);
      }
    }
    return [];
  }

  async createTestPlan(data, organizationId, userId) {
    const orgId = organizationId || await dbService.getDefaultOrganizationId();
    if (dbService.isDbConnected && dbService.prisma) {
      const created = await dbService.prisma.testPlan.create({
        data: {
          organizationId: orgId,
          projectId: data.projectId,
          name: data.name,
          description: data.description || '',
          status: data.status || 'PLANNED',
          startDate: data.startDate ? new Date(data.startDate) : null,
          endDate: data.endDate ? new Date(data.endDate) : null
        }
      });
      await auditService.log({
        organizationId: orgId,
        userId,
        action: 'CREATE_TEST_PLAN',
        entity: 'TEST_PLAN',
        entityId: created.id,
        details: { name: data.name }
      });
      return created;
    }
    return { id: `plan_${Date.now()}`, ...data, organizationId: orgId };
  }

  // =================================================================
  // 📦 5. RELEASES MANAGEMENT
  // =================================================================
  async listReleases(organizationId, projectId) {
    const orgId = organizationId || await dbService.getDefaultOrganizationId();
    if (dbService.isDbConnected && dbService.prisma) {
      try {
        const where = { organizationId: orgId };
        if (projectId) where.projectId = projectId;
        return await dbService.prisma.release.findMany({
          where,
          orderBy: { createdAt: 'desc' }
        });
      } catch (e) {
        console.warn('[TEST-MGMT] DB query failed for releases:', e.message);
      }
    }
    return [];
  }

  async createRelease(data, organizationId, userId) {
    const orgId = organizationId || await dbService.getDefaultOrganizationId();
    if (dbService.isDbConnected && dbService.prisma) {
      const created = await dbService.prisma.release.create({
        data: {
          organizationId: orgId,
          projectId: data.projectId,
          version: data.version,
          name: data.name,
          description: data.description || '',
          status: data.status || 'PLANNED',
          releaseDate: data.releaseDate ? new Date(data.releaseDate) : null
        }
      });
      await auditService.log({
        organizationId: orgId,
        userId,
        action: 'CREATE_RELEASE',
        entity: 'RELEASE',
        entityId: created.id,
        details: { version: data.version, name: data.name }
      });
      return created;
    }
    return { id: `rel_${Date.now()}`, ...data, organizationId: orgId };
  }

  // =================================================================
  // 🔗 6. REQUIREMENTS TRACEABILITY MATRIX (RTM)
  // =================================================================
  async generateRTM(organizationId, projectId) {
    const orgId = organizationId || await dbService.getDefaultOrganizationId();

    let requirements = [];
    let testCases = [];
    let executions = [];

    if (dbService.isDbConnected && dbService.prisma) {
      try {
        requirements = await dbService.prisma.requirement.findMany({
          where: { organizationId: orgId, ...(projectId ? { projectId } : {}) },
          include: { testCases: true }
        });

        testCases = await dbService.prisma.testCase.findMany({
          where: { organizationId: orgId, ...(projectId ? { projectId } : {}) },
          include: { featureFile: true, executionResults: true }
        });

        executions = await dbService.prisma.testExecution.findMany({
          where: { organizationId: orgId, ...(projectId ? { projectId } : {}) },
          take: 10,
          orderBy: { createdAt: 'desc' }
        });
      } catch (e) {
        console.warn('[TEST-MGMT] DB RTM query failed, using empty matrix:', e.message);
      }
    }

    // Build RTM Rows
    const matrixRows = requirements.map(req => {
      const linkedCases = testCases.filter(tc => tc.requirementId === req.id || req.testCases?.some(c => c.id === tc.id));
      const hasAutomated = linkedCases.some(tc => tc.automationStatus === 'AUTOMATED' || tc.featureFileId);
      const isCovered = linkedCases.length > 0;
      
      const executionStatuses = linkedCases.flatMap(tc => tc.executionResults?.map(r => r.status) || []);
      const overallStatus = executionStatuses.includes('FAILED')
        ? 'FAILED'
        : executionStatuses.includes('PASSED')
          ? 'PASSED'
          : (isCovered ? 'UNEXECUTED' : 'UNCOVERED');

      return {
        requirementId: req.id,
        externalKey: req.externalKey || req.id,
        title: req.title,
        status: req.status,
        testCasesCount: linkedCases.length,
        testCases: linkedCases.map(c => ({
          id: c.id,
          title: c.title,
          automationStatus: c.automationStatus,
          featureFile: c.featureFile?.name || null
        })),
        isCovered,
        hasAutomated,
        overallStatus
      };
    });

    const totalReqs = matrixRows.length;
    const coveredReqs = matrixRows.filter(r => r.isCovered).length;
    const passedReqs = matrixRows.filter(r => r.overallStatus === 'PASSED').length;
    const coveragePercentage = totalReqs > 0 ? Number(((coveredReqs / totalReqs) * 100).toFixed(1)) : 0;
    const passPercentage = totalReqs > 0 ? Number(((passedReqs / totalReqs) * 100).toFixed(1)) : 0;

    return {
      organizationId: orgId,
      projectId: projectId || 'ALL',
      summary: {
        totalRequirements: totalReqs,
        coveredRequirements: coveredReqs,
        uncoveredRequirements: totalReqs - coveredReqs,
        passedRequirements: passedReqs,
        coveragePercentage,
        passPercentage
      },
      matrix: matrixRows
    };
  }
}

module.exports = new TestManagementService();
