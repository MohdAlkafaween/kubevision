import { prisma } from "@/lib/db";

export async function logAudit(action: string, resource: string, detail?: string, cluster?: string) {
  try {
    await prisma.auditLog.create({
      data: { action, resource, detail: detail || "", cluster: cluster || "" },
    });
  } catch {
    // don't let audit failures break operations
  }
}
