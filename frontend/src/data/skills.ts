import type { Skill } from "@/lib/types";

// Micro-skill taxonomy (proposal §2 "Micro-Skill Tagging").
export const SKILLS: Skill[] = [
  // Listening
  { id: "L.SPELL", code: "L.SPELL", category: "listening", name: "Spelling, numbers & dates", description: "Catch names, numbers and dates spelled or said once." },
  { id: "L.FORM", code: "L.FORM", category: "listening", name: "Form & note completion", description: "Predict the type of word and fill forms in Section 1.", prerequisites: ["L.SPELL"] },
  { id: "L.MAP", code: "L.MAP", category: "listening", name: "Map & plan labelling", description: "Follow directions and locate places on a plan.", prerequisites: ["L.SPELL"] },
  { id: "L.MCQ", code: "L.MCQ", category: "listening", name: "Multiple choice & distractors", description: "Reject options that are mentioned but then corrected.", prerequisites: ["L.FORM"] },
  { id: "L.MATCH", code: "L.MATCH", category: "listening", name: "Matching & classification", description: "Match speakers' opinions or features to a list.", prerequisites: ["L.MCQ"] },
  { id: "L.LECT", code: "L.LECT", category: "listening", name: "Lecture note completion", description: "Follow an academic monologue and complete notes.", prerequisites: ["L.FORM", "L.MCQ"] },
  // Reading
  { id: "R.SKIM", code: "R.SKIM", category: "reading", name: "Skimming & scanning", description: "Find the gist fast and locate names, numbers and key terms." },
  { id: "R.PARA", code: "R.PARA", category: "reading", name: "Paraphrase recognition", description: "Match statements to passage text written in different words.", prerequisites: ["R.SKIM"] },
  { id: "R.SENT", code: "R.SENT", category: "reading", name: "Sentence & summary completion", description: "Complete sentences with words from the passage within a word limit.", prerequisites: ["R.SKIM"] },
  { id: "R.TFNG", code: "R.TFNG", category: "reading", name: "True / False / Not Given", description: "Decide whether the writer agrees, contradicts or says nothing.", prerequisites: ["R.PARA"] },
  { id: "R.HEAD", code: "R.HEAD", category: "reading", name: "Matching headings", description: "Choose the heading that captures each paragraph's main idea.", prerequisites: ["R.SKIM"] },
  { id: "R.MINF", code: "R.MINF", category: "reading", name: "Matching information", description: "Locate which paragraph contains a specific detail.", prerequisites: ["R.SKIM", "R.PARA"] },
  { id: "R.MCQ", code: "R.MCQ", category: "reading", name: "Multiple choice (reading)", description: "Eliminate options that are partly true or not stated.", prerequisites: ["R.PARA"] },
  // Writing
  { id: "W.T1OV", code: "W.T1OV", category: "writing", name: "Task 1: overview", description: "Summarise the main features of a visual in one or two sentences." },
  { id: "W.T1", code: "W.T1", category: "writing", name: "Task 1: describing trends", description: "Use accurate verbs, nouns and adverbs for change over time.", prerequisites: ["W.T1OV"] },
  { id: "W.T2", code: "W.T2", category: "writing", name: "Task 2: argument structure", description: "Plan a clear position with developed, supported paragraphs." },
  { id: "W.COH", code: "W.COH", category: "writing", name: "Cohesion & linking", description: "Connect ideas with accurate linking words and reference.", prerequisites: ["W.T2"] },
  { id: "G.COND3", code: "G.COND3", category: "writing", name: "Grammar: Conditionals Type 3", description: "Talk about unreal past situations accurately." },
  { id: "G.INV", code: "G.INV", category: "writing", name: "Grammar: Inversion", description: "Use negative adverbials and inversion for emphasis.", prerequisites: ["G.COND3"] },
  { id: "V.COLL", code: "V.COLL", category: "writing", name: "Vocab: Collocations", description: "Choose natural word partnerships (e.g. 'pose a threat')." },
  // Speaking
  { id: "S.P1", code: "S.P1", category: "speaking", name: "Part 1: extending answers", description: "Answer, give a reason and add an example in 2–3 sentences." },
  { id: "S.DM", code: "S.DM", category: "speaking", name: "Discourse markers", description: "Signal structure with natural spoken linking phrases.", prerequisites: ["S.P1"] },
  { id: "S.P2", code: "S.P2", category: "speaking", name: "Part 2: long turn structure", description: "Use the preparation minute and cover every cue card point.", prerequisites: ["S.P1", "S.DM"] },
  { id: "S.P3", code: "S.P3", category: "speaking", name: "Part 3: opinions & speculation", description: "Give, support and qualify opinions about abstract topics.", prerequisites: ["S.P2"] },
  { id: "S.PRON", code: "S.PRON", category: "speaking", name: "Pronunciation: stress", description: "Place word and sentence stress to sound clear and natural." },
];

export const SKILL_BY_ID: Record<string, Skill> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
