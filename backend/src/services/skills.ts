import { db } from "../prisma/db.ts";
import { httpError } from "../utils/http-error.ts";

// A skill tag as clients send it, on lessons and on questions (the Q-matrix)
export type SkillWeight = { skillId: number; weight: number };

// Every skill id must exist; an unknown one is an input error (400), not a missing resource
export const assertSkillsExist = async (skills: SkillWeight[]) => {
  const skillIds = skills.map((skill) => skill.skillId);
  const found = await db.orm.public.Skills.where((s) => s.skillId.in(skillIds))
    .select("skillId")
    .all();

  const foundIds = new Set(found.map((skill) => skill.skillId));
  for (const skillId of skillIds) {
    if (!foundIds.has(skillId)) {
      throw httpError(400, `Unknown skill id: ${skillId}`);
    }
  }
};
