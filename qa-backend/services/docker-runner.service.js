const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { getIO } = require('../support/socket');
const { formatCucumberTags } = require('./tag-formatter.service');

class DockerRunnerService {
  constructor() {
    this.isDockerAvailable = this.checkDockerAvailability();
    this.activeContainers = new Map();
  }

  checkDockerAvailability() {
    try {
      execSync('docker info', { stdio: 'ignore', timeout: 3000 });
      console.log('[DOCKER-RUNNER] ✅ Docker daemon available & active.');
      return true;
    } catch (e) {
      console.warn('[DOCKER-RUNNER] ℹ️ Docker daemon not available or not running. Using process sandbox runner fallback.');
      return false;
    }
  }

  async runInContainer(jobData, options = {}) {
    const {
      executionId,
      feature = 'all',
      tags = '@smoke',
      environment = 'QA',
      browserMode = 'headless',
      projectId = 'customerportal'
    } = jobData;

    const timeoutMs = options.timeout || 300000;
    const containerName = `qa-runner-${executionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    const projectDir = path.resolve(__dirname, '..');
    const featuresDir = path.resolve(projectDir, 'features');

    let targetFeaturePath = '';
    if (feature && feature !== 'all') {
      targetFeaturePath = feature.endsWith('.feature') ? path.resolve(featuresDir, feature) : path.resolve(featuresDir, `${feature}.feature`);
      if (!fs.existsSync(targetFeaturePath)) {
        targetFeaturePath = path.resolve(featuresDir, feature);
      }
    } else {
      targetFeaturePath = featuresDir;
    }

    const formattedTagsArg = formatCucumberTags(tags);
    const resolvedMode = (browserMode === 'headed' || browserMode === 'interactive') ? 'interactive' : 'headless';
    const isHeadless = resolvedMode !== 'interactive';

    const sendLog = (text, type = 'stdout') => {
      const io = getIO();
      if (io) {
        io.emit('log-event', {
          executionId,
          timestamp: new Date().toISOString(),
          text,
          type
        });
      }
    };

    if (this.isDockerAvailable) {
      sendLog(`[DOCKER-RUNNER] 🐳 Spawning ephemeral Docker container: ${containerName}`);
      sendLog(`[DOCKER-RUNNER] 🔒 Enforcing resource limits: 2.0 CPUs, 2GB Memory, 100 PIDs limit`);

      const dockerArgs = [
        'run', '--rm',
        '--name', containerName,
        '--cpus=2.0',
        '--memory=2g',
        '--pids-limit=100',
        '-v', `"${projectDir}:/workspace"`,
        '-w', '/workspace',
        '-e', `EXECUTION_ID=${executionId}`,
        '-e', `BROWSER_MODE=${resolvedMode}`,
        '-e', `HEADLESS=${String(isHeadless)}`,
        'mcr.microsoft.com/playwright:v1.41.2-jammy',
        'npx', 'cucumber-js', `"${targetFeaturePath}"`,
        formattedTagsArg ? `--tags "${formattedTagsArg}"` : '',
        '--require', '"/workspace/steps/support/world.js"',
        '--require', '"/workspace/steps/*.js"',
        '--format', `json:/workspace/artifacts/${executionId}-report.json`
      ].filter(Boolean);

      return new Promise((resolve, reject) => {
        let timeoutTimer = null;
        const child = spawn('docker', dockerArgs, { shell: true });
        this.activeContainers.set(executionId, { child, containerName });

        if (timeoutMs) {
          timeoutTimer = setTimeout(() => {
            sendLog(`[DOCKER-RUNNER] ⏱️ Execution timed out after ${timeoutMs}ms. Terminating container...`, 'stderr');
            this.killContainer(executionId);
            reject(new Error(`Container execution timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        }

        child.stdout.on('data', (d) => sendLog(d.toString().trim(), 'stdout'));
        child.stderr.on('data', (d) => sendLog(d.toString().trim(), 'stderr'));

