// src/types/tasks.js

/**
 * Estados posibles de una tarea de Ron.
 *
 * Mantener estos valores sincronizados con core/tasks.py::TaskStatus
 * en el servidor.
 */
export const TaskStatus = {
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

/**
 * @typedef {Object} RonTaskJson
 * @property {string} id
 * @property {string} user
 * @property {string} kind
 * @property {string} description
 * @property {"local" | "server"} source
 * @property {"queued" | "running" | "completed" | "failed" | "cancelled"} status
 * @property {number} progress               0-100
 * @property {Object<string, any>} params
 * @property {string | null} result_summary
 * @property {string | null} error
 * @property {string} created_at             ISO 8601 (UTC)
 * @property {string} updated_at             ISO 8601 (UTC)
 */

/**
 * Normaliza un payload plano que venga del backend (o de Electron)
 * a un objeto tarea que podamos usar en React sin miedo a valores raros.
 *
 * @param {Partial<RonTaskJson>} raw
 * @returns {RonTaskJson}
 */
export function normalizeTask(raw = {}) {
  const safeStatusValues = new Set(Object.values(TaskStatus));

  const status =
    typeof raw.status === "string" && safeStatusValues.has(raw.status)
      ? raw.status
      : TaskStatus.QUEUED;

  const progress =
    typeof raw.progress === "number" && Number.isFinite(raw.progress)
      ? Math.min(100, Math.max(0, Math.round(raw.progress)))
      : 0;

  return {
    id: String(raw.id || ""),
    user: String(raw.user || "default"),
    kind: String(raw.kind || "generic"),
    description: String(raw.description || ""),

    source: raw.source === "server" ? "server" : "local",

    status,
    progress,

    params: (raw.params && typeof raw.params === "object") ? raw.params : {},

    result_summary:
      typeof raw.result_summary === "string" ? raw.result_summary : null,
    error: typeof raw.error === "string" ? raw.error : null,

    created_at:
      typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    updated_at:
      typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString(),
  };
}

/**
 * Convierte una lista de tareas “raw” a una lista normalizada.
 *
 * @param {Array<Partial<RonTaskJson>>} list
 * @returns {RonTaskJson[]}
 */
export function normalizeTaskList(list = []) {
  return Array.isArray(list) ? list.map(normalizeTask) : [];
}
