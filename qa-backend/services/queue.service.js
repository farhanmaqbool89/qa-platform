const redisService = require('./redis.service');
const dbService = require('./db.service');
const dockerRunnerService = require('./docker-runner.service');
const { getIO } = require('../support/socket');
const { formatCucumberTags } = require('./tag-formatter.service');

const QUEUE_NAME = 'test-execution-queue';
const DEFAULT_CONCURRENCY = 5;

// In-Memory Volatile Queue Fallback for Local Dev without Redis
class InMemoryExecutionQueue {
  constructor() {
    this.waiting = [];
    this.active = new Map();
    this.completed = new Map();
    this.failed = new Map();
    this.processHandles = new Map();
    this.isProcessing = false;
    this.startTime = Date.now();
  }

  async addJob(jobName, data, options = {}) {
    const jobId = data.executionId || `exec_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    const job = {
      id: jobId,
      name: jobName,
      data: { ...data, executionId: jobId },
      opts: {
        priority: options.priority || 5,
        attempts: options.attempts || 1,
        timeout: options.timeout || 300000
      },
      status: 'QUEUED',
      progress: 0,
      attemptsMade: 0,
      timestamp: Date.now()
    };

    this.waiting.push(job);
    // Sort waiting queue by priority (1 = highest priority)
    this.waiting.sort((a, b) => a.opts.priority - b.opts.priority);

    // Save initial state to DB if available
    await this.persistExecutionState(job.data, 'QUEUED');

    console.log(`[QUEUE-SERVICE] 📥 [InMemory] Enqueued Job ${jobId} (Priority: ${job.opts.priority})`);
    setImmediate(() => this.processNext());
    return job;
  }

  async processNext() {
    if (this.waiting.length === 0) return;
    const job = this.waiting.shift();
    this.active.set(job.id, job);
    job.status = 'RUNNING';

    await this.persistExecutionState(job.data, 'RUNNING');
    this.broadcastStatus(job.id, 'RUNNING', `Execution ${job.id} started...`);

    const start = Date.now();
    try {
      await this.executeCucumberJob(job);
      const durationMs = Date.now() - start;
      job.status = 'COMPLETED';
      job.durationMs = durationMs;
      this.active.delete(job.id);
      this.completed.set(job.id, job);
      await this.persistExecutionState(job.data, 'PASSED', durationMs);
      this.broadcastStatus(job.id, 'PASSED', `Execution ${job.id} completed successfully (${(durationMs/1000).toFixed(2)}s).`);
    } catch (err) {
      job.attemptsMade++;
      if (job.attemptsMade < job.opts.attempts) {
        console.warn(`[QUEUE-SERVICE] ⚠️ Job ${job.id} failed attempt ${job.attemptsMade}/${job.opts.attempts}. Retrying...`);
        job.status = 'QUEUED';
        this.active.delete(job.id);
        this.waiting.push(job);
      } else {
        const durationMs = Date.now() - start;
        job.status = 'FAILED';
        job.failedReason = err.message;
        job.durationMs = durationMs;
        this.active.delete(job.id);
        this.failed.set(job.id, job);
        await this.persistExecutionState(job.data, 'FAILED', durationMs, err.message);
        this.broadcastStatus(job.id, 'FAILED', `Execution ${job.id} failed: ${err.message}`);
      }
    }

    setImmediate(() => this.processNext());
  }

  async executeCucumberJob(job) {
    return await dockerRunnerService.runInContainer(job.data, job.opts);
  }

  async cancelJob(executionId) {
    // Kill running process or container via DockerRunnerService
    dockerRunnerService.killContainer(executionId);

    const activeJob = this.active.get(executionId);
    if (activeJob) {
      activeJob.status = 'CANCELLED';
      this.active.delete(executionId);
      this.failed.set(executionId, activeJob);
      await this.persistExecutionState(activeJob.data, 'CANCELLED', 0, 'Cancelled by user');
      this.broadcastStatus(executionId, 'CANCELLED', `Execution ${executionId} cancelled.`);
      return true;
    }

    const waitingIdx = this.waiting.findIndex(j => j.id === executionId);
    if (waitingIdx !== -1) {
      const job = this.waiting.splice(waitingIdx, 1)[0];
      job.status = 'CANCELLED';
      this.failed.set(executionId, job);
      await this.persistExecutionState(job.data, 'CANCELLED', 0, 'Cancelled by user');
      this.broadcastStatus(executionId, 'CANCELLED', `Execution ${executionId} cancelled.`);
      return true;
    }

    return false;
  }

  async getMetrics() {
    return {
      waiting: this.waiting.length,
      active: this.active.size,
      completed: this.completed.size,
      failed: this.failed.size,
      total: this.waiting.length + this.active.size + this.completed.size + this.failed.size
    };
  }

  async getWorkerHealth() {
    return {
      status: 'UP',
      mode: 'InMemoryFallbackQueue',
      concurrency: DEFAULT_CONCURRENCY,
      activeJobs: this.active.size,
      waitingJobs: this.waiting.length,
      completedJobs: this.completed.size,
      failedJobs: this.failed.size,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000)
    };
  }

  broadcastStatus(executionId, status, message) {
    const io = getIO();
    if (io) {
      io.emit('execution-status-update', {
        executionId,
        status,
        message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async persistExecutionState(jobData, status, durationMs = 0, errorMessage = null) {
    const { executionId, organizationId = 'default-org-id', projectId = 'customerportal', feature = 'all', tags = '@smoke', environment = 'QA', browserMode = 'headless', commitSha, branch } = jobData;

    if (dbService.isDbConnected && dbService.prisma) {
      try {
        const proj = await dbService.prisma.project.findFirst({
          where: { organizationId, OR: [{ legacyId: Number(projectId) }, { id: String(projectId) }] }
        });
        const targetProjId = proj ? proj.id : (await dbService.prisma.project.findFirst({ where: { organizationId } }))?.id;

        if (targetProjId) {
          await dbService.prisma.testExecution.upsert({
            where: { id: executionId },
            update: {
              status,
              durationMs,
              errorMessage,
              updatedAt: new Date()
            },
            create: {
              id: executionId,
              organizationId,
              projectId: targetProjId,
              featureName: feature,
              tags,
              browser: 'Chromium',
              browserMode,
              status,
              durationMs,
              errorMessage,
              commitSha,
              branch
            }
          });
        }
      } catch (e) {
        console.error('[QUEUE-SERVICE] Failed to persist execution state to DB:', e.message);
      }
    }
  }
}

class QueueService {
  constructor() {
    this.queue = null;
    this.worker = null;
    this.inMemoryQueue = new InMemoryExecutionQueue();
    this.init();
  }

  init() {
    if (redisService.isConnected) {
      try {
        const connection = redisService.getConnectionOptions();
        this.queue = new Queue(QUEUE_NAME, { connection });
        console.log('[QUEUE-SERVICE] 🚀 Initialized BullMQ Queue:', QUEUE_NAME);

        this.worker = new Worker(QUEUE_NAME, async (job) => {
          return await this.inMemoryQueue.executeCucumberJob(job);
        }, {
          connection,
          concurrency: DEFAULT_CONCURRENCY
        });

        this.worker.on('completed', async (job) => {
          console.log(`[QUEUE-SERVICE] ✅ BullMQ Job ${job.id} completed.`);
          await this.inMemoryQueue.persistExecutionState(job.data, 'PASSED');
        });

        this.worker.on('failed', async (job, err) => {
          console.error(`[QUEUE-SERVICE] ❌ BullMQ Job ${job?.id} failed:`, err.message);
          if (job) await this.inMemoryQueue.persistExecutionState(job.data, 'FAILED', 0, err.message);
        });

      } catch (e) {
        console.warn('[QUEUE-SERVICE] ⚠️ Failed to initialize BullMQ worker:', e.message);
      }
    }
  }

  async enqueue(jobData, options = {}) {
    if (this.queue && redisService.isConnected) {
      try {
        const jobId = jobData.executionId || `exec_${Date.now()}_${Math.floor(Math.random()*1000)}`;
        const bullJob = await this.queue.add('run-test', { ...jobData, executionId: jobId }, {
          jobId,
          priority: options.priority || 5,
          attempts: options.retries || 1,
          backoff: { type: 'exponential', delay: 1000 },
          timeout: options.timeout || 300000,
          removeOnComplete: 100,
          removeOnFail: 200
        });

        console.log(`[QUEUE-SERVICE] 📥 [BullMQ] Enqueued Job ${jobId}`);
        return { id: jobId, status: 'QUEUED', mode: 'BullMQ' };
      } catch (e) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error(`[QUEUE-SERVICE] 🚨 Production Error: BullMQ enqueue failed: ${e.message}`);
        }
        console.warn('[QUEUE-SERVICE] BullMQ add failed, routing to in-memory queue:', e.message);
      }
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('[QUEUE-SERVICE] 🚨 Production Error: Redis/BullMQ queue is required in production mode. In-memory queue fallback disabled.');
    }

    // Fallback to in-memory execution queue in dev/test mode
    return await this.inMemoryQueue.addJob('run-test', jobData, options);
  }

  async cancelExecution(executionId) {
    if (this.queue && redisService.isConnected) {
      try {
        const job = await this.queue.getJob(executionId);
        if (job) {
          await job.remove();
          return true;
        }
      } catch (e) {}
    }
    return await this.inMemoryQueue.cancelJob(executionId);
  }

  async getMetrics() {
    if (this.queue && redisService.isConnected) {
      try {
        const counts = await this.queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
        return {
          waiting: counts.waiting,
          active: counts.active,
          completed: counts.completed,
          failed: counts.failed,
          total: counts.waiting + counts.active + counts.completed + counts.failed
        };
      } catch (e) {}
    }
    return await this.inMemoryQueue.getMetrics();
  }

  async getWorkerHealth() {
    if (this.worker && redisService.isConnected) {
      const metrics = await this.getMetrics();
      return {
        status: 'UP',
        mode: 'BullMQ',
        concurrency: DEFAULT_CONCURRENCY,
        activeJobs: metrics.active,
        waitingJobs: metrics.waiting,
        completedJobs: metrics.completed,
        failedJobs: metrics.failed,
        uptimeSeconds: Math.floor(process.uptime())
      };
    }
    return await this.inMemoryQueue.getWorkerHealth();
  }
}

module.exports = new QueueService();
