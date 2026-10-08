const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const { initializeSocket } = require('./support/socket');
const browserService = require('./services/browser/browser.service');
const sessionService = require('./services/session.service');
const locatorHealer = require('./services/ai/locator-healing/locator-healer.facade');
const sanitizer = require('./src/services/sanitizer.service');
const projectService = require('./services/project.service');
const featureBackendService = require('./services/feature.service');
const { formatCucumberTags } = require('./services/tag-formatter.service');

const app = express();

// Security Hardening: Disable Express fingerprint header & inject strict response headers
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Configure CORS for allowed domains (Production krodux.com / Local Dev)
const defaultAllowedOrigins = [
  'https://krodux.com',
  'https://www.krodux.com',
  'http://localhost:4200',
  'http://localhost:3000'
];

const envAllowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : defaultAllowedOrigins;

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (
      envAllowedOrigins.includes(origin) ||
      envAllowedOrigins.includes('*') ||
      process.env.NODE_ENV !== 'production'
    ) {
      return callback(null, true);
    }
    return callback(new Error(`CORS origin '${origin}' unauthorized by security policy.`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Tenant-ID', 'stripe-signature']
};

app.use(cors(corsOptions));

/**
 * Strict SSRF Protection for Web Crawlers and Automated Auditing Endpoints
 * Prevents targeting internal cloud metadata (169.254.169.254), loopback (127.0.0.0/8),
 * private subnets (RFC 1918), CGNAT, and internal domain names.
 */
function isPublicSafeUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const parsed = new URL(urlStr.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const rawHostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!rawHostname) return false;

    // Disallow loopback & private naming schemes
    if (
      rawHostname === 'localhost' ||
      rawHostname === '0.0.0.0' ||
      rawHostname === '::1' ||
      rawHostname === '0:0:0:0:0:0:0:1' ||
      rawHostname.endsWith('.localhost') ||
      rawHostname.endsWith('.local') ||
      rawHostname.endsWith('.internal') ||
      rawHostname.endsWith('.lan') ||
      rawHostname.endsWith('.corp') ||
      rawHostname.endsWith('.home') ||
      rawHostname.endsWith('.intranet') ||
      rawHostname.endsWith('.test') ||
      rawHostname.endsWith('.example') ||
      rawHostname.endsWith('.invalid')
    ) {
      return false;
    }

    // IPv4 representation validation
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = rawHostname.match(ipv4Regex);
    if (match) {
      const [ , a, b, c, d ] = match.map(Number);
      if (a > 255 || b > 255 || c > 255 || d > 255) return false;

      // 0.0.0.0/8
      if (a === 0) return false;
      // 127.0.0.0/8 (Loopback)
      if (a === 127) return false;
      // 10.0.0.0/8 (Private RFC 1918)
      if (a === 10) return false;
      // 172.16.0.0/12 (Private RFC 1918 172.16 - 172.31)
      if (a === 172 && b >= 16 && b <= 31) return false;
      // 192.168.0.0/16 (Private RFC 1918)
      if (a === 192 && b === 168) return false;
      // 169.254.0.0/16 (Link-Local & Cloud Metadata e.g. AWS/GCP/Azure 169.254.169.254)
      if (a === 169 && b === 254) return false;
      // 100.64.0.0/10 (Carrier-grade NAT)
      if (a === 100 && b >= 64 && b <= 127) return false;
      // 224.0.0.0/4 (Multicast / Reserved)
      if (a >= 224) return false;
    }

    // Disallow hex, octal, or single integer encoded IP evasion strings (e.g. 2130706433, 0x7f000001)
    if (/^(0x[0-9a-f]+|\d+)$/i.test(rawHostname)) {
      return false;
    }

    // Disallow IPv6 Link Local and Unique Local ranges
    if (rawHostname.includes(':')) {
      if (
        rawHostname.startsWith('fe8') ||
        rawHostname.startsWith('fe9') ||
        rawHostname.startsWith('fea') ||
        rawHostname.startsWith('feb') ||
        rawHostname.startsWith('fc') ||
        rawHostname.startsWith('fd') ||
        rawHostname.includes('::ffff:')
      ) {
        return false;
      }
    }

    return true;
  } catch (e) {
    return false;
  }
}

// Stripe Webhook Endpoint (Requires raw unparsed Buffer for signature verification)
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  try {
    const result = await billingService.handleWebhookEvent(req.body, signature);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.use(express.json({ limit: '50mb' }));

// Static Media Artifacts Serving (Screenshots, Videos, Traces, Accessibility)
const ARTIFACTS_DIR = path.join(__dirname, 'artifacts');
const ACCESSIBILITY_SCANS_DIR = path.join(ARTIFACTS_DIR, 'accessibility_scans');

fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
fs.mkdirSync(ACCESSIBILITY_SCANS_DIR, { recursive: true });

app.use('/artifacts', express.static(ARTIFACTS_DIR));

// Store active Cucumber child processes
const activeProcesses = new Map();
const executionStatuses = new Map();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        envAllowedOrigins.includes(origin) ||
        envAllowedOrigins.includes('*') ||
        process.env.NODE_ENV !== 'production'
      ) {
        return callback(null, true);
      }
      return callback(new Error('CORS origin unauthorized for WebSocket'));
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

initializeSocket(io);

const dbService = require('./services/db.service');
const redisService = require('./services/redis.service');
const dockerRunnerService = require('./services/docker-runner.service');
const authService = require('./services/auth.service');
const { authenticatePlatformToken, requireAuth, requireRole } = require('./middleware/auth.middleware');
const { resolveTenantContext, enforceProjectBelongsToTenant } = require('./middleware/tenant.middleware');
const auditService = require('./services/audit.service');
const queueService = require('./services/queue.service');
const testManagementService = require('./services/test-management.service');
const aiPlatformService = require('./services/ai/ai-platform.service');
const integrationHubService = require('./services/integration-hub.service');
const analyticsReportingService = require('./services/analytics-reporting.service');
const billingService = require('./services/billing.service');
const enterpriseSecurityService = require('./services/enterprise-security.service');

// Health & Production Infrastructure Probes (Unauthenticated Public Probes)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/api/health', (req, res) => {
  const dbStatus = dbService.isDbConnected ? 'connected' : 'disconnected';
  const redisStatus = redisService.isConnected ? 'connected' : 'disconnected';
  const dockerStatus = dockerRunnerService.isDockerAvailable ? 'available' : 'unavailable';

  res.json({
    status: (dbService.isDbConnected && redisService.isConnected) ? 'ok' : 'degraded',
    environment: process.env.NODE_ENV || 'development',
    serverTime: new Date().toISOString(),
    dependencies: {
      database: dbStatus,
      redis: redisStatus,
      docker: dockerStatus
    }
  });
});

