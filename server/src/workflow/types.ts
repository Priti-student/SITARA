// ───────────────────────────────────────────────────────────────
// Workflow route types (Phase 5)
// ApprovalType.workflow = WorkflowRoute (JSON)
// ───────────────────────────────────────────────────────────────

export interface WorkflowStep {
  order: number;
  role: string;   // DEPARTMENT_USER | APPROVING_AUTHORITY
  slaHours: number;
  label: string;
}

export interface WorkflowTrack {
  dept: string; // department code
  steps: WorkflowStep[];
}

export type WorkflowRoute = WorkflowTrack[];

/** Sanitises an unknown JSON route into a WorkflowRoute. */
export function parseRoute(value: unknown): WorkflowRoute {
  if (!Array.isArray(value)) return [];
  const tracks: WorkflowTrack[] = [];
  for (const track of value) {
    if (!track || typeof track !== "object") continue;
    const t = track as { dept?: unknown; steps?: unknown };
    if (typeof t.dept !== "string") continue;
    const steps: WorkflowStep[] = [];
    if (Array.isArray(t.steps)) {
      for (const s of t.steps) {
        const st = s as { order?: unknown; role?: unknown; slaHours?: unknown; label?: unknown };
        if (typeof st.order !== "number" || typeof st.role !== "string") continue;
        steps.push({
          order: st.order,
          role: st.role,
          slaHours: typeof st.slaHours === "number" ? st.slaHours : 48,
          label: typeof st.label === "string" ? st.label : "Scrutiny",
        });
      }
      steps.sort((a, b) => (a.order as number) - (b.order as number));
    }
    if (steps.length > 0) tracks.push({ dept: t.dept, steps });
  }
  return tracks;
}

/** Finds the step after the given order within a track. */
export function nextStep(
  track: WorkflowTrack | undefined,
  currentOrder: number | null
): WorkflowStep | null {
  if (!track) return null;
  const sorted = [...track.steps].sort((a, b) => a.order - b.order);
  if (currentOrder === null) return sorted[0] ?? null;
  const idx = sorted.findIndex((s) => s.order === currentOrder);
  return idx >= 0 && idx + 1 < sorted.length ? sorted[idx + 1] : null;
}

export function trackForDept(route: WorkflowRoute, deptCode: string): WorkflowTrack | undefined {
  return route.find((t) => t.dept === deptCode);
}