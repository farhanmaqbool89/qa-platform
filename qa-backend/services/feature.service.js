const fs = require('fs');
const path = require('path');
const dbService = require('./db.service');
const auditService = require('./audit.service');

const FEATURES_DIR = path.join(__dirname, '../features');
const FEATURES_METADATA_FILE = path.join(__dirname, '../data/features.json');

class FeatureBackendService {
  constructor() {
    this.ensureDirectories();
  }

  ensureDirectories() {
    if (!fs.existsSync(FEATURES_DIR)) {
      fs.mkdirSync(FEATURES_DIR, { recursive: true });
    }
    const dataDir = path.dirname(FEATURES_METADATA_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(FEATURES_METADATA_FILE)) {
      fs.writeFileSync(FEATURES_METADATA_FILE, JSON.stringify([], null, 2), 'utf8');
    }
  }

  async listFeatures(organizationId) {
    this.ensureDirectories();
    const orgId = organizationId || await dbService.getDefaultOrganizationId();

    if (dbService.isDbConnected && dbService.prisma) {
      try {
        const dbFeatures = await dbService.prisma.featureFile.findMany({
          where: { organizationId: orgId },
          include: { project: true },
          orderBy: { updatedAt: 'desc' }
        });

        return dbFeatures.map((f, idx) => ({
          id: f.legacyId || (idx + 1),
          dbId: f.id,
          organizationId: f.organizationId,
          projectId: f.project?.legacyId || 1,
          name: f.name,
          content: f.content || '',
          updatedAt: f.updatedAt.toISOString()
        }));
      } catch (e) {
        console.warn('[FEATURE-SERVICE] Database query failed, falling back to JSON:', e.message);
      }
    }

    const files = fs.readdirSync(FEATURES_DIR).filter(f => f.endsWith('.feature'));
    let metadata = [];
    try {
      metadata = JSON.parse(fs.readFileSync(FEATURES_METADATA_FILE, 'utf8'));
    } catch (e) {
      metadata = [];
    }

    metadata = metadata.filter(m => (!m.organizationId || m.organizationId === orgId) && files.includes(m.name));

    files.forEach(file => {
      const exists = metadata.find(m => m.name === file);
      if (!exists && orgId === 'default-org-id') {
        metadata.push({
          id: Math.max(0, ...metadata.map(m => m.id)) + 1,
          projectId: 1,
          organizationId: orgId,
          name: file,
          updatedAt: new Date().toISOString()
        });
      }
    });

    const enriched = metadata.map(m => {
      try {
        const content = fs.readFileSync(path.join(FEATURES_DIR, m.name), 'utf8');
        return { ...m, organizationId: m.organizationId || orgId, content };
      } catch (e) {
        return { ...m, organizationId: m.organizationId || orgId, content: '' };
      }
    });

    fs.writeFileSync(FEATURES_METADATA_FILE, JSON.stringify(metadata, null, 2), 'utf8');
    return enriched;
  }

  async saveFeature(draft, organizationId, userId) {
    this.ensureDirectories();
    const orgId = organizationId || await dbService.getDefaultOrganizationId();
    let metadata = [];
    try {
      metadata = JSON.parse(fs.readFileSync(FEATURES_METADATA_FILE, 'utf8'));
    } catch (e) {
      metadata = [];
    }

    const filename = draft.name.endsWith('.feature') ? draft.name : `${draft.name}.feature`;
    const filePath = path.join(FEATURES_DIR, filename);

    // Disk write for Cucumber process compatibility
    fs.writeFileSync(filePath, draft.content, 'utf8');

    let entry = metadata.find(m => m.name === filename);
    const newId = entry ? entry.id : (Math.max(0, ...metadata.map(m => m.id || 0)) + 1);

    if (entry) {
      entry.projectId = Number(draft.projectId);
      entry.updatedAt = new Date().toISOString();
    } else {
      entry = {
        id: newId,
        projectId: Number(draft.projectId),
        name: filename,
        updatedAt: new Date().toISOString()
      };
      metadata.push(entry);
    }

    if (dbService.isDbConnected && dbService.prisma) {
      try {
        const proj = await dbService.prisma.project.findFirst({
          where: { organizationId: orgId, legacyId: Number(draft.projectId) }
        });
        const targetProjectId = proj ? proj.id : (await dbService.prisma.project.findFirst({ where: { organizationId: orgId } }))?.id;

        if (targetProjectId) {
          const existingDbFeature = await dbService.prisma.featureFile.findFirst({
            where: { organizationId: orgId, name: filename }
          });

          if (existingDbFeature) {
            await dbService.prisma.featureFile.update({
              where: { id: existingDbFeature.id },
              data: {
                projectId: targetProjectId,
                content: draft.content
              }
            });
          } else {
            await dbService.prisma.featureFile.create({
              data: {
                legacyId: newId,
                organizationId: orgId,
                projectId: targetProjectId,
                name: filename,
                content: draft.content
              }
            });
          }

          await auditService.log({
            organizationId: orgId,
            userId,
            action: 'SAVE_FEATURE',
            entity: 'FEATURE_FILE',
            entityId: filename,
            details: { name: filename, projectId: targetProjectId }
          });
        }
      } catch (e) {
        console.error('[FEATURE-SERVICE] Failed to persist feature to PostgreSQL:', e.message);
      }
    }

    fs.writeFileSync(FEATURES_METADATA_FILE, JSON.stringify(metadata, null, 2), 'utf8');
    return { ...entry, organizationId: orgId, content: draft.content };
  }

  async deleteFeature(id, organizationId, userId) {
    this.ensureDirectories();
    const numericId = Number(id);
    const orgId = organizationId || await dbService.getDefaultOrganizationId();
    let metadata = [];
    try {
      metadata = JSON.parse(fs.readFileSync(FEATURES_METADATA_FILE, 'utf8'));
    } catch (e) {
      metadata = [];
    }

    const entryIndex = metadata.findIndex(m => m.id === numericId || m.name === String(id));
    if (entryIndex !== -1) {
      const entry = metadata[entryIndex];
      const filePath = path.join(FEATURES_DIR, entry.name);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      if (dbService.isDbConnected && dbService.prisma) {
        try {
          const dbFeature = await dbService.prisma.featureFile.findFirst({
            where: { organizationId: orgId, name: entry.name }
          });
          if (dbFeature) {
            await dbService.prisma.featureFile.delete({
              where: { id: dbFeature.id }
            });
            await auditService.log({
              organizationId: orgId,
              userId,
              action: 'DELETE_FEATURE',
              entity: 'FEATURE_FILE',
              entityId: dbFeature.id
            });
          } else {
            throw new Error(`Feature ${id} not found in current organization context.`);
          }
        } catch (e) {
          console.error('[FEATURE-SERVICE] Failed to delete feature from PostgreSQL:', e.message);
          if (e.message.includes('not found')) throw e;
        }
      }

      metadata.splice(entryIndex, 1);
      fs.writeFileSync(FEATURES_METADATA_FILE, JSON.stringify(metadata, null, 2), 'utf8');
      return true;
    }
    return false;
  }
}

module.exports = new FeatureBackendService();
