// server/services/forecastTracker.js

class ForecastTracker {
  constructor() {
    this.jobs = {};
  }

  startJob(userId, total) {
    this.jobs[userId] = {
      status: 'generating',
      index: 0,
      total: total,
      product: '',
      method: '',
      startTime: Date.now(),
      elapsedTime: 0,
      estimatedRemainingTime: 0,
      error: null,
      result: null,
    };
  }

  updateProgress(userId, index, total, product, method) {
    const job = this.jobs[userId];
    if (!job) return;

    job.index = index;
    job.total = total; // in case total is adjusted
    job.product = product;
    job.method = method;
    job.elapsedTime = Date.now() - job.startTime;

    if (index > 0) {
      const avgTimePerProduct = job.elapsedTime / index;
      const remainingProducts = total - index;
      job.estimatedRemainingTime = Math.max(0, Math.round(remainingProducts * avgTimePerProduct));
    } else {
      job.estimatedRemainingTime = 0;
    }
  }

  completeJob(userId, result) {
    const job = this.jobs[userId];
    if (!job) return;

    job.status = 'complete';
    job.index = job.total;
    job.elapsedTime = Date.now() - job.startTime;
    job.estimatedRemainingTime = 0;
    job.result = result;
  }

  failJob(userId, error) {
    const job = this.jobs[userId];
    if (!job) return;

    job.status = 'failed';
    job.elapsedTime = Date.now() - job.startTime;
    job.estimatedRemainingTime = 0;
    job.error = error;
  }

  getJob(userId) {
    const job = this.jobs[userId];
    if (!job) return { status: 'idle' };

    if (job.status === 'generating') {
      job.elapsedTime = Date.now() - job.startTime;
      if (job.index > 0) {
        const avgTimePerProduct = job.elapsedTime / job.index;
        const remainingProducts = job.total - job.index;
        job.estimatedRemainingTime = Math.max(0, Math.round(remainingProducts * avgTimePerProduct));
      }
    }
    return job;
  }

  clearJob(userId) {
    delete this.jobs[userId];
  }
}

module.exports = new ForecastTracker();
