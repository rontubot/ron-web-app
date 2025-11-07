// public/taskManager.js



// Generador simple de IDs únicos sin dependencia externa
function generateId() {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
}

/**
 * Task Manager local (solo vive en la sesión actual).
 * En pasos posteriores podemos persistirlo en un JSON en appData.
 */
class TaskManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.tasks = new Map();
  }

  createTask({ kind, description, params = {}, source = "local" }) {
    const id = generateId();
    const now = new Date().toISOString();
    const task = {
      id,
      user: "default",
      kind,
      description,
      source,
      status: "queued",
      progress: 0,
      params,
      result_summary: null,
      error: null,
      created_at: now,
      updated_at: now,
    };
    this.tasks.set(id, task);
    this._notify(task);
    return task;
  }

  updateTask(id, patch) {
    const t = this.tasks.get(id);
    if (!t) return null;
    Object.assign(t, patch, { updated_at: new Date().toISOString() });
    this.tasks.set(id, t);
    this._notify(t);
    return t;
  }

  getTasks() {
    return Array.from(this.tasks.values());
  }

  getTask(id) {
    return this.tasks.get(id);
  }

  // 👇 borrar una tarea puntual
  deleteTask(id) {
    const t = this.tasks.get(id);
    if (!t) return false;
    this.tasks.delete(id);
    if (this.mainWindow) {
      this.mainWindow.webContents.send("tasks:updated", {
        id,
        deleted: true,
      });
    }
    return true;
  }

  // 👇 limpiar tareas completadas (puedes extender a failed/cancelled si quieres)
  clearCompleted() {
    let removed = 0;
    for (const [id, task] of this.tasks.entries()) {
      if (task.status === "completed") {
        this.tasks.delete(id);
        if (this.mainWindow) {
          this.mainWindow.webContents.send("tasks:updated", {
            id,
            deleted: true,
          });
        }
        removed++;
      }
    }
    return removed;
  }

  _notify(task) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send("tasks:updated", task);
    }
  }
}

module.exports = { TaskManager };
