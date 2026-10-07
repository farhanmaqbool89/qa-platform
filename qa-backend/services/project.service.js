const fs = require('fs');
const path = require('path');
const dbService = require('./db.service');
const auditService = require('./audit.service');

const PROJECTS_FILE = path.join(__dirname, '../data/projects.json');

const INITIAL_PROJECTS = [
  {
    id: 1,
    name: 'Customer Portal',
    baseUrl: 'https://qa.customer-portal.local',
    browser: 'Chrome',
    username: 'qa.portal.user',
    password: 'portal@123'
  },
  {
    id: 2,
    name: 'Admin Console',
    baseUrl: 'https://staging.admin-console.local',
    browser: 'Firefox',
    username: 'qa.admin.user',
    password: 'admin@123'
  },
  {
    id: 3,
    name: 'Payments API UI',
    baseUrl: 'https://qa.payments.local',
    browser: 'Edge',
    username: 'qa.payments.user',
    password: 'payments@123'
  }
];

class ProjectService {
  constructor() {
    this.ensureProjectsFile();
  }

  ensureProjectsFile() {
    const dir = path.dirname(PROJECTS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(PROJECTS_FILE)) {
      fs.writeFileSync(PROJECTS_FILE, JSON.stringify(INITIAL_PROJECTS, null, 2), 'utf8');
    }
  }

  async listProjects(organizationId) {
    this.ensureProjectsFile();
    const orgId = organizationId || await dbService.getDefaultOrganizationId();

    if (dbService.isDbConnected && dbService.prisma) {
      try {
        const projects = await dbService.prisma.project.findMany({
          where: { organizationId: orgId },
          orderBy: { createdAt: 'asc' }
        });

        return projects.map((p, idx) => ({
          id: p.legacyId || (idx + 1),
          dbId: p.id,
          organizationId: p.organizationId,
          name: p.name,
          baseUrl: p.baseUrl || '',
          browser: p.browser || 'Chrome',
          username: p.username || '',
          password: p.password || ''
        }));
      } catch (e) {
        console.warn('[PROJECT-SERVICE] Database query failed, falling back to JSON:', e.message);
      }
    }

    try {
      const data = fs.readFileSync(PROJECTS_FILE, 'utf8');
      const projects = JSON.parse(data);
      return projects
        .filter(p => (p.organizationId || 'default-org-id') === orgId)
        .map(p => ({ ...p, organizationId: orgId }));
    } catch (e) {
      return INITIAL_PROJECTS.map(p => ({ ...p, organizationId: orgId }));
    }
  }

  saveProjects(projects) {
    this.ensureProjectsFile();
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf8');
  }

  async addProject(project, organizationId, userId) {
    this.ensureProjectsFile();
    const orgId = organizationId || await dbService.getDefaultOrganizationId();
    let allProjects = [];
    try {
      if (fs.existsSync(PROJECTS_FILE)) {
        const raw = fs.readFileSync(PROJECTS_FILE, 'utf8');
        allProjects = JSON.parse(raw);
      }
    } catch (e) {
      allProjects = [...INITIAL_PROJECTS];
    }

    const newId = Math.max(100, ...allProjects.map(p => p.id || 0)) + 1;
    const newProject = {
      id: newId,
      name: project.name,
      baseUrl: project.baseUrl || '',
      browser: project.browser || 'Chrome',
      username: project.username || '',
      password: project.password || '',
      organizationId: orgId
    };

    if (dbService.isDbConnected && dbService.prisma) {
      try {
        const created = await dbService.prisma.project.create({
          data: {
            legacyId: newId,
            organizationId: orgId,
            name: project.name,
            baseUrl: project.baseUrl || '',
            browser: project.browser || 'Chrome',
            username: project.username || '',
            password: project.password || ''
          }
        });
        newProject.dbId = created.id;

        await auditService.log({
          organizationId: orgId,
          userId,
          action: 'CREATE_PROJECT',
          entity: 'PROJECT',
          entityId: created.id,
          details: { name: project.name }
        });
      } catch (e) {
        console.error('[PROJECT-SERVICE] Failed to save project to PostgreSQL:', e.message);
      }
    }

    allProjects.push(newProject);
    this.saveProjects(allProjects);
    return newProject;
  }

  async updateProject(id, project, organizationId, userId) {
    const numericId = Number(id);
    const orgId = organizationId || await dbService.getDefaultOrganizationId();
    const projects = await this.listProjects(orgId);
    const updated = projects.map(p => p.id === numericId ? { ...p, ...project, id: numericId, organizationId: orgId } : p);

    if (dbService.isDbConnected && dbService.prisma) {
      try {
        const dbProject = await dbService.prisma.project.findFirst({
          where: {
            organizationId: orgId,
            OR: !isNaN(numericId) && numericId > 0 ? [{ legacyId: numericId }, { id: String(id) }] : [{ id: String(id) }]
          }
        });

        if (!dbProject) {
          throw new Error(`Project ${id} not found in organization context.`);
        }

        await dbService.prisma.project.update({
          where: { id: dbProject.id },
          data: {
            name: project.name,
            baseUrl: project.baseUrl,
            browser: project.browser,
            username: project.username,
            password: project.password
          }
        });

        await auditService.log({
          organizationId: orgId,
          userId,
          action: 'UPDATE_PROJECT',
          entity: 'PROJECT',
          entityId: dbProject.id,
          details: { name: project.name }
        });
      } catch (e) {
        console.error('[PROJECT-SERVICE] Failed to update project in PostgreSQL:', e.message);
        if (e.message.includes('not found')) throw e;
      }
    }

    this.saveProjects(updated);
    return { ...project, id: numericId, organizationId: orgId };
  }

  async deleteProject(id, organizationId, userId) {
    const numericId = Number(id);
    const orgId = organizationId || await dbService.getDefaultOrganizationId();
    const projects = await this.listProjects(orgId);
    const targetProject = projects.find(p => p.id === numericId || p.dbId === String(id));

    if (!targetProject) {
      throw new Error(`Project ${id} not found in current organization context.`);
    }

    if (dbService.isDbConnected && dbService.prisma) {
      try {
        const dbProject = await dbService.prisma.project.findFirst({
          where: {
            organizationId: orgId,
            OR: !isNaN(numericId) && numericId > 0 ? [{ legacyId: numericId }, { id: String(id) }] : [{ id: String(id) }]
          }
        });

        if (!dbProject) {
          throw new Error(`Project ${id} not found in organization context.`);
        }

        await dbService.prisma.project.delete({
          where: { id: dbProject.id }
        });

        await auditService.log({
          organizationId: orgId,
          userId,
          action: 'DELETE_PROJECT',
          entity: 'PROJECT',
          entityId: dbProject.id
        });
      } catch (e) {
        console.error('[PROJECT-SERVICE] Failed to delete project from PostgreSQL:', e.message);
        throw e;
      }
    }

    const allProjects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
    const filtered = allProjects.filter(p => p.id !== numericId && p.organizationId !== orgId);
    this.saveProjects(filtered);
    return true;
  }
}

module.exports = new ProjectService();
