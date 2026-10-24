import type { Request, Response } from "express";
import { db } from "../prisma/db.ts";

const Skills = db.orm.public.Skills;

type SkillCategory = "listening" | "reading" | "writing" | "speaking";

// The read-only skill taxonomy, optionally filtered by category
const listSkills = async (req: Request, res: Response) => {
  const { category }: { category?: SkillCategory } = req.value!.query;

  const rows = category
    ? await Skills.where({ category })
        .orderBy((s) => s.skillId.asc())
        .all()
    : await Skills.orderBy((s) => s.skillId.asc()).all();

  const skills = [];
  for (const row of rows) {
    skills.push({
      skillId: row.skillId,
      skillCode: row.skillCode,
      name: row.name,
      category: row.category,
      description: row.description,
    });
  }

  return res.status(200).json({
    skills,
    message: "Skills",
  });
};

export default {
  listSkills,
};
