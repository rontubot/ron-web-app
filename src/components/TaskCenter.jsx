// src/components/TaskCenter.jsx
import React, { useEffect, useState } from "react";

export const TaskCenter = ({ open, onClose }) => {
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    if (!open) return;
    const api = window.electronAPI;
    if (!api) return;

    const load = async () => {
      try {
        const list = (await api.listTasks?.()) || [];
        setTasks(list);
      } catch (e) {
        console.error("Error cargando tareas:", e);
      }
    };

    load();

    const unsubscribe = api.onTaskUpdated?.((task) => {
      setTasks((prev) => {
        if (task.deleted) {
          return prev.filter((t) => t.id !== task.id);
        }
        const idx = prev.findIndex((t) => t.id === task.id);
        if (idx === -1) return [...prev, task];
        const next = [...prev];
        next[idx] = task;
        return next;
      });
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [open]);

  if (!open) return null;

  const handleClearCompleted = async () => {
    const api = window.electronAPI;
    if (!api?.clearCompletedTasks) return;
    const ok = window.confirm("¿Eliminar todas las tareas completadas?");
    if (!ok) return;
    try {
      await api.clearCompletedTasks();
    } catch (e) {
      console.error("Error limpiando tareas:", e);
    }
  };

  const handleDelete = async (id) => {
    const api = window.electronAPI;
    if (!api?.deleteTask) return;
    const ok = window.confirm("¿Eliminar esta tarea de la lista?");
    if (!ok) return;
    try {
      await api.deleteTask(id);
    } catch (e) {
      console.error("Error eliminando tarea:", e);
    }
  };

  const handleCancel = async (id) => {
    const api = window.electronAPI;
    if (!api?.cancelTask) return;
    const ok = window.confirm("¿Cancelar esta actividad?");
    if (!ok) return;
    try {
      await api.cancelTask(id);
    } catch (e) {
      console.error("Error cancelando tarea:", e);
    }
  };

  const sorted = [...tasks].sort((a, b) =>
    (a.created_at || "").localeCompare(b.created_at || "")
  );

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        width: 360,
        maxHeight: "60vh",
        background: "#111",
        color: "#f5f5f5",
        borderRadius: 10,
        boxShadow: "0 10px 25px rgba(0,0,0,0.35)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        zIndex: 50,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(0,0,0,0.85)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>📁</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            Tareas en segundo plano
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            title="Limpiar tareas completadas"
            onClick={handleClearCompleted}
            style={{
              border: "none",
              background: "transparent",
              color: "#ccc",
              cursor: "pointer",
              padding: 2,
              fontSize: 14,
            }}
          >
            🗑️
          </button>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              color: "#ccc",
              cursor: "pointer",
              padding: 2,
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          padding: 8,
          overflowY: "auto",
        }}
      >
        {sorted.length === 0 ? (
          <div style={{ fontSize: 12, color: "#aaa", padding: 8 }}>
            No hay tareas activas por ahora.
          </div>
        ) : (
          sorted.map((task) => {
            const isFinished = ["completed", "failed", "cancelled"].includes(
              task.status
            );
            const canCancel =
              !isFinished &&
              (task.status === "running" || task.status === "queued");

            return (
              <div
                key={task.id}
                style={{
                  position: "relative",
                  background: "#181818",
                  borderRadius: 8,
                  padding: "8px 8px 10px 8px",
                  marginBottom: 8,
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {/* ❌ para borrar solo esta tarea */}
                <button
                  onClick={() => handleDelete(task.id)}
                  title="Eliminar tarea de la lista"
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    border: "none",
                    background: "transparent",
                    color: "#777",
                    cursor: "pointer",
                    fontSize: 11,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>

                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  {task.description || task.kind}
                </div>

                <div
                  style={{
                    fontSize: 11,
                    color: "#bbb",
                    marginBottom: 4,
                  }}
                >
                  Estado: {task.status}
                  {typeof task.progress === "number" && (
                    <> · {Math.round(task.progress)}%</>
                  )}
                </div>

                {task.result_summary && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "#ddd",
                      marginBottom: 4,
                    }}
                  >
                    {task.result_summary}
                  </div>
                )}

                {task.error && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "#ffb3b3",
                      marginBottom: 4,
                    }}
                  >
                    {String(task.error)}
                  </div>
                )}

                {typeof task.progress === "number" && (
                  <div
                    style={{
                      height: 3,
                      borderRadius: 999,
                      background: "#333",
                      overflow: "hidden",
                      marginBottom: canCancel ? 6 : 0,
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(100, task.progress)
                        )}%`,
                        height: "100%",
                        background: isFinished ? "#2ecc71" : "#3498db",
                      }}
                    />
                  </div>
                )}

                {canCancel && (
                  <button
                    onClick={() => handleCancel(task.id)}
                    style={{
                      marginTop: 2,
                      border: "none",
                      background: "#b23b3b",
                      color: "#fff",
                      borderRadius: 999,
                      fontSize: 11,
                      padding: "3px 10px",
                      cursor: "pointer",
                    }}
                  >
                    Cancelar tarea
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
