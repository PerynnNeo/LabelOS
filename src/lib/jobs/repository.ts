/**
 * Job persistence — thin re-export of the job repository functions so job
 * infrastructure lives under src/lib/jobs/* (structure parity with the spec).
 * The implementations are in src/lib/supabase/repositories.ts, which is
 * server-only.
 */
export {
  insertJob,
  findJobByIdempotencyKey,
  updateJob,
  listRecentJobs,
  isUniqueViolation,
  RepositoryError,
  type JobRow,
  type JobInsert,
  type JobPatch,
} from "@/lib/supabase/repositories";
