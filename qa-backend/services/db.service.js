const fs = require('fs');
const path = require('path');

let PrismaClient;
try {
  PrismaClient = require('@prisma/client').PrismaClient;
} catch (e) {
  PrismaClient = null;
}

class DatabaseService {
  constructor() {
    this.prisma = null;
    this.defaultOrganization = null;
    this.isDbConnected = false;
    this.init();
  }

  async init() {
    if (!PrismaClient) {
      if (process.env.NODE_ENV === 'production') {
        console.error('[DB-SERVICE] 🚨 FATAL: @prisma/client not found in production mode. Exiting.');
        process.exit(1);
      }
      console.warn('[DB-SERVICE] ℹ️ @prisma/client not found or not generated. Operating with file-backed JSON persistence.');
      return;
    }

    try {
      this.prisma = new PrismaClient();
      await this.prisma.$connect();
      this.isDbConnected = true;
      console.log('[DB-SERVICE] ✅ Successfully connected to PostgreSQL via Prisma Client');
      await this.ensureDefaultOrganization();
      await this.migrateLegacyJsonData();
    } catch (error) {
      if (process.env.NODE_ENV === 'production') {
        console.error('[DB-SERVICE] 🚨 FATAL: Could not connect to PostgreSQL database in production mode:', error.message);
        process.exit(1);
      }
      console.warn('[DB-SERVICE] ⚠️ Could not connect to PostgreSQL database:', error.message);
      console.warn('[DB-SERVICE] ℹ️ Operating with file-backed fallback persistence strategy for local dev.');
      this.isDbConnected = false;
    }
  }

  async getPrisma() {
    if (!this.prisma && PrismaClient) {
      this.prisma = new PrismaClient();
    }
    return this.prisma;
  }

  async ensureDefaultOrganization() {
    if (!this.isDbConnected || !this.prisma) return null;
    try {
      let org = await this.prisma.organization.findUnique({
        where: { slug: 'default-org' }
      });

      if (!org) {
        org = await this.prisma.organization.create({
          data: {
            name: 'Default Organization',
            slug: 'default-org'
          }
        });
        console.log('[DB-SERVICE] 🏢 Created Default Organization:', org.id);
      }
      this.defaultOrganization = org;
      return org;
    } catch (e) {
      console.error('[DB-SERVICE] Error ensuring default organization:', e.message);
      return null;
    }
  }

  async getDefaultOrganizationId() {
    if (this.defaultOrganization) {
      return this.defaultOrganization.id;
    }
    const org = await this.ensureDefaultOrganization();
    return org ? org.id : 'default-org-id';
  }

  /**
   * Automatic legacy JSON migration to PostgreSQL
   */
  async migrateLegacyJsonData() {
    if (!this.isDbConnected || !this.prisma) return;
    try {
      const orgId = await this.getDefaultOrganizationId();
      const projectsFile = path.join(__dirname, '../data/projects.json');
      const featuresFile = path.join(__dirname, '../data/features.json');
      const featuresDir = path.join(__dirname, '../features');

      // 1. Migrate Projects
      if (fs.existsSync(projectsFile)) {
        const raw = fs.readFileSync(projectsFile, 'utf8');
        const jsonProjects = JSON.parse(raw);
        for (const p of jsonProjects) {
          const exists = await this.prisma.project.findFirst({
            where: { organizationId: orgId, legacyId: Number(p.id) }
          });
          if (!exists) {
            await this.prisma.project.create({
              data: {
                legacyId: Number(p.id),
                organizationId: orgId,
                name: p.name,
                baseUrl: p.baseUrl || '',
                browser: p.browser || 'Chrome',
                username: p.username || '',
                password: p.password || ''
              }
            });
            console.log(`[DB-MIGRATION] 📥 Migrated project "${p.name}" (Legacy ID: ${p.id})`);
          }
        }
      }

      // 2. Migrate Features
      if (fs.existsSync(featuresFile)) {
        const raw = fs.readFileSync(featuresFile, 'utf8');
        const jsonFeatures = JSON.parse(raw);
        const projects = await this.prisma.project.findMany({ where: { organizationId: orgId } });
        const defaultProj = projects[0];

        for (const f of jsonFeatures) {
          const exists = await this.prisma.featureFile.findFirst({
            where: { organizationId: orgId, name: f.name }
          });

          if (!exists) {
            let content = '';
            const filePath = path.join(featuresDir, f.name);
            if (fs.existsSync(filePath)) {
              content = fs.readFileSync(filePath, 'utf8');
            }

            const targetProjectId = projects.find(p => p.legacyId === Number(f.projectId))?.id || defaultProj?.id;
            if (targetProjectId) {
              await this.prisma.featureFile.create({
                data: {
                  legacyId: Number(f.id),
                  organizationId: orgId,
                  projectId: targetProjectId,
                  name: f.name,
                  content: content
                }
              });
              console.log(`[DB-MIGRATION] 📥 Migrated feature "${f.name}" (Legacy ID: ${f.id})`);
            }
          }
        }
      }
    } catch (e) {
      console.error('[DB-SERVICE] Legacy data migration warning:', e.message);
    }
  }
}

module.exports = new DatabaseService();
