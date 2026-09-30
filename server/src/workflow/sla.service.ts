// ───────────────────────────────────────────────────────────────
// SLA engine (Phase 5) — overdue detection + auto-escalation.
// ───────────────────────────────────────────────────────────────
import { prisma } from "../utils/prisma.js";
import { notifyStateAdmins, recordEvent } from "./runtime.service.js";

/** Finds ACTIVE instances past their SLA, flags + escalates them. */
export async function runSlaPass(): Promise<{ checked: number; overdue: number }> {
  const now = new Date();
  const overdueItems = await prisma.workflowInstance.findMany({
    where: {
      status: "ACTIVE",
      slaDueAt: { not: null, lt: now },
    },
    include: {
      department: { select: { code: true, name: true } },
      application: { select: { applicationNo: true } },
    },
    take: 200,
  });

  for (const item of overdueItems) {
    const already = await prisma.workflowEvent.count({
      where: { workflowInstanceId: item.id, eventType: { in: ["SLA_BREACH", "AUTO_ESCALATED"] } },
    });
    if (already > 0) continue;

    await prisma.workflowInstance.update({
      where: { id: item.id },
      data: { escalatedAt: now, updatedAt: now },
    });
    await recordEvent({
      applicationId: item.applicationId,
      workflowInstanceId: item.id,
      eventType: "AUTO_ESCALATED",
      fromStatus: "ACTIVE",
      toStatus: "ACTIVE",
      comment: `SLA breach at ${item.department.name}: ${item.currentStepLabel ?? "current step"}`,
      metadata: { slaDueAt: item.slaDueAt },
    });
    await notifyStateAdmins(
      "SLA breach — auto-escalated",
      `${item.application.applicationNo} exceeded its SLA at ${item.department.name} (${item.currentStepLabel ?? "step"}).`,
      { applicationId: item.applicationId, instanceId: item.id }
    );
  }

  return { checked: overdueItems.length, overdue: overdueItems.length };
}