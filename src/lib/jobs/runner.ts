import "server-only";
import {
  findJobByIdempotencyKey,
  insertJob,
  isUniqueViolation,
  updateJob,
  type JobRow,
} from "@/lib/jobs/repository";

/**
 * Idempotent job runner.
 *
 * Every expensive mutation route runs its work through runIdempotentJob with
 * a deterministic idempotency key so that:
 * - repeating a completed request is a no-op (the stored job is returned);
 * - firing a request while an identical one is in flight is rejected
 *   (JobAlreadyRunningError → routes map it to the JOB_RUNNING error code);
 * - a previously failed job can be retried under the same key.
 */

export class JobAlreadyRunningError extends Error {
  readonly job: JobRow;

  constructor(job: JobRow) {
    super(
      `A "${job.job_type}" job for this entity is already ${job.status} ` +
        `(job ${job.id}). Wait for it to finish before retrying.`,
    );
    this.name = "JobAlreadyRunningError";
    this.job = job;
  }
}

export interface RunIdempotentJobOptions {
  jobType: string;
  entityType: string;
  entityId: string | null;
  idempotencyKey: string;
}

export interface JobRunResult<T> {
  job: JobRow;
  /** Null when an already-complete job was reused. */
  result: T | null;
  /** True when an existing complete job was reused and fn did not run. */
  reused: boolean;
}

/** Convenience for long jobs: update progress (0–100), ignoring failures. */
export async function setJobProgress(jobId: string, progress: number): Promise<void> {
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));
  try {
    await updateJob(jobId, { progress: clamped });
  } catch (error) {
    console.error(`[jobs] failed to update progress for job ${jobId}`, error);
  }
}

export async function runIdempotentJob<T>(
  options: RunIdempotentJobOptions,
  fn: (job: JobRow) => Promise<T>,
): Promise<JobRunResult<T>> {
  const existing = await findJobByIdempotencyKey(options.idempotencyKey);

  if (existing) {
    if (existing.status === "complete") {
      // Reuse the completed job as the idempotent result marker.
      return { job: existing, result: null, reused: true };
    }
    if (existing.status === "running" || existing.status === "queued") {
      throw new JobAlreadyRunningError(existing);
    }
    // status === "failed" → retry under the same key below.
  }

  let job: JobRow;
  if (existing) {
    job = await updateJob(existing.id, {
      status: "queued",
      progress: 0,
      error_message: null,
      completed_at: null,
    });
  } else {
    try {
      job = await insertJob({
        job_type: options.jobType,
        entity_type: options.entityType,
        entity_id: options.entityId,
        idempotency_key: options.idempotencyKey,
        status: "queued",
        progress: 0,
        attempt_count: 0,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Lost a race with a concurrent identical request.
        const raced = await findJobByIdempotencyKey(options.idempotencyKey);
        if (raced?.status === "complete") {
          return { job: raced, result: null, reused: true };
        }
        if (raced) throw new JobAlreadyRunningError(raced);
      }
      throw error;
    }
  }

  job = await updateJob(job.id, {
    status: "running",
    started_at: new Date().toISOString(),
  });

  try {
    const result = await fn(job);
    job = await updateJob(job.id, {
      status: "complete",
      progress: 100,
      error_message: null,
      completed_at: new Date().toISOString(),
    });
    return { job, result, reused: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await updateJob(job.id, {
        status: "failed",
        error_message: message.slice(0, 1_000),
        attempt_count: job.attempt_count + 1,
        completed_at: new Date().toISOString(),
      });
    } catch (updateError) {
      console.error(`[jobs] failed to mark job ${job.id} as failed`, updateError);
    }
    throw error;
  }
}
