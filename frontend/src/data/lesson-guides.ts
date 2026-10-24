import type { WorkedExample } from "@/lib/types";

// Teaching notes shown in the lesson "Overview" tab, keyed by practice template.
export interface LessonGuide {
  strategy: string[];
  example?: WorkedExample;
  body: string;
}

export const GUIDES: Record<string, LessonGuide> = {
  R_TFNG: {
    strategy: [
      "Find the part of the passage that discusses the statement. Use names, numbers and topic words, not exact matches.",
      "True means the passage agrees. False means it says the opposite. Not Given means the passage does not say either.",
      "Never use outside knowledge. Decide only from what the writer states.",
    ],
    example: {
      quote: "Hives on city rooftops have become common since the early 2000s, kept by hobbyists and small businesses.",
      items: [
        { tag: "TRUE", tone: "true", statement: "Rooftop hives are now common in cities.", explanation: "The passage says the same idea in different words." },
        { tag: "FALSE", tone: "false", statement: "Only large companies keep city hives.", explanation: "The passage names hobbyists and small businesses." },
        { tag: "NOT GIVEN", tone: "ng", statement: "City honey sells for a higher price.", explanation: "Price is never mentioned." },
      ],
    },
    body: "True / False / Not Given questions test whether you can compare a statement with what the writer actually says. The questions follow the order of the passage, so once you locate question 1, question 2 is usually a little further on. Watch for qualifying words such as always, only, some and most — a single word can turn a TRUE statement into FALSE.",
  },
  R_SKIM: {
    strategy: [
      "Skim first: read the title, the first sentence of each paragraph and any words in bold to get the gist in under two minutes.",
      "Scan for the key word in each question — names, dates and numbers are fastest to spot.",
      "Read the sentence before and after the match carefully before you write the answer.",
    ],
    example: {
      quote: "Taipei's Shilin market welcomes an estimated 30,000 visitors on a typical weekend night.",
      items: [
        { tag: "SCAN FOR", tone: "neutral", statement: "Shilin · weekend · a number", explanation: "Capital letters and digits stand out on the page." },
        { tag: "ANSWER", tone: "true", statement: "30,000", explanation: "Copy the number exactly as written." },
      ],
    },
    body: "Skimming gives you a map of the passage; scanning uses that map to find details quickly. Strong candidates spend about two minutes skimming each passage so that every later question takes less time.",
  },
  R_SENT: {
    strategy: [
      "Read the instructions twice and circle the word limit — 'NO MORE THAN TWO WORDS' means one or two words only.",
      "Predict the type of word that fits the gap (noun, number, adjective) before you look at the passage.",
      "Copy the words exactly from the passage and check that the completed sentence is grammatical.",
    ],
    example: {
      quote: "Researchers describe the result as 'social jet lag'.",
      items: [
        { tag: "QUESTION", tone: "neutral", statement: "Researchers call the mismatch social ___.", explanation: "We need a noun phrase of up to two words." },
        { tag: "ANSWER", tone: "true", statement: "jet lag", explanation: "Two words, copied exactly, and grammatical in the sentence." },
      ],
    },
    body: "Sentence and summary completion tests paraphrase recognition and accuracy. Most lost marks come from exceeding the word limit or changing the word form, so always re-read the completed sentence.",
  },
  R_HEAD: {
    strategy: [
      "Read each paragraph's first and last sentences to find the main idea, not a detail.",
      "Underline the key idea in each heading and cross out headings once they are used.",
      "Beware of headings that repeat a word from the paragraph but describe only one detail.",
    ],
    example: {
      quote: "Not all workers benefited equally. Employees with spare rooms adapted easily, while those sharing small flats struggled.",
      items: [
        { tag: "CORRECT", tone: "true", statement: "An unequal experience", explanation: "Matches the whole paragraph's main idea." },
        { tag: "TRAP", tone: "false", statement: "The end of the office building", explanation: "Not mentioned in this paragraph." },
      ],
    },
    body: "Matching headings is a test of main-idea recognition. Do these questions first for a passage — the work you do here helps you answer every other question on the same text.",
  },
  R_MINF: {
    strategy: [
      "Read all the statements first; they describe a type of information (a reason, a statistic, an example).",
      "Work through the passage paragraph by paragraph and check it against every statement.",
      "Remember that some paragraphs may be used twice and some not at all.",
    ],
    body: "Matching information questions do not follow passage order, so a systematic paragraph-by-paragraph approach is faster than searching for each statement separately.",
  },
  R_MCQ: {
    strategy: [
      "Read the question stem and find the right place in the passage before reading the options.",
      "Eliminate options that are partly true, too extreme or not mentioned.",
      "The correct option usually paraphrases the passage rather than copying its words.",
    ],
    body: "Multiple choice questions follow passage order. Distractors often use exact words from the passage, while the correct answer expresses the same idea in different words.",
  },
  L_FORM: {
    strategy: [
      "Use the 30 seconds before the recording to predict each answer type: a name, a number, a day.",
      "Listen for corrections — speakers often change their mind ('Tuesday… sorry, Thursday').",
      "Check spelling and word limits during the transfer time.",
    ],
    example: {
      quote: "The course runs on Tuesdays — oh, sorry, it moved this term. It's now on Thursdays.",
      items: [
        { tag: "DISTRACTOR", tone: "false", statement: "Tuesday", explanation: "Mentioned first, then corrected." },
        { tag: "ANSWER", tone: "true", statement: "Thursday", explanation: "The final, corrected information." },
      ],
    },
    body: "Section 1 is a conversation in an everyday context. Answers come in order and are often spelled out or given as numbers, so accuracy matters more than speed.",
  },
  L_MAP: {
    strategy: [
      "Before listening, find the starting point on the plan and note the compass directions.",
      "Learn location language: opposite, beside, at the far end, in the corner, between.",
      "Follow the speaker's route with your pencil so you never lose your place.",
    ],
    body: "Map and plan labelling questions describe a route or a layout. Most errors come from losing the starting point, so mark it clearly before the recording begins.",
  },
  L_MCQ: {
    strategy: [
      "Underline the key words in the question, not the options — they tell you what to listen for.",
      "Expect every option to be mentioned; only one will be confirmed by the speakers.",
      "Listen for disagreement and correction words: actually, but, in fact, instead.",
    ],
    example: {
      quote: "We thought about interviews, but they take too long. We'll weigh the waste instead.",
      items: [
        { tag: "DISTRACTOR", tone: "false", statement: "Interviews", explanation: "Mentioned, then rejected." },
        { tag: "ANSWER", tone: "true", statement: "Weighing waste", explanation: "Confirmed as the chosen method." },
      ],
    },
    body: "Section 3 usually features students and a tutor discussing an academic task. Speakers often consider several ideas before agreeing, which is where distractors come from.",
  },
  L_LECT: {
    strategy: [
      "Read the notes headings first — they show how the lecture is organised.",
      "Listen for signposting: 'Today I want to look at…', 'Another factor is…', 'Finally…'.",
      "There is no break in Section 4, so keep moving if you miss an answer.",
    ],
    body: "Section 4 is a single academic speaker. The notes summarise the lecture, so the words you hear are often paraphrased around the gap while the answer itself is said exactly.",
  },
  W_T1: {
    strategy: [
      "Describe size and speed of change accurately: slight, moderate, sharp, dramatic.",
      "Vary structure: 'Visits rose sharply' and 'There was a sharp rise in visits'.",
      "Compare data across categories rather than listing each figure.",
    ],
    example: {
      quote: "Country A: 2.0 (2000) → 3.5 (2010)",
      items: [
        { tag: "WEAK", tone: "false", statement: "Visits went up.", explanation: "No sense of how much." },
        { tag: "STRONG", tone: "true", statement: "Visits rose sharply, from 2 to 3.5 per person.", explanation: "Accurate verb, adverb and supporting data." },
      ],
    },
    body: "Task 1 rewards accurate selection and comparison of key features. You should spend about 20 minutes and write at least 150 words.",
  },
  W_T1OV: {
    strategy: [
      "The overview summarises the two or three most important features with no detailed figures.",
      "Start with 'Overall,' and mention the biggest change, the highest or lowest value, or a clear pattern.",
      "Paraphrase the task in your introduction — never copy it word for word.",
    ],
    body: "Without a clear overview, Task Achievement is usually limited to Band 5. A strong overview can be written in under three minutes once you know what to look for.",
  },
  W_T2: {
    strategy: [
      "Answer the exact question type: agree/disagree, discuss both views, problem/solution, or advantages/disadvantages.",
      "Write a clear position in the introduction and keep it consistent to the conclusion.",
      "Each body paragraph: topic sentence → explanation → example → link back.",
    ],
    example: {
      quote: "Some people believe university should be free for everyone. To what extent do you agree?",
      items: [
        { tag: "VAGUE", tone: "false", statement: "There are many opinions about this.", explanation: "No position." },
        { tag: "CLEAR", tone: "true", statement: "I partly agree: tuition should be free for low-income students only.", explanation: "A qualified, consistent position." },
      ],
    },
    body: "Task 2 is worth twice as much as Task 1. You should spend about 40 minutes and write at least 250 words, with planning taking the first five.",
  },
  W_GRAM: {
    strategy: [
      "Third conditional: If + had + past participle, would have + past participle.",
      "Negative adverbials (Never, Rarely, Only after) at the start of a sentence trigger inversion.",
      "Learn collocations in pairs: pose a threat, pay attention to, have an impact on.",
    ],
    body: "Grammatical Range and Accuracy is a quarter of your Writing score. A small number of accurate complex structures is worth more than many inaccurate ones.",
  },
  S_P1: {
    strategy: [
      "Answer directly, then add a reason and a short example — two or three sentences.",
      "Use natural spoken English; avoid written linking words like 'Furthermore'.",
      "If you need time, use a natural filler rather than a long silence.",
    ],
    example: {
      quote: "Examiner: Do you like cooking?",
      items: [
        { tag: "TOO SHORT", tone: "false", statement: "Yes.", explanation: "No development." },
        { tag: "STRONG", tone: "true", statement: "Yes, I do. It helps me relax, and at weekends I try new noodle recipes.", explanation: "Answer + reason + example." },
      ],
    },
    body: "Part 1 lasts four to five minutes and covers familiar topics. It is your chance to settle in and show fluency.",
  },
  S_P2: {
    strategy: [
      "Use the preparation minute to note one or two keywords for each cue point.",
      "Follow the cue card order and signpost each part of your talk.",
      "Keep talking until the examiner stops you — aim for the full two minutes.",
    ],
    body: "Part 2 is a long turn. Examiners look for an organised talk with a range of vocabulary, not a memorised script.",
  },
  S_P3: {
    strategy: [
      "Give an opinion, explain why, and support it with an example or consequence.",
      "Use hedging language to speculate: 'I imagine…', 'It might be that…'.",
      "Show both sides with phrases like 'Having said that…'.",
    ],
    body: "Part 3 is a discussion of abstract ideas related to the Part 2 topic. Longer, developed answers are expected.",
  },
  S_PRON: {
    strategy: [
      "Learn stress patterns by word family: PHOtograph, phoTOgrapher, photoGRAPHic.",
      "Stress content words (nouns, main verbs, adjectives) and weaken function words.",
      "Link consonant sounds to the vowel that follows: 'an apple' → 'a-napple'.",
    ],
    body: "Pronunciation is a quarter of your Speaking score. Clear stress makes you easier to understand even with an accent.",
  },
};
