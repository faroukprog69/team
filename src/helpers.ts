import { ServiceResult } from "./types";
import { and, eq } from "drizzle-orm";
import { customAlphabet } from "nanoid";

const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 6);

export function generateTeamSlug(name: string) {
  const base = slugify(name);
  return `${base}-${nanoid()}`;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

/**
 * تجلب بيانات العضوية مع بيانات الفريق الأساسية في استعلام واحد
 * هذا يقلل من استدعاءات قاعدة البيانات لاحقاً للتحقق من الـ Primary Owner
 */
export async function getMembershipWithTeam(
  tx: any,
  teamId: string,
  userId: string,
  teamMember: any,
) {
  const result = await tx.query.teamMember.findFirst({
    where: and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)),
    with: {
      team: true, // عمل Join تلقائي مع جدول الفريق
    },
  });
  return result;
}

export async function handleQuery<T>(
  fn: () => Promise<T>,
): Promise<ServiceResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err: any) {
    console.error(err);
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Query failed" },
    };
  }
}