        child.on('close', (code) => {
          if (timeoutTimer) clearTimeout(timeoutTimer);
          this.activeContainers.delete(executionId);
          this.ensureContainerCleanup(containerName);

          if (code === 0 || code === 1) {
            resolve({ exitCode: code, containerName });
          } else {
            reject(new Error(`Docker container exited with code ${code}`));
          }
        });

        child.on('error', (err) => {
          if (timeoutTimer) clearTimeout(timeoutTimer);
          this.activeContainers.delete(executionId);
          this.ensureContainerCleanup(containerName);
          reject(err);
        });
      });
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('[DOCKER-RUNNER] 🚨 Production Error: Docker execution container is required in production mode. Process sandbox fallback on host disabled.');
    }

    // Process Sandbox Fallback Mode (with Process Handle tracking & timeout)
    sendLog(`[SANDBOX-RUNNER] 🚀 Executing job ${executionId} in process sandbox...`);
    const reportPath = path.join(os.tmpdir(), `cucumber-report-${executionId}.json`);

    const stepFiles = fs.existsSync(path.join(projectDir, 'steps'))
      ? fs.readdirSync(path.join(projectDir, 'steps')).filter(f => f.endsWith('.js')).map(f => path.join(projectDir, 'steps', f))
      : [];

    const cucumberArgs = [
      'cucumber-js',
      `"${targetFeaturePath}"`,
      formattedTagsArg ? `--tags "${formattedTagsArg}"` : '',
      '--require', `"${path.join(projectDir, 'steps', 'support', 'world.js')}"`,
      ...stepFiles.map(file => `--require "${file}"`),
      '--format', `"${`json:${reportPath}`}"`
    ].filter(Boolean);

    return new Promise((resolve, reject) => {
      let timeoutTimer = null;
      const child = spawn('npx', cucumberArgs, {
        cwd: projectDir,
        shell: true,
        env: {
          ...process.env,
          EXECUTION_ID: executionId,
          BROWSER_MODE: resolvedMode,
          HEADLESS: String(isHeadless)
        }
      });

      this.activeContainers.set(executionId, { child, containerName: null });

      if (timeoutMs) {
        timeoutTimer = setTimeout(() => {
          sendLog(`[SANDBOX-RUNNER] ⏱️ Execution timed out after ${timeoutMs}ms. Killing process...`, 'stderr');
          this.killContainer(executionId);
          reject(new Error(`Sandbox execution timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }

      child.stdout.on('data', (data) => sendLog(data.toString().trim(), 'stdout'));
      child.stderr.on('data', (data) => sendLog(data.toString().trim(), 'stderr'));

      child.on('close', (code) => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        this.activeContainers.delete(executionId);
        if (code === 0 || code === 1) {
          resolve({ exitCode: code, reportPath });
        } else {
          reject(new Error(`Sandbox worker exited with code ${code}`));
        }
      });

      child.on('error', (err) => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        this.activeContainers.delete(executionId);
        reject(err);
      });
    });
  }

  killContainer(executionId) {
    const handleObj = this.activeContainers.get(executionId);
    if (handleObj) {
      const { child, containerName } = handleObj;

      if (containerName && this.isDockerAvailable) {
        try {
          execSync(`docker stop -t 2 ${containerName}`, { stdio: 'ignore' });
        } catch (e) {}
        this.ensureContainerCleanup(containerName);
      }

      if (child && !child.killed) {
        try { child.kill('SIGTERM'); } catch (e) {}
        try { child.kill('SIGKILL'); } catch (e) {}
      }

      this.activeContainers.delete(executionId);
      return true;
    }
    return false;
  }

  ensureContainerCleanup(containerName) {
    if (this.isDockerAvailable && containerName) {
      try {
        execSync(`docker rm -f ${containerName}`, { stdio: 'ignore' });
      } catch (e) {}
    }
  }

  getActiveContainersCount() {
    return this.activeContainers.size;
  }
}

module.exports = new DockerRunnerService();