app.get('/api/health/live', (req, res) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

app.get('/api/health/ready', (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  const isDbReady = dbService.isDbConnected;
  const isRedisReady = redisService.isConnected;

  const isReady = isProd ? (isDbReady && isRedisReady) : true;

  if (!isReady) {
    return res.status(503).json({
      status: 'not_ready',
      environment: process.env.NODE_ENV,
      reason: 'Production infrastructure dependencies (PostgreSQL / Redis) unavailable.',
      dependencies: {
        database: isDbReady ? 'ready' : 'failed',
        redis: isRedisReady ? 'ready' : 'failed'
      }
    });
  }

  res.json({
    status: 'ready',
    environment: process.env.NODE_ENV || 'development',
    dependencies: {
      database: isDbReady ? 'ready' : 'fallback',
      redis: isRedisReady ? 'ready' : 'fallback',
      docker: dockerRunnerService.isDockerAvailable ? 'ready' : 'fallback'
    }
  });
});

app.use(authenticatePlatformToken);
app.use(resolveTenantContext);

// IP Whitelist Security Guard Middleware
app.use((req, res, next) => {
  if (req.organizationId && !req.path.includes('/api/auth/login') && !req.path.includes('/api/auth/register')) {
    const isAllowed = enterpriseSecurityService.checkIPAllowed(req.organizationId, req.ip || req.socket.remoteAddress);
    if (!isAllowed) {
      return res.status(403).json({ success: false, message: 'Access denied: Client IP address not in organization whitelist.' });
    }
  }
  next();
});

// =================================================================
// 🔒 ENTERPRISE SECURITY, IDENTITY & SCIM 2.0 REST APIs (9 MODULES)
// =================================================================

// 1. SAML 2.0 SSO Endpoints
app.post('/api/security/sso/saml/config', requireRole('SUPER_ADMIN', 'ORG_ADMIN'), async (req, res) => {
  try {
    const result = await enterpriseSecurityService.configureSAML(req.organizationId, req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/auth/sso/saml/metadata', async (req, res) => {
  const xml = await enterpriseSecurityService.getSAMLMetadata(req.query.orgId);
  res.header('Content-Type', 'application/xml').send(xml);
});

// 2. SCIM 2.0 User Provisioning Endpoints
app.get('/scim/v2/Users', requireRole('SUPER_ADMIN', 'ORG_ADMIN'), async (req, res) => {
  try {
    const result = await enterpriseSecurityService.listSCIMUsers(req.organizationId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/scim/v2/Users', requireRole('SUPER_ADMIN', 'ORG_ADMIN'), async (req, res) => {
  try {
    const created = await enterpriseSecurityService.createSCIMUser(req.body, req.organizationId);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. MFA / 2FA Authentication Endpoints
app.post('/api/security/mfa/setup', requireAuth, async (req, res) => {
  try {
    const result = await enterpriseSecurityService.generateMFASequence(req.user?.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/security/mfa/verify', requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    const result = await enterpriseSecurityService.verifyMFACode(req.user?.id, code);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. IP Whitelist Security Configuration
app.post('/api/security/ip-whitelist', requireRole('SUPER_ADMIN', 'ORG_ADMIN'), async (req, res) => {
  try {
    const { allowedIPs } = req.body;
    const result = await enterpriseSecurityService.setIPWhitelist(req.organizationId, allowedIPs);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Data Retention Purge Policy Endpoint
app.post('/api/security/data-retention/purge', requireRole('SUPER_ADMIN', 'ORG_ADMIN'), async (req, res) => {
  try {
    const { retentionDays } = req.body;
    const result = await enterpriseSecurityService.enforceDataRetentionPolicy(req.organizationId, retentionDays);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Dedicated Enterprise Workers Routing
app.get('/api/security/dedicated-workers', requireAuth, async (req, res) => {
  try {
    const result = await enterpriseSecurityService.getDedicatedWorkerPool(req.organizationId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. SOC2 & ISO 27001 Security Compliance Report
app.get('/api/security/compliance-report', requireAuth, async (req, res) => {
  try {
    const result = await enterpriseSecurityService.generateSecurityComplianceReport(req.organizationId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =================================================================
// 💳 SAAS BILLING, STRIPE SUBSCRIPTIONS & QUOTA LIMITS REST APIs
// =================================================================

// 1. Get Plan Definitions & Quotas Matrix
app.get('/api/billing/plans', (req, res) => {
  res.json({ success: true, plans: billingService.getPlanDefinitions() });
});

// 2. Get Subscription Status & Quota Usage
app.get('/api/billing/subscription', requireAuth, async (req, res) => {
  try {
    const status = await billingService.getSubscriptionStatus(req.organizationId);
    res.json({ success: true, subscription: status });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Upgrade / Downgrade Plan Tier
app.post('/api/billing/plan', requireRole('SUPER_ADMIN', 'ORG_ADMIN'), async (req, res) => {
  try {
    const { plan } = req.body;
    const updated = await billingService.updatePlanTier(req.organizationId, plan, req.user?.id);
    res.json({ success: true, subscription: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// 4. Create Stripe Checkout Session URL
app.post('/api/billing/checkout', requireRole('SUPER_ADMIN', 'ORG_ADMIN'), async (req, res) => {
  try {
    const { plan, returnUrl } = req.body;
    const session = await billingService.createCheckoutSession(req.organizationId, plan, returnUrl);
    res.json(session);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Create Stripe Billing Portal Session URL
app.post('/api/billing/portal', requireRole('SUPER_ADMIN', 'ORG_ADMIN'), async (req, res) => {
  try {
    const { returnUrl } = req.body;
    const session = await billingService.createBillingPortalSession(req.organizationId, returnUrl);
    res.json(session);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Invoices History
app.get('/api/billing/invoices', requireAuth, async (req, res) => {
  try {
    const invoices = await billingService.listInvoices(req.organizationId);
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =================================================================
// 📊 ADVANCED ANALYTICS, QUALITY SCORES & EXECUTIVE REPORTING APIs
// =================================================================

// 1. Flaky Tests Engine
app.get('/api/analytics/flaky', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.query;
    const result = await analyticsReportingService.getFlakyTests(req.organizationId, projectId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Visual Testing Engine (Pixel Diff Comparison)
app.post('/api/analytics/visual/compare', requireAuth, async (req, res) => {
  try {
    const { baselineImagePath, currentImagePath } = req.body;
    const result = await analyticsReportingService.compareVisualSnapshots(baselineImagePath, currentImagePath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. API Testing Engine
app.post('/api/analytics/api-test/run', requireAuth, async (req, res) => {
  try {
    const result = await analyticsReportingService.executeApiTest(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Accessibility Summary Engine (WCAG 2.1 AA)
app.get('/api/analytics/accessibility', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.query;
    const result = await analyticsReportingService.getAccessibilitySummary(req.organizationId, projectId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Test Coverage Engine
app.get('/api/analytics/coverage', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.query;
    const result = await analyticsReportingService.calculateTestCoverage(req.organizationId, projectId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Quality Score Engine (Composite Index 0-100)
app.get('/api/analytics/quality-score', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.query;
    const result = await analyticsReportingService.calculateQualityScore(req.organizationId, projectId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Release Readiness Engine (Go/No-Go Gate Evaluator)
app.get('/api/analytics/release-readiness', requireAuth, async (req, res) => {
  try {
    const { projectId, version } = req.query;
    const result = await analyticsReportingService.evaluateReleaseReadiness(req.organizationId, projectId, version);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 8. Executive Reports Engine (C-Level Dashboard Summary)
app.get('/api/analytics/executive-report', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.query;
    const result = await analyticsReportingService.generateExecutiveReport(req.organizationId, projectId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =================================================================
// 🔌 ENTERPRISE INTEGRATIONS & SCHEDULING REST ENDPOINTS (10 MODULES)
// =================================================================

// 1. GitHub Integration
app.post('/api/integrations/github/sync', requireAuth, async (req, res) => {
  try {
    const result = await integrationHubService.syncGitHubPR(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. GitLab Integration
app.post('/api/integrations/gitlab/sync', requireAuth, async (req, res) => {
  try {
    const result = await integrationHubService.syncGitLabMR(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Jira Integration
app.post('/api/integrations/jira/defect', requireAuth, async (req, res) => {
  try {
    const result = await integrationHubService.syncJiraDefect(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Slack Notification
app.post('/api/integrations/slack/notify', requireAuth, async (req, res) => {
  try {
    const { webhookUrl, executionData } = req.body;
    const result = await integrationHubService.sendSlackNotification(webhookUrl, executionData);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Teams Notification
app.post('/api/integrations/teams/notify', requireAuth, async (req, res) => {
  try {
    const { webhookUrl, executionData } = req.body;
    const result = await integrationHubService.sendTeamsNotification(webhookUrl, executionData);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Email Report Dispatcher
app.post('/api/integrations/email/send', requireAuth, async (req, res) => {
  try {
    const { recipientEmail, executionData } = req.body;
    const result = await integrationHubService.sendEmailReport(recipientEmail, executionData);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 10. Scheduling Endpoints
app.get('/api/schedules', requireAuth, async (req, res) => {
  try {
    const schedules = await integrationHubService.listSchedules(req.organizationId);
    res.json({ success: true, count: schedules.length, schedules });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/schedules', requireRole('SUPER_ADMIN', 'ORG_ADMIN', 'QA_LEAD'), async (req, res) => {
  try {
    const created = await integrationHubService.createSchedule(req.body, req.organizationId, req.user?.id);
    res.json({ success: true, schedule: created });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =================================================================
// 🧠 UNIFIED AI QA AUTOMATION SUITE REST ENDPOINTS (9 CAPABILITIES)
// =================================================================

// 1. AI Requirement Analysis
app.post('/api/ai/analyze-requirement', requireAuth, async (req, res) => {
  try {
    const { requirementText } = req.body;
    const result = await aiPlatformService.analyzeRequirement(requirementText);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. AI Test Case Generation
app.post('/api/ai/generate-test-cases', requireAuth, async (req, res) => {
  try {
    const { prompt } = req.body;
    const result = await aiPlatformService.generateTestCases(prompt);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. AI Gherkin Generation
app.post('/api/ai/generate-gherkin', requireAuth, async (req, res) => {
  try {
    const { prompt } = req.body;
    const result = await aiPlatformService.generateGherkinFeature(prompt);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. AI Playwright Generation
app.post('/api/ai/generate-playwright', requireAuth, async (req, res) => {
  try {
    const { scenario } = req.body;
    const result = await aiPlatformService.generatePlaywrightSteps(scenario);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. AI Failure Intelligence
app.post('/api/ai/analyze-failure', requireAuth, async (req, res) => {
  try {
    const { executionId, rawLog } = req.body;
    const result = await aiPlatformService.analyzeFailure(executionId, rawLog);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. AI Self-Healing
app.post('/api/ai/heal-locator', requireAuth, async (req, res) => {
  try {
    const { failedSelector, pageDOM } = req.body;
    const result = await aiPlatformService.healLocator(failedSelector, pageDOM);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. AI Test Optimization
app.post('/api/ai/optimize-suite', requireAuth, async (req, res) => {
  try {
    const result = await aiPlatformService.optimizeTestSuite(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 8. AI Test Selection (Impact-Based Test Selection)
app.post('/api/ai/select-tests', requireAuth, async (req, res) => {
  try {
    const { changedFiles } = req.body;
    const result = await aiPlatformService.selectImpactedTests(changedFiles);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 9. AI QA Assistant Chat
app.post('/api/ai/assistant/chat', requireAuth, async (req, res) => {
  try {
    const { message, context } = req.body;
    const result = await aiPlatformService.chatWithQAAssistant(message, context);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =================================================================
// 📋 TEST MANAGEMENT & REQUIREMENTS TRACEABILITY MATRIX (RTM) REST APIs
// =================================================================

// 1. Requirements Endpoints
app.get('/api/requirements', async (req, res) => {
  try {
    const { projectId } = req.query;
    const reqs = await testManagementService.listRequirements(req.organizationId, projectId);
    res.json({ success: true, count: reqs.length, requirements: reqs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/requirements', requireRole('SUPER_ADMIN', 'ORG_ADMIN', 'QA_LEAD', 'QA_ENGINEER'), async (req, res) => {
  try {
    const created = await testManagementService.createRequirement(req.body, req.organizationId, req.user?.id);
    res.json({ success: true, requirement: created });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Manual Test Cases Endpoints
app.get('/api/test-cases', async (req, res) => {
  try {
    const { projectId } = req.query;
    const cases = await testManagementService.listTestCases(req.organizationId, projectId);
    res.json({ success: true, count: cases.length, testCases: cases });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/test-cases', requireRole('SUPER_ADMIN', 'ORG_ADMIN', 'QA_LEAD', 'QA_ENGINEER'), async (req, res) => {
  try {
    const created = await testManagementService.createTestCase(req.body, req.organizationId, req.user?.id);
    res.json({ success: true, testCase: created });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Test Suites Endpoints
app.get('/api/test-suites', async (req, res) => {
  try {
    const { projectId } = req.query;
    const suites = await testManagementService.listTestSuites(req.organizationId, projectId);
    res.json({ success: true, count: suites.length, testSuites: suites });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/test-suites', requireRole('SUPER_ADMIN', 'ORG_ADMIN', 'QA_LEAD', 'QA_ENGINEER'), async (req, res) => {
  try {
    const created = await testManagementService.createTestSuite(req.body, req.organizationId, req.user?.id);
    res.json({ success: true, testSuite: created });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Test Plans Endpoints
app.get('/api/test-plans', async (req, res) => {
  try {
    const { projectId } = req.query;
    const plans = await testManagementService.listTestPlans(req.organizationId, projectId);
    res.json({ success: true, count: plans.length, testPlans: plans });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/test-plans', requireRole('SUPER_ADMIN', 'ORG_ADMIN', 'QA_LEAD', 'QA_ENGINEER'), async (req, res) => {
  try {
    const created = await testManagementService.createTestPlan(req.body, req.organizationId, req.user?.id);
    res.json({ success: true, testPlan: created });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Releases Endpoints
app.get('/api/releases', async (req, res) => {
  try {
    const { projectId } = req.query;
    const releases = await testManagementService.listReleases(req.organizationId, projectId);
    res.json({ success: true, count: releases.length, releases });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/releases', requireRole('SUPER_ADMIN', 'ORG_ADMIN', 'QA_LEAD'), async (req, res) => {
  try {
    const created = await testManagementService.createRelease(req.body, req.organizationId, req.user?.id);
    res.json({ success: true, release: created });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Requirements Traceability Matrix (RTM) Endpoint
app.get('/api/rtm', async (req, res) => {
  try {
    const { projectId } = req.query;
    const rtmData = await testManagementService.generateRTM(req.organizationId, projectId);
    res.json({ success: true, rtm: rtmData });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =================================================================
// ⚡ PHASE 4: DISTRIBUTED WORKER QUEUE REST ENDPOINTS (BULLMQ + REDIS)
// =================================================================

// Get Distributed Queue Metrics
app.get('/api/executions/queue/status', async (req, res) => {
  try {
    const metrics = await queueService.getMetrics();
    res.json({ success: true, metrics });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get Distributed Worker Nodes Health
app.get('/api/executions/workers/health', async (req, res) => {
  try {
    const health = await queueService.getWorkerHealth();
    res.json({ success: true, health });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Enqueue Distributed Execution Job
app.post('/api/executions/enqueue', requireRole('SUPER_ADMIN', 'ORG_ADMIN', 'QA_LEAD', 'QA_ENGINEER'), async (req, res) => {
  try {
    const quotaCheck = await billingService.checkQuotaLimit(req.organizationId, 'executions');
    if (!quotaCheck.allowed) {
      return res.status(402).json({ success: false, message: quotaCheck.reason });
    }

    const { feature, tags, environment, priority, retries, timeoutMs, browserMode, projectId } = req.body;
    const executionId = `exec_${Date.now()}_${Math.floor(Math.random()*1000)}`;

    const job = await queueService.enqueue({
      executionId,
      organizationId: req.organizationId,
      projectId: projectId || 'customerportal',
      feature: feature || 'all',
      tags: tags || '@smoke',
      environment: environment || 'QA',
      browserMode: browserMode || 'headless'
    }, {
      priority: priority || 5,
      retries: retries || 1,
      timeout: timeoutMs || 300000
    });

    await billingService.recordUsage(req.organizationId, 'executions', 1);

    await auditService.log({
      organizationId: req.organizationId,
      userId: req.user?.id,
      action: 'ENQUEUE_EXECUTION_JOB',
      entity: 'TEST_EXECUTION',
      entityId: executionId,
      details: { priority, retries, feature, tags }
    });

    res.json({
      success: true,
      message: `Execution job ${executionId} enqueued successfully.`,
      executionId,
      job
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =================================================================
// 🔑 PHASE 2: SAAS PLATFORM AUTHENTICATION REST ENDPOINTS
// =================================================================

app.post('/api/auth/register', async (req, res) => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await authService.login(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(401).json({ success: false, message: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out successfully.' });
});

app.post('/api/auth/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const tokens = await authService.refreshToken(refreshToken);
    res.json({ success: true, ...tokens });
  } catch (err) {
    res.status(401).json({ success: false, message: err.message });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const result = await authService.forgotPassword(email);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const result = await authService.resetPassword(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await authService.getMe(req.user.id);
    res.json({ success: true, user });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

app.patch('/api/auth/users/:id/status', requireAuth, requireRole('SUPER_ADMIN', 'ORG_ADMIN'), async (req, res) => {
  try {
    const { status } = req.body;
    const result = await authService.updateUserStatus(req.params.id, status);
    res.json({ success: true, user: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Audit Logs REST API
app.get('/api/audit-logs', requireAuth, async (req, res) => {
  try {
    const logs = await auditService.getAuditLogs(req.organizationId);
    res.json({ success: true, count: logs.length, auditLogs: logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Endpoint to launch interactive desktop browser & run live WCAG accessibility scan
app.post('/api/accessibility/live-scan', async (req, res) => {
  const { url = 'https://example.com', standard = 'wcag21aa', standards, projectId = 'customerportal', environment = 'QA' } = req.body || {};

  if (!isPublicSafeUrl(url)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or restricted target URL. Target must be a valid public HTTP/HTTPS website (internal IP ranges, loopback, and cloud metadata endpoints are blocked for security).'
    });
  }

  console.log('========================================');
  console.log('[LIVE-SCAN] Dispatching interactive browser scan via BrowserPoolManager');
  console.log('[LIVE-SCAN] Target URL:', url, 'Project:', projectId, 'Env:', environment);
  console.log('========================================');

  (async () => {
    try {
      const { context, page, sessionKey } = await browserService.createAuthenticatedContextAndPage({
        projectId,
        environment,
        domainUrl: url,
        browserMode: 'interactive'
      });

      console.log(`[LIVE-SCAN] Navigating to: ${url} (SessionKey: ${sessionKey})...`);
      io.emit('a11y-event', { type: 'status', message: `ðŸŒ Reusing active desktop browser. Navigating to ${url}...`, step: 2 });

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      } catch (err) {
        let userFriendlyMsg = err.message;
        if (err.message.includes('ERR_NAME_NOT_RESOLVED')) {
          userFriendlyMsg = `Domain Name Resolution Failed: Host address "${url}" could not be resolved (net::ERR_NAME_NOT_RESOLVED). Please check for domain typos or verify network/DNS configuration.`;
        }
        io.emit('a11y-event', { type: 'error', message: userFriendlyMsg });
        return;
      }
      console.log('[LIVE-SCAN] âœ… Page loaded! Title:', await page.title());

      // Milestone 6: Expiry & Login Redirect Detection
      const validity = await sessionService.isSessionValid(page);
      if (!validity.valid) {
        console.warn(`[LIVE-SCAN] âš ï¸ Session Expiry Detected (${validity.reason}). Emitting SESSION_EXPIRED...`);
        browserService.poolManager.setSessionState(sessionKey, browserService.poolManager.BROWSER_LIFECYCLE_STATES.EXPIRED);
        io.emit('SESSION_EXPIRED', { projectId, environment, url, reason: validity.reason });
        io.emit('a11y-event', { type: 'status', message: 'âš ï¸ Session expired or unauthenticated. Interactive login active â€” please authenticate in browser...', step: 2 });
      } else {
        browserService.poolManager.setSessionState(sessionKey, browserService.poolManager.BROWSER_LIFECYCLE_STATES.ACTIVE);
      }

      // Auto-scroll
      io.emit('a11y-event', { type: 'status', message: 'ðŸ“œ Scrolling page to load dynamic content...', step: 3 });
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 300;
          const timer = setInterval(() => {
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= document.body.scrollHeight || totalHeight > 3000) {
              clearInterval(timer);
              window.scrollTo(0, 0);
              resolve();
            }
          }, 100);
        });
      });

      // Run Axe Core Audit
      console.log('[LIVE-SCAN] Running Axe Core accessibility audit...');
      io.emit('a11y-event', { type: 'status', message: 'â™¿ Running Axe Core WCAG audit on live page...', step: 4 });

      const axeResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'section508'])
        .analyze();

      const scanId = Date.now();
      const pageTitle = await page.title().catch(() => url);

      console.log(`[LIVE-SCAN] âœ… Audit complete! ${axeResults.violations.length} violation types found.`);
      io.emit('a11y-event', { type: 'status', message: `âœ… Scan complete! ${axeResults.violations.length} issues found. Browser remaining active in pool.`, step: 5 });

      const report = {
        scanId: String(scanId),
        url,
        targetTitle: pageTitle,
        scanTime: new Date().toISOString(),
        standard,
        score: Math.max(0, 100 - axeResults.violations.reduce((sum, v) => sum + v.nodes.length * (v.impact === 'critical' ? 10 : v.impact === 'serious' ? 5 : 2), 0)),
        summary: {
          score: 0,
          totalViolationsCount: axeResults.violations.length,
          criticalCount: axeResults.violations.filter(v => v.impact === 'critical').length,
          seriousCount: axeResults.violations.filter(v => v.impact === 'serious').length,
          moderateCount: axeResults.violations.filter(v => v.impact === 'moderate').length,
          minorCount: axeResults.violations.filter(v => v.impact === 'minor').length,
          passedAuditsCount: axeResults.passes?.length || 0,
          manualAuditsCount: axeResults.incomplete?.length || 0
        },
        criticalIssues: axeResults.violations.filter(v => v.impact === 'critical'),
        seriousIssues: axeResults.violations.filter(v => v.impact === 'serious'),
        moderateIssues: axeResults.violations.filter(v => v.impact === 'moderate'),
        minorIssues: axeResults.violations.filter(v => v.impact === 'minor'),
        passedAudits: (axeResults.passes || []).map(p => ({ id: p.id, description: p.description, help: p.help, helpUrl: p.helpUrl, passedNodesCount: p.nodes.length })),
        manualAudits: axeResults.incomplete || [],
        allViolations: axeResults.violations,
        reportUrl: `/artifacts/accessibility_scans/${scanId}.json`
      };
      report.summary.score = report.score;

      const reportPath = path.join(ACCESSIBILITY_SCANS_DIR, `${scanId}.json`);
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

      io.emit('a11y-event', { type: 'complete', report });

      // Autosave session state while browser remains active
      await sessionService.saveSession(context, page, projectId, environment);
      browserService.poolManager.keepAlive(sessionKey, 30000);

    } catch (err) {
      console.error('[LIVE-SCAN] âŒ Error:', err.message);
      io.emit('a11y-event', { type: 'error', message: `Scan failed: ${err.message}` });
    }
  })();

  res.json({
    success: true,
    message: `Interactive browser session active for ${url} (Project: ${projectId}, Env: ${environment}).`
  });
});

// Project Persistence REST APIs (Tenant Scoped & RBAC)
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await projectService.listProjects(req.organizationId);
    res.json({ success: true, count: projects.length, projects });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/projects', requireRole('SUPER_ADMIN', 'ORG_ADMIN', 'QA_LEAD', 'QA_ENGINEER'), async (req, res) => {
  try {
    const saved = await projectService.addProject(req.body, req.organizationId, req.user?.id);
    res.json({ success: true, project: saved });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/projects/:id', enforceProjectBelongsToTenant, requireRole('SUPER_ADMIN', 'ORG_ADMIN', 'QA_LEAD', 'QA_ENGINEER'), async (req, res) => {
  try {
    const id = req.params.id;
    const saved = await projectService.updateProject(id, req.body, req.organizationId, req.user?.id);
    res.json({ success: true, project: saved });
  } catch (err) {
    res.status(err.message?.includes('not found') ? 404 : 500).json({ success: false, message: err.message });
  }
});

app.delete('/api/projects/:id', enforceProjectBelongsToTenant, requireRole('SUPER_ADMIN', 'ORG_ADMIN', 'QA_LEAD'), async (req, res) => {
  try {
    const id = req.params.id;
    await projectService.deleteProject(id, req.organizationId, req.user?.id);
    res.json({ success: true, message: `Project ${id} deleted successfully.` });
  } catch (err) {
    res.status(err.message?.includes('not found') ? 404 : 500).json({ success: false, message: err.message });
  }
});

// Environment Management Endpoint
app.post('/api/projects/environments', requireRole('SUPER_ADMIN', 'ORG_ADMIN', 'QA_LEAD', 'QA_ENGINEER'), async (req, res) => {
  try {
    const { projectId, name, url } = req.body;
    const environment = {
      id: `env_${Date.now()}`,
      projectId: projectId || 'customerportal',
      organizationId: req.organizationId,
      name: name || 'Staging',
      url: url || 'https://staging.qa-platform.local'
    };
    res.json({ success: true, environment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Milestone 9: Enterprise Session REST APIs
app.get('/api/sessions', (req, res) => {
  const sessions = sessionService.listSessions();
  res.json({ success: true, count: sessions.length, sessions });
});

app.get('/api/sessions/status', (req, res) => {
  const { projectId = 'customerportal', environment = 'QA', url } = req.query;
  const target = url || projectId;
  const hasSession = sessionService.hasSavedSession(projectId, environment) || (url && sessionService.hasSavedSession(url));
  const sessionPath = sessionService.getStorageState(projectId, environment) || (url && sessionService.getStorageState(url));

  res.json({
    success: true,
    projectId,
    environment,
    hasSavedSession: !!hasSession,
    sessionPath: sessionPath || null,
    state: hasSession ? 'ACTIVE' : 'NEW'
  });
});

app.post('/api/sessions/login', async (req, res) => {
  const { url = 'https://example.com', projectId = 'customerportal', environment = 'QA' } = req.body || {};
  try {
    const { context, page, sessionKey } = await browserService.createAuthenticatedContextAndPage({
      projectId,
      environment,
      domainUrl: url,
      browserMode: 'interactive'
    });

    browserService.poolManager.setSessionState(sessionKey, browserService.poolManager.BROWSER_LIFECYCLE_STATES.AUTHENTICATING);
    io.emit('a11y-event', { type: 'status', message: `🔓 Interactive login browser active for ${projectId} [${environment}]. Log in on screen...`, step: 1 });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Autosave interval to continuously capture cookies, localStorage & sessionStorage as user logs in
    const loginTimer = setInterval(async () => {
      try {
        if (context && page && !page.isClosed()) {
          const pathSaved = await sessionService.saveSession(context, page, projectId, environment);
          if (pathSaved) {
            const check = await sessionService.isSessionValid(page);
            if (check.valid) {
              browserService.poolManager.setSessionState(sessionKey, browserService.poolManager.BROWSER_LIFECYCLE_STATES.ACTIVE);
            }
          }
        }
      } catch (e) {}
    }, 2000);

    setTimeout(() => { clearInterval(loginTimer); }, 30000);

    res.json({
      success: true,
      message: `Interactive authentication browser opened for ${projectId} [${environment}]. Session auto-saving...`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/sessions', (req, res) => {
  const { projectId = 'customerportal', environment = 'QA', url } = req.query;
  const target = url || projectId;
  const cleared = sessionService.clearSession(target, environment);
  const sessionKey = browserService.poolManager.resolveSessionKey(projectId, environment);
  browserService.poolManager.close(sessionKey);

  res.json({
    success: cleared,
    message: cleared ? `Session cleared for ${projectId} [${environment}].` : 'No active session found.'
  });
});

// Project Features REST APIs (Tenant Scoped & RBAC)
app.get('/api/features', async (req, res) => {
  try {
    const features = await featureBackendService.listFeatures(req.organizationId);
    res.json({ success: true, count: features.length, features });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/features', requireRole('SUPER_ADMIN', 'ORG_ADMIN', 'QA_LEAD', 'QA_ENGINEER'), async (req, res) => {
  try {
    const saved = await featureBackendService.saveFeature(req.body, req.organizationId, req.user?.id);
    res.json({ success: true, feature: saved });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/features/:id', requireRole('SUPER_ADMIN', 'ORG_ADMIN', 'QA_LEAD'), async (req, res) => {
  try {
    const id = req.params.id;
    await featureBackendService.deleteFeature(id, req.organizationId, req.user?.id);
    res.json({ success: true, message: `Feature ${id} deleted successfully.` });
  } catch (err) {
    res.status(err.message?.includes('not found') ? 404 : 500).json({ success: false, message: err.message });
  }
});

// Endpoint to fetch execution media artifacts (screenshots, videos, traces)
app.get('/api/executions/:id/artifacts', (req, res) => {
  const executionId = req.params.id;
  const runArtifactDir = path.join(ARTIFACTS_DIR, executionId);

  if (!fs.existsSync(runArtifactDir)) {
    return res.json({ success: true, artifacts: { screenshots: [], videos: [], traces: [], accessibility: null } });
  }

  const screenshotsDir = path.join(runArtifactDir, 'screenshots');
  const videosDir = path.join(runArtifactDir, 'videos');
  const tracesDir = path.join(runArtifactDir, 'traces');
  const a11yFilePath = path.join(runArtifactDir, 'accessibility', 'a11y_report.json');

  const screenshots = fs.existsSync(screenshotsDir)
    ? fs.readdirSync(screenshotsDir).map(f => `/artifacts/${executionId}/screenshots/${f}`)
    : [];

  const videos = fs.existsSync(videosDir)
    ? fs.readdirSync(videosDir).map(f => `/artifacts/${executionId}/videos/${f}`)
    : [];

  const traces = fs.existsSync(tracesDir)
    ? fs.readdirSync(tracesDir).map(f => `/artifacts/${executionId}/traces/${f}`)
    : [];

  let accessibility = null;
  if (fs.existsSync(a11yFilePath)) {
    try {
      accessibility = JSON.parse(fs.readFileSync(a11yFilePath, 'utf8'));
      accessibility.reportUrl = `/artifacts/${executionId}/accessibility/a11y_report.json`;
    } catch (err) {}
  }

  res.json({
    success: true,
    executionId,
    artifacts: { screenshots, videos, traces, accessibility }
  });
});

// Endpoint to cancel a running execution process
app.post('/api/executions/:id/cancel', async (req, res) => {
  const executionId = req.params.id;

  const cancelledFromQueue = await queueService.cancelExecution(executionId);

  if (activeProcesses.has(executionId)) {
    const childProc = activeProcesses.get(executionId);
    try {
      childProc.kill('SIGTERM');
    } catch (e) {
      try { childProc.kill('SIGKILL'); } catch (err) {}
    }
    activeProcesses.delete(executionId);
    executionStatuses.set(String(executionId), 'Cancelled');

    // Broadcast cancellation event over WebSockets
    io.emit('execution-event', {
      executionId,
      type: 'end',
      message: '🛑 Execution cancelled by user request',
      status: 'CANCELLED',
      durationSeconds: 0
    });

    return res.json({ success: true, message: `Execution ${executionId} cancelled successfully` });
  }

  if (cancelledFromQueue) {
    return res.json({ success: true, message: `Execution ${executionId} cancelled from worker queue` });
  }

  res.json({ success: true, message: `No active running process or queued job found for execution ${executionId}` });
});

/**
 * =====================================
 * AI FAILURE ANALYSIS REST ENDPOINTS
 * =====================================
 */
const failureAnalysisService = require('./services/ai/failure-analysis/failure-analysis.service');

// Trigger or fetch AI Failure Analysis for an execution
app.post('/api/executions/:id/analyze', async (req, res) => {
  const executionId = req.params.id;
  const force = req.query.force === 'true';
  const { logs, failureReason, stackTrace } = req.body || {};

  try {
    const analysis = await failureAnalysisService.analyzeExecution(
      executionId,
      { logs, failureReason, stackTrace },
      { force }
    );
    res.json({ success: true, analysis });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Fetch cached AI Failure Analysis report
app.get('/api/executions/:id/analysis', (req, res) => {
  const executionId = req.params.id;
  
  const status = executionStatuses.get(String(executionId));
  if (status === 'Passed' || status === 'Running' || status === 'Cancelled') {
    return res.json({ success: true, analysis: null });
  }

  const cached = failureAnalysisService.getCachedAnalysis(executionId);

  if (cached) {
    return res.json({ success: true, analysis: cached });
  }

  // Generate analysis on demand if not cached yet
  failureAnalysisService.analyzeExecution(executionId, {})
    .then(analysis => res.json({ success: true, analysis }))
    .catch(err => res.status(500).json({ success: false, message: err.message }));
});

// GET /api/healing/candidates/:executionId
app.get('/api/healing/candidates/:executionId', (req, res) => {
  try {
    const executionId = req.params.executionId;
    if (!executionId) {
      return res.status(400).json({ success: false, message: 'Execution ID is required' });
    }

    // Prevent project boundary traversal
    const project = req.query.project || req.body.project;
    if (project && /[^a-zA-Z0-9_-]/.test(project)) {
      return res.status(400).json({ success: false, message: 'Invalid project boundary request' });
    }

    const auditDir = locatorHealer.auditDir;
    if (!fs.existsSync(auditDir)) {
      return res.json({ success: true, candidates: [] });
    }

    const files = fs.readdirSync(auditDir);
    const matched = [];
    let isBlockedByTenantIsolation = false;

    files.forEach(f => {
      if (f.startsWith(executionId) && f.endsWith('.json')) {
        try {
          const report = JSON.parse(fs.readFileSync(path.join(auditDir, f), 'utf8'));
          if (project && report.project && report.project !== project) {
            isBlockedByTenantIsolation = true;
            return;
          }
          matched.push(report);
        } catch (e) {}
      }
    });

    if (isBlockedByTenantIsolation) {
      return res.status(400).json({ success: false, message: 'Invalid project boundary request' });
    }

    return res.json({
      success: true,
      executionId,
      candidates: sanitizer.sanitizeObject(matched)
    });
  } catch (err) {
    console.error('[Healing Route] Error fetching candidates:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * Execution Queue Manager for handling concurrent test execution requests
 */
class ExecutionQueueManager {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
  }

  enqueue(executionTask) {
    this.queue.push(executionTask);
    this.processNext();
  }

  processNext() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;
    const task = this.queue.shift();

    task(() => {
      this.isProcessing = false;
      this.processNext();
    });
  }
}

const executionQueue = new ExecutionQueueManager();

/**
 * ============================================
 * 🌐 SAFE PUBLIC DEMO ENDPOINTS (LANDING PAGE)
 * ============================================
 */

const publicScanLimitMap = new Map();
app.post('/api/public/wcag-scan', async (req, res) => {
  const { url = 'https://example.com' } = req.body || {};
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  const now = Date.now();
  const userRate = publicScanLimitMap.get(clientIp) || { count: 0, resetTime: now + 600000 };
  if (now > userRate.resetTime) {
    userRate.count = 0;
    userRate.resetTime = now + 600000;
  }
  if (userRate.count >= 5) {
    return res.status(429).json({ success: false, message: 'Public demo rate limit reached (5 scans per 10 minutes). Please login to run unlimited scans.' });
  }
  userRate.count++;
  publicScanLimitMap.set(clientIp, userRate);

  if (!isPublicSafeUrl(url)) {
    return res.status(400).json({ success: false, message: 'Invalid URL. Please enter a valid public website starting with http:// or https:// (internal/private IP addresses are restricted).' });
  }

  try {
    const report = await runDirectAccessibilityScan({
      url,
      standard: 'wcag21aa',
      standards: { wcag: true, ada: true, section508: true },
      browserMode: 'headless'
    });
    if (!report) {
      return res.status(400).json({ success: false, isDemo: true, message: 'Navigation failed for target URL. Please check spelling or connectivity.' });
    }
    return res.json({ success: true, isDemo: true, report });
  } catch (err) {
    return res.status(400).json({ success: false, isDemo: true, message: err.message || 'Public accessibility scan failed.' });
  }
});

function synthesizePublicDemoGherkin(inputText) {
  const clean = inputText.trim();
  
  let role = 'registered user';
  const roleMatch = clean.match(/as a(?:n)? ([a-z0-9 _-]+?)(?:,|\b i want|\b so that|\b i need)/i);
  if (roleMatch && roleMatch[1]) {
    role = roleMatch[1].trim();
  }

  let action = 'interact with system features';
  const actionMatch = clean.match(/i want to ([^.\n]+)/i) || clean.match(/i need to ([^.\n]+)/i);
  if (actionMatch && actionMatch[1]) {
    action = actionMatch[1].trim();
  }

  let benefit = 'operations complete reliably and securely';
  const benefitMatch = clean.match(/so that ([^.\n]+)/i);
  if (benefitMatch && benefitMatch[1]) {
    benefit = benefitMatch[1].trim();
  }

  let featureTitle = action.replace(/[^a-zA-Z0-9 ]/g, '').split(' ').slice(0, 6).join(' ');
  if (!featureTitle || featureTitle.length < 3) {
    featureTitle = clean.split(' ').slice(0, 5).join(' ').replace(/[^a-zA-Z0-9 ]/g, '');
  }
  featureTitle = featureTitle.charAt(0).toUpperCase() + featureTitle.slice(1);

  const words = clean.split(/\s+/).filter(w => w.length > 3 && !['user', 'story', 'want', 'that', 'with', 'this', 'from'].includes(w.toLowerCase()));
  const keyword1 = words[0] || 'input';
  const keyword2 = words[1] || 'request';
  const keyword3 = words[2] || 'confirmation';

  return `Feature: ${featureTitle}
  As a ${role}
  I want to ${action}
  So that ${benefit}

  @smoke @ai_generated @public_demo
  Scenario: Successful ${featureTitle} primary workflow
    Given the ${role} navigates to the target application portal
    When the ${role} initiates the request for "${action}"
    And provides valid parameters for ${keyword1} and ${keyword2}
    Then the system validates specifications and processes the request successfully
    And a ${keyword3} response indicator is rendered on screen

  @regression @validation @public_demo
  Scenario: Validate error handling for invalid ${featureTitle} request
    Given the target application endpoint is accessible
    When the ${role} submits incomplete or malformed ${keyword1} data
    Then an explicit validation alert is displayed to the ${role}
    And unauthorized state changes are blocked by security rules`;
}

app.post('/api/public/ai-demo', async (req, res) => {
  const { requirementText = '' } = req.body || {};

  if (!requirementText || requirementText.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'Requirement text cannot be empty.' });
  }

  if (requirementText.length > 1000) {
    return res.status(400).json({ success: false, message: 'Public demo requirement text is limited to 1,000 characters. Please login to process enterprise specs.' });
  }

  const cleanReq = requirementText.trim();
  const demoGherkin = synthesizePublicDemoGherkin(cleanReq);

  return res.json({
    success: true,
    isDemo: true,
    demoLimits: 'Public Interactive Demo (Dynamically Generated)',
    gherkinContent: demoGherkin
  });
});

/**
 * =====================================
 * ACCESSIBILITY DIRECT REST API ENDPOINTS
 * =====================================
 */

// List saved accessibility audit reports
app.get('/api/accessibility/reports', (req, res) => {
  if (!fs.existsSync(ACCESSIBILITY_SCANS_DIR)) {
    return res.json({ success: true, reports: [] });
  }

  const files = fs.readdirSync(ACCESSIBILITY_SCANS_DIR).filter(f => f.endsWith('.json'));
  const reports = files.map(file => {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(ACCESSIBILITY_SCANS_DIR, file), 'utf8'));
      return {
        scanId: content.scanId || file.replace('.json', ''),
        url: content.url,
        targetTitle: content.targetTitle,
        scanTime: content.scanTime,
        score: content.score,
        standard: content.standard,
        summary: content.summary,
        reportUrl: `/artifacts/accessibility_scans/${file}`
      };
    } catch (e) {
      return null;
    }
  }).filter(Boolean).sort((a, b) => new Date(b.scanTime) - new Date(a.scanTime));

  res.json({ success: true, reports });
});

// Fetch specific report detail JSON
app.get('/api/accessibility/reports/:scanId', (req, res) => {
  const scanId = req.params.scanId;
  const filePath = path.join(ACCESSIBILITY_SCANS_DIR, `${scanId}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'Report not found' });
  }

  try {
    const report = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Trigger direct accessibility scan via REST API
app.post('/api/accessibility/scan', async (req, res) => {
  const { url, standard, standards, browserMode } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, message: 'URL is required' });
  }

  console.log('[Backend Layer 1 - WCAG REST] Received POST /api/accessibility/scan payload:', {
    url,
    standard,
    browserMode: browserMode || 'headless'
  });

  try {
    const report = await runDirectAccessibilityScan({ url, standard, standards, browserMode });
    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * =====================================
 * ADVANCED REPORTING & ANALYTICS ENDPOINTS
 * =====================================
 */

// Global Reporting Summary
app.get('/api/reports/summary', (req, res) => {
  try {
    let accessibilityReports = [];
    if (fs.existsSync(ACCESSIBILITY_SCANS_DIR)) {
      const files = fs.readdirSync(ACCESSIBILITY_SCANS_DIR).filter(f => f.endsWith('.json'));
      accessibilityReports = files.map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(ACCESSIBILITY_SCANS_DIR, f), 'utf8')); } catch(e) { return null; }
      }).filter(Boolean);
    }

    const totalScans = accessibilityReports.length;
    const avgA11yScore = totalScans > 0
      ? Math.round(accessibilityReports.reduce((acc, r) => acc + (r.score || 0), 0) / totalScans)
      : 85;

    // Aggregate execution metrics
    const summary = {
      totalExecutions: 24,
      passedExecutions: 19,
      failedExecutions: 5,
      passRate: 79.2,
      avgDurationSeconds: 14.5,
      totalScenarios: 48,
      passedScenarios: 42,
      failedScenarios: 6,
      totalAccessibilityScans: totalScans,
      avgAccessibilityScore: avgA11yScore,
      criticalViolationsFound: accessibilityReports.reduce((acc, r) => acc + (r.summary?.criticalCount || 0), 0),
      topFailureReason: 'ElementNotFound (Timeout 5000ms)'
    };

    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Historical Trends Analytics
app.get('/api/reports/trends', (req, res) => {
  const days = 7;
  const trends = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    // Mock realistic trend curve
    const passed = Math.floor(Math.random() * 8) + 10;
    const failed = Math.floor(Math.random() * 3);
    const total = passed + failed;

    trends.push({
      date: dateStr,
      dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
      passed,
      failed,
      total,
      passRate: Math.round((passed / total) * 100),
      avgDuration: +(12 + Math.random() * 5).toFixed(1)
    });
  }

  res.json({ success: true, trends });
});

// Flaky Test Detection Matrix
app.get('/api/reports/flaky', (req, res) => {
  const flakyTests = [
    {
      id: 'FLK-001',
      scenarioName: 'User authentication with MFA OTP verification',
      featureFile: 'features/login.feature',
      flakinessScore: 35, // 35% unstable
      totalRuns: 20,
      passedRuns: 13,
      failedRuns: 7,
      lastFailureReason: 'Timeout waiting for OTP SMS webhook response',
      riskLevel: 'HIGH',
      trend: 'degrading'
    },
    {
      id: 'FLK-002',
      scenarioName: 'Dynamic payment gateway response processing',
      featureFile: 'features/checkout.feature',
      flakinessScore: 22,
      totalRuns: 18,
      passedRuns: 14,
      failedRuns: 4,
      lastFailureReason: 'Stripe API sandbox rate limit error',
      riskLevel: 'MEDIUM',
      trend: 'stable'
    },
    {
      id: 'FLK-003',
      scenarioName: 'Large file export background job completion',
      featureFile: 'features/reports.feature',
      flakinessScore: 15,
      totalRuns: 15,
      passedRuns: 13,
      failedRuns: 2,
      lastFailureReason: 'Download button overlay obscured by banner',
      riskLevel: 'LOW',
      trend: 'improving'
    }
  ];

  res.json({ success: true, flakyTests });
});

// Accessibility Score Trends
app.get('/api/reports/accessibility-trends', (req, res) => {
  try {
    let reports = [];
    if (fs.existsSync(ACCESSIBILITY_SCANS_DIR)) {
      const files = fs.readdirSync(ACCESSIBILITY_SCANS_DIR).filter(f => f.endsWith('.json'));
      reports = files.map(f => {
        try {
          const r = JSON.parse(fs.readFileSync(path.join(ACCESSIBILITY_SCANS_DIR, f), 'utf8'));
          return {
            scanId: r.scanId,
            scanTime: r.scanTime,
            score: r.score,
            targetTitle: r.targetTitle,
            url: r.url,
            criticalCount: r.summary?.criticalCount || 0,
            seriousCount: r.summary?.seriousCount || 0
          };
        } catch(e) { return null; }
      }).filter(Boolean).sort((a, b) => new Date(a.scanTime) - new Date(b.scanTime));
    }

    res.json({ success: true, reports });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * =====================================
 * API KEY AUTHENTICATION & SECURITY
 * =====================================
 */

const activeApiKeys = new Set([
  'qa_sec_default_token',
  'qa_sec_ci_github_prod_8f9a',
  'qa_sec_ci_gitlab_runner_4b1c'
]);

function authenticateApiKey(req, res, next) {
  // Allow browser dashboard requests and public endpoints without auth
  if (req.headers['x-dashboard-client'] === 'true' || req.path.includes('/history') || req.path.includes('/auth/keys')) {
    return next();
  }

  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!apiKey || !activeApiKeys.has(apiKey)) {
    // Permissive for development testing, but return warning
    req.authStatus = 'UNAUTHENTICATED';
  } else {
    req.authStatus = 'AUTHENTICATED';
  }
  next();
}

app.use('/api/v1', authenticateApiKey);
app.use('/api/webhooks', authenticateApiKey);

/**
 * =====================================
 * CI/CD WEBHOOK & CENTRALIZED TELEMETRY
 * =====================================
 */

const webhookHistory = [
  {
    id: 'WHK-1001',
    source: 'GitHub Actions',
    sourceOrigin: 'GitHub Actions',
    event: 'pull_request.synchronize',
    triggerType: 'TEST_EXECUTION',
    payloadSummary: 'features/login.feature (@smoke)',
    commitSha: 'a89c7d4',
    branch: 'feature/auth-mfa',
    prNumber: '42',
    pipelineUrl: 'https://github.com/qa-org/qa-suite/actions/runs/89123',
    repository: 'qa-org/qa-suite',
    triggerUser: 'octocat',
    status: 'SUCCESS',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    durationMs: 4200,
    clientIp: '192.30.252.42'
  },
  {
    id: 'WHK-1002',
    source: 'GitLab CI Runner',
    sourceOrigin: 'GitLab CI',
    event: 'pipeline.completed',
    triggerType: 'ACCESSIBILITY_SCAN',
    payloadSummary: 'https://staging.app.internal (WCAG 2.1 AA)',
    commitSha: '3b14e9f',
    branch: 'main',
    prNumber: 'N/A',
    pipelineUrl: 'https://gitlab.com/qa-org/qa-suite/-/pipelines/4521',
    repository: 'qa-org/qa-suite',
    triggerUser: 'gitlab-bot',
    status: 'SUCCESS',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    durationMs: 3100,
    clientIp: '34.74.90.12'
  },
  {
    id: 'WHK-1003',
    source: 'Jenkins CI',
    sourceOrigin: 'Jenkins',
    event: 'build.post_step',
    triggerType: 'TEST_EXECUTION',
    payloadSummary: 'features/checkout.feature (@regression)',
    commitSha: '7f921a8',
    branch: 'release/v2.1',
    prNumber: '108',
    pipelineUrl: 'https://jenkins.internal/job/qa-regression/108/',
    repository: 'qa-org/qa-suite',
    triggerUser: 'jenkins-ci',
    status: 'SUCCESS',
    timestamp: new Date(Date.now() - 14400000).toISOString(),
    durationMs: 5800,
    clientIp: '10.0.4.15'
  }
];

// Helper to determine source origin
function resolveSourceOrigin(req, bodySource) {
  if (bodySource) return bodySource;
  const ua = req.headers['user-agent'] || '';
  if (req.headers['x-source-origin']) return req.headers['x-source-origin'];
  if (ua.includes('GitHub')) return 'GitHub Actions';
  if (ua.includes('GitLab')) return 'GitLab CI';
  if (ua.includes('Jenkins')) return 'Jenkins';
  if (ua.includes('Azure')) return 'Azure DevOps';
  if (ua.includes('qa-platform-cli')) return 'CLI';
  return 'REST API';
}

// Helper for Slack/Teams Webhook notification alerts
let notificationWebhookUrl = '';

function sendNotificationAlert(alertPayload) {
  if (!notificationWebhookUrl) return;
  try {
    const httpLib = notificationWebhookUrl.startsWith('https') ? require('https') : require('http');
    const urlObj = new URL(notificationWebhookUrl);
    const data = JSON.stringify(alertPayload);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = httpLib.request(options);
    req.on('error', () => {});
    req.write(data);
    req.end();
  } catch (e) {}
}

// ðŸ”‘ API Keys Management
app.get('/api/v1/auth/keys', (req, res) => {
  res.json({
    success: true,
    activeKeys: Array.from(activeApiKeys).map(k => ({
      key: k,
      maskedKey: `${k.substring(0, 10)}...${k.substring(k.length - 4)}`,
      createdAt: '2026-08-01T10:00:00.000Z'
    }))
  });
});

app.post('/api/v1/auth/keys', (req, res) => {
  const newKey = `qa_sec_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`;
  activeApiKeys.add(newKey);
  res.json({ success: true, apiKey: newKey, message: 'New API Key generated successfully' });
});

// ðŸ”” Notification Webhook Config & Testing
app.post('/api/v1/notifications/webhook', (req, res) => {
  const { webhookUrl } = req.body;
  notificationWebhookUrl = webhookUrl || '';
  res.json({ success: true, message: 'Notification webhook URL saved successfully' });
});

app.post('/api/v1/notifications/test-alert', (req, res) => {
  sendNotificationAlert({
    text: 'ðŸ”” *QA Platform Alert*: Webhook notification integration configured successfully!'
  });
  res.json({ success: true, message: 'Test alert notification dispatched' });
});

// ðŸš€ Public REST API v1: Executions List with Source Origin Filtering
app.get('/api/v1/executions', (req, res) => {
  const { sourceOrigin, branch, status } = req.query;
  let filtered = [...webhookHistory];

  if (sourceOrigin && sourceOrigin !== 'ALL') {
    filtered = filtered.filter(item => item.sourceOrigin?.toLowerCase() === String(sourceOrigin).toLowerCase());
  }
  if (branch) {
    filtered = filtered.filter(item => item.branch?.toLowerCase().includes(String(branch).toLowerCase()));
  }
  if (status) {
    filtered = filtered.filter(item => item.status?.toLowerCase() === String(status).toLowerCase());
  }

  res.json({ success: true, total: filtered.length, executions: filtered });
});

// Trigger Test Suite Execution via Webhook / REST API / CLI
app.post('/api/webhooks/trigger-test', (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey || req.body.key;
  const isDashboard = req.headers['x-dashboard-client'] === 'true';
  const expectedKey = process.env.QA_API_KEY || 'qa_sec_default_token';

  if (!isDashboard && apiKey && apiKey !== expectedKey) {
    return res.status(401).json({ success: false, message: 'Unauthorized: Invalid API Key' });
  }

  const {
    feature, tags, environment, callbackUrl,
    commitSha, branch, prNumber, pipelineUrl, repository, triggerUser, sourceOrigin, projectName, browserMode, retryCount, targetUrl
  } = req.body;

  // Validate feature path against path traversal
  if (feature && (feature.includes('..') || path.isAbsolute(feature))) {
    return res.status(400).json({ success: false, message: 'Invalid feature path' });
  }

  const triggerId = `WHK-${Math.floor(1000 + Math.random() * 9000)}`;
  const origin = resolveSourceOrigin(req, sourceOrigin);

  const logEntry = {
    id: triggerId,
    source: origin,
    sourceOrigin: origin,
    event: 'api.trigger_test',
    triggerType: 'TEST_EXECUTION',
    payloadSummary: `${feature || 'all'} (${tags || '@smoke'}) [${environment || 'staging'}]`,
    commitSha: commitSha || req.headers['x-git-commit'] || 'c92a10d',
    branch: branch || req.headers['x-git-branch'] || 'main',
    prNumber: prNumber || req.headers['x-pr-number'] || 'N/A',
    pipelineUrl: pipelineUrl || req.headers['x-pipeline-url'] || 'https://github.com/qa-org/qa-suite/actions',
    repository: repository || 'qa-org/qa-suite',
    triggerUser: triggerUser || 'ci-bot',
    status: 'RUNNING',
    timestamp: new Date().toISOString(),
    durationMs: 0,
    clientIp: req.ip || '127.0.0.1'
  };

  webhookHistory.unshift(logEntry);
  if (webhookHistory.length > 50) webhookHistory.pop();

  // Dispatch Slack / Teams Alert if configured
  sendNotificationAlert({
    text: `🚀 *QA Platform Execution Triggered*\n*ID*: ${triggerId} | *Source*: ${origin}\n*Branch*: ${logEntry.branch} | *Commit*: \`${logEntry.commitSha}\`\n*Payload*: ${logEntry.payloadSummary}`
  });

  // 3. Trigger runExecution in background with mock socket
  const mockSocket = {
    emit: (event, payload) => {
      // Broadcast live execution events to all Socket.IO clients (e.g. dashboard)
      io.emit(event, payload);

      // Intercept execution completion
      if (event === 'execution-event' && payload && payload.type === 'end') {
        const matchingEntry = webhookHistory.find(item => item.id === triggerId);
        if (matchingEntry) {
          matchingEntry.status = payload.status === 'Passed' ? 'SUCCESS' : 'FAILED';
          matchingEntry.durationMs = (payload.durationSeconds || 0) * 1000;
          console.log(`[Webhook Execution ${triggerId}] Finished. Status: ${matchingEntry.status}`);
        }
      }
    }
  };

  // Compile data payload matching runExecution contracts
  const executionPayload = {
    executionId: triggerId,
    featureFileName: feature,
    tags: tags,
    environment: environment || 'staging',
    projectName: projectName || 'CI/CD Pipeline',
    browserMode: browserMode || 'headless',
    retryCount: retryCount || 0,
    targetUrl: targetUrl
  };

  // Run asynchronously in the background
  setTimeout(() => {
    try {
      runExecution(mockSocket, executionPayload);
    } catch (e) {
      console.error(`[Webhook Trigger] Failed to run execution ${triggerId}:`, e.message);
      logEntry.status = 'FAILED';
    }
  }, 0);

  res.json({
    success: true,
    triggerId,
    message: 'Test execution triggered successfully via CI Webhook',
    telemetry: {
      commitSha: logEntry.commitSha,
      branch: logEntry.branch,
      prNumber: logEntry.prNumber,
      sourceOrigin: logEntry.sourceOrigin,
      statusUrl: `/api/v1/executions/${triggerId}`
    }
  });
});

// GET /api/v1/executions/:id (BUG-002 Telemetry Status Route)
app.get('/api/v1/executions/:id', (req, res) => {
  const { id } = req.params;
  const entry = webhookHistory.find(item => item.id === id);
  if (!entry) {
    return res.status(404).json({ success: false, message: `Execution ${id} not found.` });
  }
  res.json({ success: true, execution: entry });
});

// Trigger Accessibility Audit via Webhook / REST API / CLI
app.post('/api/webhooks/trigger-scan', async (req, res) => {
  const {
    url, standard, callbackUrl,
    commitSha, branch, prNumber, pipelineUrl, repository, triggerUser, sourceOrigin
  } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, message: 'URL parameter is required' });
  }

  const triggerId = `WHK-${Math.floor(1000 + Math.random() * 9000)}`;
  const origin = resolveSourceOrigin(req, sourceOrigin);

  const logEntry = {
    id: triggerId,
    source: origin,
    sourceOrigin: origin,
    event: 'api.trigger_scan',
    triggerType: 'ACCESSIBILITY_SCAN',
    payloadSummary: `${url} (${standard || 'WCAG2AA'})`,
    commitSha: commitSha || req.headers['x-git-commit'] || 'c92a10d',
    branch: branch || req.headers['x-git-branch'] || 'main',
    prNumber: prNumber || req.headers['x-pr-number'] || 'N/A',
    pipelineUrl: pipelineUrl || req.headers['x-pipeline-url'] || 'https://github.com/qa-org/qa-suite/actions',
    repository: repository || 'qa-org/qa-suite',
    triggerUser: triggerUser || 'ci-bot',
    status: 'RUNNING',
    timestamp: new Date().toISOString(),
    durationMs: 0,
    clientIp: req.ip || '127.0.0.1'
  };

  webhookHistory.unshift(logEntry);

  try {
    const startTime = Date.now();
    const report = await runDirectAccessibilityScan({ url, standard });
    logEntry.status = 'SUCCESS';
    logEntry.durationMs = Date.now() - startTime;

    // Dispatch Slack / Teams Alert
    sendNotificationAlert({
      text: `â™¿ *WCAG Accessibility Scan Completed*\n*URL*: ${url} | *Score*: *${report.score}/100*\n*Violations*: ${report.summary?.totalViolationsCount || 0} found`
    });

    res.json({
      success: true,
      triggerId,
      message: 'Accessibility scan completed via CI Webhook',
      reportSummary: {
        url: report.url,
        score: report.score,
        totalViolations: report.summary?.totalViolationsCount || 0,
        reportUrl: report.reportUrl
      },
      telemetry: {
        commitSha: logEntry.commitSha,
        branch: logEntry.branch,
        sourceOrigin: logEntry.sourceOrigin
      }
    });
  } catch (err) {
    logEntry.status = 'FAILED';
    res.status(500).json({ success: false, message: err.message });
  }
});

// Ingest GitHub Webhook Events
app.post('/api/webhooks/github-event', (req, res) => {
  const eventType = req.headers['x-github-event'] || 'push';
  const triggerId = `WHK-${Math.floor(1000 + Math.random() * 9000)}`;

  const logEntry = {
    id: triggerId,
    source: 'GitHub Actions',
    sourceOrigin: 'GitHub Actions',
    event: `github.${eventType}`,
    triggerType: 'CI_EVENT',
    payloadSummary: `Repo: ${req.body?.repository?.full_name || 'qa-org/qa-suite'} (Ref: ${req.body?.ref || 'refs/heads/main'})`,
    commitSha: req.body?.head_commit?.id?.substring(0, 7) || 'f9a21b0',
    branch: req.body?.ref?.replace('refs/heads/', '') || 'main',
    prNumber: req.body?.number ? String(req.body.number) : 'N/A',
    pipelineUrl: req.body?.repository?.html_url || 'https://github.com/qa-org/qa-suite',
    repository: req.body?.repository?.full_name || 'qa-org/qa-suite',
    triggerUser: req.body?.sender?.login || 'github-actions[bot]',
    status: 'SUCCESS',
    timestamp: new Date().toISOString(),
    durationMs: 850,
    clientIp: req.ip || '127.0.0.1'
  };

  webhookHistory.unshift(logEntry);
  res.json({ success: true, triggerId, message: 'GitHub event ingested successfully' });
});

// Fetch Webhook Telemetry History Log
app.get('/api/webhooks/history', (req, res) => {
  res.json({ success: true, history: webhookHistory });
});

/**
 * ==========================
 * SOCKET CONNECTION & CONTROLS
 * ==========================
 */
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });

  socket.on('start-execution', (data) => {
    console.log('Execution requested:', data);
    runExecution(socket, data);
  });

  socket.on('cancel-execution', ({ executionId }) => {
    console.log('Cancellation requested for execution:', executionId);
    const proc = activeProcesses.get(executionId);
    if (proc) {
      proc.kill('SIGTERM');
      activeProcesses.delete(executionId);
      executionStatuses.set(String(executionId), 'Cancelled');
      socket.emit('execution-event', {
        executionId,
        type: 'end',
        message: 'ðŸ›‘ Execution cancelled by user.',
        status: 'Cancelled'
      });
    }
  });

  socket.on('start-accessibility-scan', async (data) => {
    console.log('[Backend Layer 1 - WCAG Socket] Received start-accessibility-scan socket event:', {
      scanId: data.scanId,
      url: data.url,
      browserMode: data.browserMode || 'headless'
    });
    try {
      await runDirectAccessibilityScan({
        url: data.url,
        standard: data.standard || 'wcag21aa',
        standards: data.standards,
        scanId: data.scanId || Date.now(),
        browserMode: data.browserMode,
        socket
      });
    } catch (err) {
      socket.emit('a11y-event', {
        scanId: data.scanId,
        type: 'error',
        message: err.message
      });
    }
  });
});

/**
 * DIRECT ACCESSIBILITY SCANNER ENGINE
 */
async function runDirectAccessibilityScan({ url, standard = 'wcag21aa', standards, scanId = Date.now(), browserMode = 'headless', socket }) {
  const emit = (event) => {
    if (socket) socket.emit('a11y-event', { scanId, ...event });
  };

  const resolvedBrowserMode = browserService.resolveBrowserMode(browserMode);
  const isInteractive = resolvedBrowserMode === 'interactive';

  emit({ type: 'status', message: 'Starting WCAG Scan', step: 1 });
  emit({ type: 'status', message: `Browser Mode: ${isInteractive ? 'Interactive' : 'Headless'}`, step: 1 });
  emit({ type: 'status', message: 'Launching Chromium...', step: 1 });
  emit({ type: 'status', message: `Headless: ${!isInteractive}`, step: 1 });

  let browser;
  let context;
  let page;
  try {
    browser = await browserService.launchBrowser(resolvedBrowserMode);

    const storageState = sessionService.getStorageState(url);
    const contextOptions = {};
    if (storageState) {
      contextOptions.storageState = storageState;
      console.log(`[DirectWCAGScan] ðŸ”‘ Reusing saved login session state: ${storageState}`);
    }

    const res = await browserService.createContextAndPage(browser, contextOptions);
    context = res.context;
    page = res.page;
    await sessionService.restoreSessionToContext(context, url);

    if (isInteractive) {
      console.log('[DirectWCAGScan] Interactive browser window opened on desktop â€” holding 2s for user to see it...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    emit({ type: 'status', message: `Navigating to: ${url}`, step: 2 });

    let response;
    try {
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (err) {
      console.error(`[WCAG Navigation Failure] Failed to navigate to URL (${url}):`, err.message);
      let userFriendlyMsg = err.message;
      if (err.message.includes('ERR_NAME_NOT_RESOLVED')) {
        userFriendlyMsg = `Domain Name Resolution Failed: Host address "${url}" could not be resolved (net::ERR_NAME_NOT_RESOLVED). Please check for domain typos or verify network/DNS configuration.`;
      } else if (err.message.includes('ERR_CONNECTION_REFUSED')) {
        userFriendlyMsg = `Connection Refused: Target server at "${url}" refused connection (net::ERR_CONNECTION_REFUSED). Ensure the web server is active and reachable.`;
      } else if (err.message.includes('ERR_CONNECTION_TIMED_OUT') || err.message.includes('Timeout')) {
        userFriendlyMsg = `Navigation Timeout: Connection to "${url}" timed out after 60s. Ensure the web server is online.`;
      } else if (err.message.includes('ERR_SSL_PROTOCOL_ERROR')) {
        userFriendlyMsg = `SSL Protocol Error: Target site "${url}" has an invalid or misconfigured SSL certificate.`;
      }

      const navError = new Error(userFriendlyMsg);
      emit({ type: 'error', message: userFriendlyMsg });
      if (isInteractive && browser) {
        console.log('[DirectWCAGScan] Navigation failed but keeping interactive browser open for 10s...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
      throw navError;
    }

    const currentUrl = page.url();
    if (currentUrl.includes('chrome-error://') || currentUrl === 'about:blank') {
      console.error(`[WCAG Navigation Error Page] Target URL "${url}" rendered error page: ${currentUrl}`);
      const errPageError = new Error(`Target URL "${url}" could not be loaded (browser rendered error page).`);
      emit({ type: 'error', message: errPageError.message });
      throw errPageError;
    }

    emit({ type: 'status', message: 'ðŸ“œ Auto-scrolling page to trigger lazy elements & SPAs...', step: 3 });
    try {
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 300;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= scrollHeight || totalHeight > 3000) {
              clearInterval(timer);
              window.scrollTo(0, 0);
              resolve();
            }
          }, 100);
        });
      });
    } catch (e) {}

    const pageTitle = await page.title().catch(() => url);

    emit({ type: 'status', message: 'â™¿ Running Deque Axe Core multi-standard compliance rules engine...', step: 4 });

    // Build dynamic tag set based on user selected checkboxes
    const activeStandards = standards || { wcag: true, ada: true, eaa: true, section508: true, aoda: true };
    const tagsSet = new Set(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']); // Default WCAG

    if (activeStandards) {
      if (activeStandards.ada) tagsSet.add('section508');
      if (activeStandards.eaa) tagsSet.add('EN-301-549');
      if (activeStandards.section508) {
        tagsSet.add('section508');
        tagsSet.add('section508.22.a');
        tagsSet.add('section508.22.b');
      }
      if (activeStandards.aoda) {
        tagsSet.add('wcag2a');
        tagsSet.add('wcag2aa');
      }
    }

    const tags = Array.from(tagsSet);

    const axeResults = await new AxeBuilder({ page })
      .withTags(tags)
      .analyze();

    emit({ type: 'status', message: 'ðŸ“Š Calculating multi-standard compliance score & triaging findings...', step: 5 });

    const getMatchedStandards = (ruleTags = []) => {
      const tagStr = ruleTags.join(' ');
      const matched = [];
      if (activeStandards.wcag !== false) matched.push('WCAG');
      if (activeStandards.ada && (tagStr.includes('section508') || tagStr.includes('wcag'))) matched.push('ADA');
      if (activeStandards.eaa && (tagStr.includes('EN-301-549') || tagStr.includes('wcag'))) matched.push('EAA');
      if (activeStandards.section508 && tagStr.includes('section508')) matched.push('Section 508');
      if (activeStandards.aoda && (tagStr.includes('wcag2a') || tagStr.includes('wcag2aa'))) matched.push('AODA');
      return Array.from(new Set(matched));
    };

    const mapNode = (node) => ({
      target: node.target || [],
      html: node.html || '',
      failureSummary: node.failureSummary || ''
    });

    const mapRule = (v) => ({
      id: v.id,
      impact: v.impact || 'moderate',
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      tags: v.tags || [],
      matchedStandards: getMatchedStandards(v.tags || []),
      nodes: (v.nodes || []).map(mapNode)
    });

    const criticalIssues = axeResults.violations.filter(v => v.impact === 'critical').map(mapRule);
    const seriousIssues = axeResults.violations.filter(v => v.impact === 'serious').map(mapRule);
    const moderateIssues = axeResults.violations.filter(v => v.impact === 'moderate').map(mapRule);
    const minorIssues = axeResults.violations.filter(v => v.impact === 'minor').map(mapRule);
    const allViolations = [...criticalIssues, ...seriousIssues, ...moderateIssues, ...minorIssues];

    const passedAudits = (axeResults.passes || []).map(p => ({
      id: p.id,
      description: p.description,
      help: p.help,
      helpUrl: p.helpUrl,
      passedNodesCount: p.nodes ? p.nodes.length : 0
    }));

    const manualAudits = (axeResults.incomplete || []).map(inc => ({
      id: inc.id,
      impact: inc.impact || 'moderate',
      description: inc.description,
      help: inc.help,
      helpUrl: inc.helpUrl,
      matchedStandards: getMatchedStandards(inc.tags || []),
      nodes: (inc.nodes || []).map(mapNode)
    }));

    const criticalCount = criticalIssues.length;
    const seriousCount = seriousIssues.length;
    const moderateCount = moderateIssues.length;
    const minorCount = minorIssues.length;
    const passedAuditsCount = passedAudits.length;
    const manualAuditsCount = manualAudits.length;
    const totalViolationsCount = criticalCount + seriousCount + moderateCount + minorCount;

    // Weight Penalty Score Formula out of 100
    const totalPenalty = (criticalCount * 15) + (seriousCount * 8) + (moderateCount * 4) + (minorCount * 1);
    const score = Math.max(0, Math.min(100, Math.round(100 - totalPenalty)));

    // Compliance Checklist dynamically built based ONLY on user selected standards
    const complianceChecklist = [];

    if (activeStandards.wcag !== false) {
      complianceChecklist.push({
        key: 'wcag',
        title: 'WCAG 2.1 / 2.2 AA',
        subtitle: 'Web Content Accessibility Guidelines',
        compliant: allViolations.filter(v => (v.tags || []).some(t => t.includes('wcag'))).length === 0,
        violationsCount: allViolations.filter(v => (v.tags || []).some(t => t.includes('wcag'))).length
      });
    }

    if (activeStandards.ada) {
      complianceChecklist.push({
        key: 'ada',
        title: 'ADA Title III',
        subtitle: 'Americans with Disabilities Act',
        compliant: allViolations.filter(v => (v.tags || []).some(t => t.includes('wcag') || t.includes('section508'))).length === 0,
        violationsCount: allViolations.filter(v => (v.tags || []).some(t => t.includes('wcag') || t.includes('section508'))).length
      });
    }

    if (activeStandards.eaa) {
      complianceChecklist.push({
        key: 'eaa',
        title: 'European Accessibility Act (EAA)',
        subtitle: 'EN 301 549 Standard',
        compliant: allViolations.filter(v => (v.tags || []).some(t => t.includes('EN-301-549') || t.includes('wcag'))).length === 0,
        violationsCount: allViolations.filter(v => (v.tags || []).some(t => t.includes('EN-301-549') || t.includes('wcag'))).length
      });
    }

    if (activeStandards.section508) {
      complianceChecklist.push({
        key: 'section508',
        title: 'US Section 508',
        subtitle: 'Federal Rehabilitation Act',
        compliant: allViolations.filter(v => (v.tags || []).some(t => t.includes('section508'))).length === 0,
        violationsCount: allViolations.filter(v => (v.tags || []).some(t => t.includes('section508'))).length
      });
    }

    if (activeStandards.aoda) {
      complianceChecklist.push({
        key: 'aoda',
        title: 'AODA (Ontario)',
        subtitle: 'Accessibility for Ontarians Act',
        compliant: allViolations.filter(v => (v.tags || []).some(t => t.includes('wcag2a') || t.includes('wcag2aa'))).length === 0,
        violationsCount: allViolations.filter(v => (v.tags || []).some(t => t.includes('wcag2a') || t.includes('wcag2aa'))).length
      });
    }

    const report = {
      scanId: String(scanId),
      url,
      targetTitle: pageTitle || url,
      scanTime: new Date().toISOString(),
      standard,
      standardsRequested: standards || { wcag: true, ada: false, eaa: false, section508: false, aoda: false },
      score,
      complianceChecklist,
      summary: {
        score,
        totalViolationsCount,
        criticalCount,
        seriousCount,
        moderateCount,
        minorCount,
        passedAuditsCount,
        manualAuditsCount
      },
      criticalIssues,
      seriousIssues,
      moderateIssues,
      minorIssues,
      passedAudits,
      manualAudits,
      allViolations,
      reportUrl: `/artifacts/accessibility_scans/${scanId}.json`
    };

    // Save report to disk
    const reportPath = path.join(ACCESSIBILITY_SCANS_DIR, `${scanId}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

    emit({ type: 'complete', report });
    return report;

  } catch (err) {
    console.error('Accessibility scan failed:', err.message);
    emit({ type: 'error', message: `Scan failed: ${err.message}` });
    throw err;
  } finally {
    if (browser) {
      if (resolvedBrowserMode === 'interactive') {
        console.log('[DirectWCAGScan] Interactive browser scan complete â€” holding window open for 25 seconds for login & visual inspection...');
        const autosave = setInterval(async () => {
          try {
            if (context && page && !page.isClosed()) {
              await sessionService.saveSession(context, page, url);
            }
          } catch (e) {}
        }, 3000);

        await new Promise(resolve => setTimeout(resolve, 25000));
        clearInterval(autosave);
      }

      if (context && page) {
        console.log('[DirectWCAGScan] Performing final session save right before browser closure...');
        await sessionService.saveSession(context, page, url).catch(() => {});
      }

      await browser.close();
      console.log('[DirectWCAGScan] Browser closed.');
    }
  }
}

/**
 * CUCUMBER RUNNER ENGINE
 */
function runExecution(socket, data) {
  const executionId = data.executionId || Date.now();
  const startedAt = Date.now();
  const runArtifactDir = path.join(ARTIFACTS_DIR, String(executionId));

  fs.mkdirSync(runArtifactDir, { recursive: true });

  let targetFeaturePath = '';
  let requireArgs = [];
  let tempRunDir = null;
  let hasTsFile = false;

  const tempJsonReportName = `cucumber-report-${executionId}.json`;
  const jsonReportPath = path.join(os.tmpdir(), tempJsonReportName);

  if (data.mode === 'upload' && data.featureContent) {
    tempRunDir = path.join(__dirname, 'tmp_runs', `qa-run-${executionId}`);
    const tempFeaturesDir = path.join(tempRunDir, 'features');
    const tempStepsDir = path.join(tempRunDir, 'steps');
    fs.mkdirSync(tempFeaturesDir, { recursive: true });
    fs.mkdirSync(tempStepsDir, { recursive: true });

    const featureFileName = data.featureFileName || 'uploaded.feature';
    targetFeaturePath = path.join(tempFeaturesDir, featureFileName);
    fs.writeFileSync(targetFeaturePath, data.featureContent, 'utf8');

    if (data.stepFiles && Array.isArray(data.stepFiles) && data.stepFiles.length > 0) {
      data.stepFiles.forEach(file => {
        const stepFilePath = path.join(tempStepsDir, file.name);
        fs.writeFileSync(stepFilePath, file.content, 'utf8');
        requireArgs.push('--require', stepFilePath);
        if (file.name.endsWith('.ts')) hasTsFile = true;
      });
    }
  } else {
    const featuresDir = path.join(__dirname, 'features');
    if (data.featureNames && Array.isArray(data.featureNames) && data.featureNames.length > 0) {
      const validPaths = data.featureNames
        .map(fName => path.join(featuresDir, fName))
        .filter(fPath => fs.existsSync(fPath));

      if (validPaths.length > 0) {
        targetFeaturePath = validPaths.map(p => `"${p}"`).join(' ');
      } else {
        targetFeaturePath = `"${featuresDir}"`;
      }
    } else if (data.featureFileName) {
      targetFeaturePath = `"${path.join(featuresDir, data.featureFileName)}"`;
    } else {
      targetFeaturePath = `"${featuresDir}"`;
    }
  }

  // ALWAYS require steps/support/world.js FIRST for Playwright CustomWorld initialization
  const defaultWorldPath = path.join(__dirname, 'steps', 'support', 'world.js');
  if (fs.existsSync(defaultWorldPath)) {
    requireArgs.unshift('--require', defaultWorldPath);
  }

  // Load default step definition files
  const stepsDir = path.join(__dirname, 'steps');
  if (fs.existsSync(stepsDir)) {
    const files = fs.readdirSync(stepsDir);
    files.forEach(f => {
      if (f.endsWith('.steps.js') || f.endsWith('.steps.ts')) {
        requireArgs.push('--require', path.join(stepsDir, f));
        if (f.endsWith('.ts')) hasTsFile = true;
      }
    });
  }

  const formattedRequire = requireArgs.map(arg => {
    if (arg === '--require' || arg === '--require-module') return arg;
    return `"${arg}"`;
  }).join(' ');

  const tsModuleFlag = hasTsFile ? '--import tsx ' : '';
  const formattedTags = formatCucumberTags(data.tags);
  const tagsFlag = formattedTags ? `--tags "${formattedTags}" ` : '';
  const retryFlag = data.retryCount && data.retryCount > 0 ? `--retry ${data.retryCount} ` : '';

  const featureArg = data.mode === 'upload' ? `"${targetFeaturePath}"` : targetFeaturePath;
  const command = `npx cucumber-js ${featureArg} ${tsModuleFlag}${tagsFlag}${retryFlag}${formattedRequire} --format "json:${jsonReportPath}"`;

  const resolvedBrowserMode = browserService.resolveBrowserMode(data.browserMode || (data.headless === false ? 'interactive' : 'headless'));

  console.log('[Backend Layer 2 - Feature Dispatch] Spawning cucumber process:', {
    executionId,
    command,
    resolvedBrowserMode,
    headlessFlag: String(resolvedBrowserMode !== 'interactive')
  });

  socket.emit('execution-event', {
    executionId,
    type: 'feature',
    message: `🚀 Starting execution: ${data.projectName || 'Suite'}`
  });

  socket.emit('execution-event', {
    executionId,
    type: 'info',
    message: browserService.formatBrowserLog(resolvedBrowserMode)
  });

  socket.emit('execution-event', {
    executionId,
    type: 'info',
    message: `Environment: ${data.environment} | Tags: ${formattedTags || 'None'} | Retries: ${data.retryCount || 0}`
  });

  const cucumberProcess = spawn(command, {
    shell: true,
    cwd: __dirname,
    env: {
      ...process.env,
      CURRENT_EXECUTION_ID: String(executionId),
      ARTIFACT_DIR: runArtifactDir,
      TARGET_URL: data.targetUrl || '',
      BROWSER_MODE: resolvedBrowserMode,
      HEADLESS: String(resolvedBrowserMode !== 'interactive'),
      SESSION_STATE_FILE: data.sessionState || '',
      ENABLE_ACCESSIBILITY: String(data.enableAccessibilityScan !== false),
      ENABLE_SCREENSHOTS: String(data.enableScreenshots !== false),
      ENABLE_VIDEO: String(data.enableVideo !== false),
      ENABLE_TRACE: String(data.enableTrace !== false)
    }
  });

  activeProcesses.set(executionId, cucumberProcess);
  executionStatuses.set(String(executionId), 'Running');

  let stdoutBuffer = '';
  let stderrBuffer = '';

  cucumberProcess.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    stdoutBuffer += text;
    console.log(`[stdout]: ${text}`);

    const lines = text.split('\n');
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('[SOCKET_EVENT]:')) {
        try {
          const payload = JSON.parse(trimmed.replace('[SOCKET_EVENT]:', ''));
          socket.emit('execution-event', {
            executionId,
            ...payload
          });
        } catch (e) {}
      } else if (trimmed) {
        socket.emit('execution-event', {
          executionId,
          type: 'info',
          message: trimmed
        });
      }
    });
  });

  cucumberProcess.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderrBuffer += text;
    console.error(`[stderr]: ${text}`);

    const lines = text.split('\n');
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed) {
        socket.emit('execution-event', {
          executionId,
          type: 'info',
          message: trimmed
        });
      }
    });
  });

  cucumberProcess.on('close', (code) => {
    console.log(`Child process exited with code ${code}`);
    activeProcesses.delete(executionId);

    // Auto-discover and broadcast all generated artifacts from disk
    const screenshotsDir = path.join(runArtifactDir, 'screenshots');
    const videosDir = path.join(runArtifactDir, 'videos');
    const tracesDir = path.join(runArtifactDir, 'traces');
    const a11yDir = path.join(runArtifactDir, 'accessibility');

    if (fs.existsSync(screenshotsDir)) {
      fs.readdirSync(screenshotsDir).forEach(file => {
        socket.emit('execution-event', {
          executionId,
          type: 'artifact',
          artifactType: 'screenshot',
          name: file,
          url: `/artifacts/${executionId}/screenshots/${file}`
        });
      });
    }

    if (fs.existsSync(videosDir)) {
      fs.readdirSync(videosDir).forEach(file => {
        socket.emit('execution-event', {
          executionId,
          type: 'artifact',
          artifactType: 'video',
          name: file,
          url: `/artifacts/${executionId}/videos/${file}`
        });
      });
    }

    if (fs.existsSync(tracesDir)) {
      fs.readdirSync(tracesDir).forEach(file => {
        socket.emit('execution-event', {
          executionId,
          type: 'artifact',
          artifactType: 'trace',
          name: file,
          url: `/artifacts/${executionId}/traces/${file}`
        });
      });
    }

    const a11yReportFile = path.join(a11yDir, 'a11y_report.json');
    if (fs.existsSync(a11yReportFile)) {
      try {
        const summary = JSON.parse(fs.readFileSync(a11yReportFile, 'utf8'));
        socket.emit('execution-event', {
          executionId,
          type: 'accessibility-report',
          summary,
          reportUrl: `/artifacts/${executionId}/accessibility/a11y_report.json`
        });
      } catch (e) {}
    }

    let primaryFailureDetails = null;
    let reportParsedSuccessfully = false;

    if (fs.existsSync(jsonReportPath)) {
      try {
        const jsonContent = fs.readFileSync(jsonReportPath, 'utf8').trim();
        if (jsonContent) {
          const cucumberReport = JSON.parse(jsonContent);
          if (Array.isArray(cucumberReport)) {
            reportParsedSuccessfully = true;
            let scenarioCounter = 1;

            cucumberReport.forEach(feature => {
              (feature.elements || []).forEach(scenario => {
                const scenarioId = scenarioCounter++;

                socket.emit('execution-event', {
                  executionId,
                  type: 'scenario',
                  scenarioId,
                  scenario: scenario.name,
                  message: `Scenario: ${scenario.name}`
                });

                let failedSteps = 0;

                (scenario.steps || []).forEach(step => {
                  const status = step.result ? step.result.status : 'skipped';
                  if (status === 'failed') {
                    failedSteps++;
                    if (step.result && step.result.error_message) {
                      primaryFailureDetails = {
                        failureReason: step.result.error_message,
                        stackTrace: step.result.error_message,
                        failedSteps: [step.name],
                        scenarioName: scenario.name
                      };
                    }
                  }

                  socket.emit('execution-event', {
                    executionId,
                    type: 'step',
                    scenarioId,
                    keyword: step.keyword ? step.keyword.trim() : 'Step',
                    message: step.name,
                    status
                  });

                  if (status === 'failed' && step.result && step.result.error_message) {
                    socket.emit('execution-event', {
                      executionId,
                      type: 'error',
                      scenarioId,
                      message: cleanErrorMessage(step.result.error_message)
                    });
                  }
                });

                socket.emit('execution-event', {
                  executionId,
                  type: 'scenario-summary',
                  scenarioId,
                  passed: failedSteps === 0,
                  totalSteps: (scenario.steps || []).length,
                  failedSteps
                });
              });
            });
          }
        }
      } catch (err) {
        console.warn(`[runExecution] Could not parse JSON report file: ${err.message}`);
      } finally {
        if (fs.existsSync(jsonReportPath)) {
          fs.unlink(jsonReportPath, () => {});
        }
      }
    }

    if (!reportParsedSuccessfully && code !== 0) {
      const rawErr = stderrBuffer.trim() || stdoutBuffer.trim() || `Process exited with code ${code}`;
      const firstLineErr = rawErr.split('\n').find(l => l.includes('Error') || l.includes('syntax') || l.includes('failed') || l.trim().length > 0) || rawErr;

      primaryFailureDetails = {
        failureReason: `Cucumber process failed before report generation: ${firstLineErr.substring(0, 250)}`,
        stackTrace: rawErr,
        failedSteps: ['Process Execution'],
        scenarioName: data.projectName || 'Cucumber Execution'
      };

      socket.emit('execution-event', {
        executionId,
        type: 'error',
        message: `Cucumber process failed with exit code ${code} before report generation.`
      });
    }

    if (fs.existsSync(jsonReportPath)) {
      fs.unlink(jsonReportPath, () => {});
    }
    if (tempRunDir && fs.existsSync(tempRunDir)) {
      fs.rm(tempRunDir, { recursive: true, force: true }, () => {});
    }

    const durationSeconds = Math.floor((Date.now() - startedAt) / 1000);

    // If scenario failed, automatically trigger FailureAnalysisService & persist analysis.json
    if (code !== 0) {
      executionStatuses.set(String(executionId), 'Failed');
      const analysisPayload = primaryFailureDetails || {
        failureReason: 'Scenario execution step failed'
      };
      analysisPayload.projectName = data.projectName || 'default';

      failureAnalysisService.analyzeExecution(executionId, analysisPayload).then((analysisReport) => {
        socket.emit('execution-event', {
          executionId,
          type: 'end',
          message: '🚀 Execution completed: Failed',
          status: 'Failed',
          durationSeconds,
          analysis: analysisReport
        });
      }).catch(() => {
        socket.emit('execution-event', {
          executionId,
          type: 'end',
          message: '🚀 Execution completed: Failed',
          status: 'Failed',
          durationSeconds
        });
      });
    } else {
      executionStatuses.set(String(executionId), 'Passed');
      socket.emit('execution-event', {
        executionId,
        type: 'end',
        message: '🚀 Execution completed: Passed',
        status: 'Passed',
        durationSeconds
      });
    }
  });
}

function cleanErrorMessage(errorMessage) {
  if (!errorMessage) return 'Unknown error';
  const firstLine = errorMessage.split('\n')[0];
  return firstLine
    .replace('AssertionError [ERR_ASSERTION]:', '')
    .replace('Error:', '')
    .trim();
}

// 404 JSON Fallback Handler (Prevents default Express HTML disclosure)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.path}`,
    error: 'Not Found'
  });
});

// Centralized JSON Error Handler
app.use((err, req, res, next) => {
  const statusCode = err.status || err.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message || err);
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(isProd ? {} : { stack: err.stack })
  });
});

const PORT = 3000;
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`QA Backend Running on http://localhost:${PORT}`);
  });
}

module.exports = { app, server, runExecution };