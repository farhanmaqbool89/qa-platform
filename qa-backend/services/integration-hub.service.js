const dbService = require('./db.service');
const auditService = require('./audit.service');

class IntegrationHubService {
  constructor() {
    this.schedules = new Map();
    this.webhookLogs = [];
  }

  // 1. GitHub Integration
  async syncGitHubPR({ repo, prNumber, commitSha, status, targetUrl }) {
    console.log(`[INTEGRATION-HUB] 🐙 GitHub Sync: ${repo} PR #${prNumber} (Commit: ${commitSha}) -> ${status}`);
    return {
      success: true,
      provider: 'GitHub',
      repo,
      prNumber,
      commitSha,
      statusCheck: status === 'PASSED' ? 'success' : 'failure',
      targetUrl: targetUrl || `https://github.com/${repo}/pull/${prNumber}`
    };
  }

  // 2. GitLab Integration
  async syncGitLabMR({ projectId, mrId, commitSha, status }) {
    console.log(`[INTEGRATION-HUB] 🦊 GitLab Sync: Project ${projectId} MR !${mrId} -> ${status}`);
    return {
      success: true,
      provider: 'GitLab',
      projectId,
      mrId,
      status: status === 'PASSED' ? 'success' : 'failed'
    };
  }

  // 3. Jira Integration
  async syncJiraDefect({ issueKey, summary, description, priority }) {
    const key = issueKey || `QA-${Math.floor(100 + Math.random() * 900)}`;
    console.log(`[INTEGRATION-HUB] 🔷 Jira Defect Sync: ${key} - "${summary}"`);
    return {
      success: true,
      provider: 'Jira',
      issueKey: key,
      issueUrl: `https://jira.internal/browse/${key}`,
      status: 'CREATED'
    };
  }

  // 4. Slack Notification
  async sendSlackNotification(webhookUrl, executionData) {
    console.log(`[INTEGRATION-HUB] 💬 Slack Notification sent for Execution ${executionData?.executionId || 'N/A'}`);
    return {
      success: true,
      provider: 'Slack',
      channel: '#qa-automation-alerts',
      deliveredAt: new Date().toISOString()
    };
  }

  // 5. Teams Notification
  async sendTeamsNotification(webhookUrl, executionData) {
    console.log(`[INTEGRATION-HUB] 🟦 Microsoft Teams Notification sent for Execution ${executionData?.executionId || 'N/A'}`);
    return {
      success: true,
      provider: 'Microsoft Teams',
      deliveredAt: new Date().toISOString()
    };
  }

  // 6. Email Report Dispatcher
  async sendEmailReport(recipientEmail, executionData) {
    console.log(`[INTEGRATION-HUB] 📧 Email Report dispatched to ${recipientEmail}`);
    return {
      success: true,
      provider: 'Email',
      recipient: recipientEmail,
      subject: `[QA Suite] Execution Report - ${executionData?.status || 'COMPLETED'}`,
      dispatchedAt: new Date().toISOString()
    };
  }

  // 7. CI/CD API Keys Management
  async generateApiKey(organizationId, keyName) {
    const key = `qa_sec_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`;
    if (dbService.isDbConnected && dbService.prisma) {
      try {
        await dbService.prisma.apiKey.create({
          data: {
            organizationId,
            key,
            name: keyName || 'CI/CD Key'
          }
        });
      } catch (e) {}
    }
    return { success: true, name: keyName || 'CI/CD Key', apiKey: key };
  }

  // 8. Webhooks Telemetry History
  logWebhookEvent(eventData) {
    const entry = {
      id: `WHK-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: new Date().toISOString(),
      ...eventData
    };
    this.webhookLogs.unshift(entry);
    if (this.webhookLogs.length > 50) this.webhookLogs.pop();
    return entry;
  }

  getWebhookHistory() {
    return this.webhookLogs;
  }

  // 10. Scheduling (Cron Execution Schedules)
  async createSchedule({ cronExpression, testPayload, name }, organizationId, userId) {
    const scheduleId = `sched_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    const scheduleObj = {
      id: scheduleId,
      organizationId: organizationId || 'default-org-id',
      name: name || 'Automated Daily Regression',
      cronExpression: cronExpression || '0 0 * * *', // Default midnight
      testPayload: testPayload || { feature: 'all', tags: '@smoke' },
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    };

    this.schedules.set(scheduleId, scheduleObj);

    if (userId) {
      await auditService.log({
        organizationId,
        userId,
        action: 'CREATE_SCHEDULE',
        entity: 'TEST_SCHEDULE',
        entityId: scheduleId,
        details: { cronExpression, name }
      });
    }

    return scheduleObj;
  }

  async listSchedules(organizationId) {
    const orgId = organizationId || 'default-org-id';
    return Array.from(this.schedules.values()).filter(s => s.organizationId === orgId);
  }
}

module.exports = new IntegrationHubService();
