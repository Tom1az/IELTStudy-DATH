// The same values as the enums in schema.prisma
export type SkillCategory = "listening" | "reading" | "writing" | "speaking";
export type CourseLevel = "beginner" | "intermediate" | "advanced";
export type QuestionType =
  "multiple_choice" | "true_false_not_given" | "gap_fill" | "matching" | "error_identification";

// Any value that can be stored in a JSONB column
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

// skillCode -> weight. Question weights must sum to 1 (the Q-matrix split); lesson tag weights need not.
export type SkillWeights = Record<string, number>;

export type SeedSkill = {
  code: string;
  name: string;
  category: SkillCategory;
  description: string;
};

export type SeedQuestion = {
  type: QuestionType;
  text: string;
  options?: Json;
  answer: Json;
  explanation?: string;
  difficulty?: number;
  skills: SkillWeights;
};

export type SeedPassage = {
  type: "reading_text" | "listening_audio";
  title: string;
  // Reading text, or the transcript of a listening passage
  content: string;
  // Placeholder Storage path until real audio is uploaded (Phase 2)
  mediaPath?: string;
};

// Questions that share a passage; standalone questions have no passage
export type QuestionGroup = { passage?: SeedPassage; questions: SeedQuestion[] };

export type SeedLesson = { title: string; content: string; skills: SkillWeights };

export type SeedCourse = {
  title: string;
  description: string;
  level: CourseLevel;
  core: SeedLesson[];
  remedial: SeedLesson[];
  // Attached to the first core lesson
  quiz: { title: string; groups: QuestionGroup[] };
};

// Builds multiple-choice options labelled A, B, C, D in order
const OPTION_LETTERS = ["A", "B", "C", "D"];
const mc = (...texts: string[]) => {
  const options = [];
  for (let i = 0; i < texts.length; i++) {
    options.push({ id: OPTION_LETTERS[i], text: texts[i] });
  }
  return options;
};

export const skills: SeedSkill[] = [
  {
    code: "L_FORM_COMPLETION",
    name: "Form and note completion",
    category: "listening",
    description: "Catching names, numbers, dates and spellings while filling in a form.",
  },
  {
    code: "L_SPECIFIC_DETAIL",
    name: "Listening for specific detail",
    category: "listening",
    description: "Picking out a precise fact from a longer stretch of speech.",
  },
  {
    code: "L_MAP_LABELLING",
    name: "Map and plan labelling",
    category: "listening",
    description: "Following directions and locations on a map or plan.",
  },
  {
    code: "L_GIST",
    name: "Main idea and speaker purpose",
    category: "listening",
    description: "Understanding why someone is speaking and their overall point.",
  },
  {
    code: "L_DISTRACTORS",
    name: "Handling distractors",
    category: "listening",
    description: "Ignoring options a speaker mentions and then corrects or rejects.",
  },
  {
    code: "R_SKIM_HEADINGS",
    name: "Skimming for headings",
    category: "reading",
    description: "Matching paragraphs to headings by their main idea.",
  },
  {
    code: "R_SCAN_DETAIL",
    name: "Scanning for detail",
    category: "reading",
    description: "Locating a specific fact or figure quickly.",
  },
  {
    code: "R_TFNG",
    name: "True / False / Not Given",
    category: "reading",
    description: "Deciding whether the text confirms, contradicts or says nothing about a claim.",
  },
  {
    code: "R_INFERENCE",
    name: "Inference and writer's view",
    category: "reading",
    description: "Reading between the lines to identify implied meaning and attitude.",
  },
  {
    code: "R_VOCAB_CONTEXT",
    name: "Vocabulary in context",
    category: "reading",
    description: "Recognising paraphrase and working out meaning from context.",
  },
  {
    code: "W_TENSES",
    name: "Grammar: tenses and agreement",
    category: "writing",
    description: "Choosing the right tense and making subjects and verbs agree.",
  },
  {
    code: "W_CONDITIONALS",
    name: "Grammar: conditionals",
    category: "writing",
    description: "Forming zero to third and mixed conditionals.",
  },
  {
    code: "W_INVERSION",
    name: "Grammar: inversion",
    category: "writing",
    description: "Inverting subject and auxiliary after negative adverbials and in conditionals.",
  },
  {
    code: "W_COHESION",
    name: "Cohesion and linking devices",
    category: "writing",
    description: "Connecting ideas with the right linking words.",
  },
  {
    code: "W_COLLOCATIONS",
    name: "Vocabulary: collocations",
    category: "writing",
    description: "Using natural word partnerships such as 'take measures'.",
  },
  {
    code: "S_WORD_STRESS",
    name: "Pronunciation: word stress",
    category: "speaking",
    description: "Stressing the correct syllable in multi-syllable words.",
  },
  {
    code: "S_SOUNDS",
    name: "Pronunciation: individual sounds",
    category: "speaking",
    description: "Distinguishing vowel sounds and -ed endings.",
  },
  {
    code: "S_INTONATION",
    name: "Intonation and sentence stress",
    category: "speaking",
    description: "Using stress and pitch to highlight meaning.",
  },
  {
    code: "S_DISCOURSE_MARKERS",
    name: "Fluency: discourse markers",
    category: "speaking",
    description: "Using markers like 'well' and 'to be honest' to sound fluent.",
  },
  {
    code: "S_LEXICAL_RANGE",
    name: "Lexical resource",
    category: "speaking",
    description: "Paraphrasing and using less common, natural vocabulary.",
  },
];

// 30 questions: listening 7, reading 8, writing 8, speaking 7. Every skill is assessed at least once.
export const diagnostic: {
  title: string;
  description: string;
  timeLimitSeconds: number;
  groups: QuestionGroup[];
} = {
  title: "IELTS placement test",
  description: "30 questions across all four skills. Sets your starting skill profile.",
  timeLimitSeconds: 45 * 60,
  groups: [
    {
      passage: {
        type: "listening_audio",
        title: "Joining a sports centre",
        mediaPath: "seed/diagnostic/listening-1.mp3",
        content:
          "Receptionist: Good morning, Riverside Sports Centre. How can I help?\n" +
          "Caller: Hi, I'd like to join the swimming club.\n" +
          "Receptionist: Of course. Can I take your surname?\n" +
          "Caller: It's Hartley. H-A-R-T-L-E-Y.\n" +
          "Receptionist: Membership is 35 pounds a month, or 30 a month if you pay for the whole year.\n" +
          "Caller: I'll pay monthly, thanks.\n" +
          "Receptionist: Classes start on the 12th of March. Sorry, I mean the 14th; the 12th is a public holiday.\n" +
          "Caller: Great. Where can I park?\n" +
          "Receptionist: The car park is behind the main building, next to the tennis courts. The entrance is opposite the café.",
      },
      questions: [
        {
          type: "gap_fill",
          text: "Caller's surname: ______",
          answer: ["Hartley"],
          skills: { L_FORM_COMPLETION: 1 },
        },
        {
          type: "gap_fill",
          text: "Monthly membership fee if paying monthly: £______",
          answer: ["35"],
          explanation: "30 pounds is only for people who pay for the whole year.",
          skills: { L_SPECIFIC_DETAIL: 0.6, L_DISTRACTORS: 0.4 },
        },
        {
          type: "multiple_choice",
          text: "When do classes start?",
          options: mc("12 March", "14 March", "4 March"),
          answer: "B",
          explanation: "The receptionist corrects herself: the 12th is a holiday.",
          skills: { L_DISTRACTORS: 1 },
        },
        {
          type: "multiple_choice",
          text: "Where is the car park?",
          options: mc(
            "In front of the main building",
            "Behind the main building, next to the tennis courts",
            "Opposite the café",
          ),
          answer: "B",
          skills: { L_MAP_LABELLING: 1 },
        },
        {
          type: "multiple_choice",
          text: "What is the main purpose of the call?",
          options: mc(
            "To complain about the pool",
            "To join a swimming club",
            "To book a tennis court",
          ),
          answer: "B",
          skills: { L_GIST: 1 },
        },
      ],
    },
    {
      passage: {
        type: "listening_audio",
        title: "Lecture: bees in the city",
        mediaPath: "seed/diagnostic/listening-2.mp3",
        content:
          "Today I want to look at why cities are becoming important for bees. You might expect the countryside to be better, " +
          "but intensive farming means large areas grow a single crop, so bees there have flowers for only a few weeks a year. " +
          "Urban gardens, by contrast, flower from early spring to late autumn. That said, cities are not perfect: pollution can " +
          "confuse a bee's sense of smell. So the picture is mixed, but on balance, recent studies suggest urban colonies are actually healthier.",
      },
      questions: [
        {
          type: "multiple_choice",
          text: "What is the lecturer's overall view?",
          options: mc(
            "Cities harm bees more than farms do",
            "On balance, urban colonies are healthier",
            "The countryside is always better for bees",
          ),
          answer: "B",
          difficulty: 4,
          skills: { L_GIST: 0.5, L_SPECIFIC_DETAIL: 0.5 },
        },
        {
          type: "gap_fill",
          text: "On intensively farmed land, bees may only have flowers for a few ______ each year.",
          answer: ["weeks"],
          skills: { L_SPECIFIC_DETAIL: 1 },
        },
      ],
    },
    {
      passage: {
        type: "reading_text",
        title: "The rise of remote work",
        content:
          "A. Before 2020, fewer than one in twenty employees in the UK worked mainly from home. The pandemic changed that almost overnight, and by mid-2021 the figure had risen to roughly one in four.\n\n" +
          "B. Supporters argue that remote work saves commuting time and lets companies hire talent from anywhere. A 2022 survey of 3,000 workers found that most reported higher productivity at home, although managers in the same firms were less convinced.\n\n" +
          "C. Critics point to the loss of informal learning. Junior staff, in particular, pick up skills by overhearing experienced colleagues, something that video calls rarely replicate.\n\n" +
          "D. Many organisations have therefore settled on a hybrid model, asking staff to attend the office two or three days a week. Whether this compromise will last remains to be seen.",
      },
      questions: [
        {
          type: "matching",
          text: "Match each paragraph to its heading.",
          options: {
            items: [
              { id: "B", text: "Paragraph B" },
              { id: "C", text: "Paragraph C" },
              { id: "D", text: "Paragraph D" },
            ],
            choices: [
              { id: "i", text: "A compromise solution" },
              { id: "ii", text: "The case in favour" },
              { id: "iii", text: "A concern about training" },
              { id: "iv", text: "Government regulations" },
            ],
          },
          answer: { B: "ii", C: "iii", D: "i" },
          skills: { R_SKIM_HEADINGS: 1 },
        },
        {
          type: "gap_fill",
          text: "By mid-2021, about one in ______ UK employees worked mainly from home.",
          answer: ["four", "4"],
          skills: { R_SCAN_DETAIL: 1 },
        },
        {
          type: "true_false_not_given",
          text: "Managers agreed with workers that productivity was higher at home.",
          answer: "false",
          explanation: "Managers 'were less convinced'.",
          skills: { R_TFNG: 1 },
        },
        {
          type: "true_false_not_given",
          text: "The 2022 survey was carried out by a government agency.",
          answer: "not_given",
          skills: { R_TFNG: 1 },
        },
        {
          type: "true_false_not_given",
          text: "Before 2020, working from home was uncommon in the UK.",
          answer: "true",
          explanation: "'Fewer than one in twenty' is paraphrased as 'uncommon'.",
          skills: { R_TFNG: 0.5, R_VOCAB_CONTEXT: 0.5 },
        },
        {
          type: "multiple_choice",
          text: "What does the writer suggest about the hybrid model?",
          options: mc(
            "It is certain to become permanent",
            "Its future is uncertain",
            "Most firms have rejected it",
          ),
          answer: "B",
          skills: { R_INFERENCE: 1 },
        },
        {
          type: "multiple_choice",
          text: "In paragraph C, 'replicate' is closest in meaning to:",
          options: mc("reproduce", "record", "reject"),
          answer: "A",
          skills: { R_VOCAB_CONTEXT: 1 },
        },
        {
          type: "multiple_choice",
          text: "Why does the writer mention junior staff?",
          options: mc(
            "They prefer remote work",
            "They learn informally from experienced colleagues",
            "They work longer hours at home",
          ),
          answer: "B",
          skills: { R_INFERENCE: 0.5, R_SCAN_DETAIL: 0.5 },
        },
      ],
    },
    {
      questions: [
        {
          type: "error_identification",
          text: "Which part of the sentence contains an error?",
          options: mc("Neither of the reports", "were", "finished", "on time."),
          answer: "B",
          explanation: "'Neither' takes a singular verb: 'was'.",
          skills: { W_TENSES: 1 },
        },
        {
          type: "multiple_choice",
          text: "If she ______ harder last year, she would have passed the exam.",
          options: mc("studied", "had studied", "has studied"),
          answer: "B",
          skills: { W_CONDITIONALS: 1 },
        },
        {
          type: "multiple_choice",
          text: "Not only ______ the deadline, but he also went over budget.",
          options: mc("he missed", "did he miss", "he did miss"),
          answer: "B",
          difficulty: 4,
          skills: { W_INVERSION: 1 },
        },
        {
          type: "multiple_choice",
          text: "Rarely ______ such a clear explanation.",
          options: mc("I have heard", "have I heard", "I heard"),
          answer: "B",
          difficulty: 4,
          skills: { W_INVERSION: 0.7, W_TENSES: 0.3 },
        },
        {
          type: "multiple_choice",
          text: "Public transport is cheap. ______, it is often overcrowded.",
          options: mc("Therefore", "However", "For example"),
          answer: "B",
          difficulty: 2,
          skills: { W_COHESION: 1 },
        },
        {
          type: "multiple_choice",
          text: "The government should ______ measures to reduce air pollution.",
          options: mc("make", "take", "do"),
          answer: "B",
          skills: { W_COLLOCATIONS: 1 },
        },
        {
          type: "gap_fill",
          text: "The number of international students ______ (rise) steadily since 2010.",
          answer: ["has risen"],
          skills: { W_TENSES: 1 },
        },
        {
          type: "multiple_choice",
          text: "Had I known about the traffic, I ______ earlier.",
          options: mc("would leave", "would have left", "will leave"),
          answer: "B",
          difficulty: 5,
          skills: { W_CONDITIONALS: 0.5, W_INVERSION: 0.5 },
        },
      ],
    },
    {
      questions: [
        {
          type: "multiple_choice",
          text: "Which syllable is stressed in 'photography'?",
          options: mc("PHO-to-gra-phy", "pho-TO-gra-phy", "pho-to-GRA-phy"),
          answer: "B",
          skills: { S_WORD_STRESS: 1 },
        },
        {
          type: "multiple_choice",
          text: "Which word has a different stress pattern from the other two?",
          options: mc("record (noun)", "present (noun)", "decide"),
          answer: "C",
          explanation: "'deCIDE' is stressed on the second syllable; the nouns on the first.",
          skills: { S_WORD_STRESS: 1 },
        },
        {
          type: "multiple_choice",
          text: "How is the -ed ending pronounced in 'wanted'?",
          options: mc("/t/", "/d/", "/ɪd/"),
          answer: "C",
          difficulty: 2,
          skills: { S_SOUNDS: 1 },
        },
        {
          type: "multiple_choice",
          text: "Which word has a different vowel sound?",
          options: mc("ship", "sheep", "chip"),
          answer: "B",
          difficulty: 2,
          skills: { S_SOUNDS: 1 },
        },
        {
          type: "multiple_choice",
          text: "In 'I said Tuesday, not Thursday', which word carries the main stress?",
          options: mc("said", "Tuesday", "not"),
          answer: "B",
          skills: { S_INTONATION: 1 },
        },
        {
          type: "multiple_choice",
          text: "Examiner: 'Do you like cooking?' Which answer sounds most natural and fluent?",
          options: mc(
            "Yes.",
            "Well, to be honest, I'm not a great cook, but I enjoy making simple dishes.",
            "Cooking is an activity that people do.",
          ),
          answer: "B",
          skills: { S_DISCOURSE_MARKERS: 0.6, S_LEXICAL_RANGE: 0.4 },
        },
        {
          type: "multiple_choice",
          text: "Which phrase best replaces 'very tired' in a Band 7+ answer?",
          options: mc("worn out", "tired very", "much tired"),
          answer: "A",
          skills: { S_LEXICAL_RANGE: 1 },
        },
      ],
    },
  ],
};

export const courses: SeedCourse[] = [
  {
    title: "IELTS Foundations",
    description: "Core listening, grammar and pronunciation for learners aiming at Band 5–5.5.",
    level: "beginner",
    core: [
      {
        title: "Listening for numbers and spelling",
        content:
          "Section 1 of the Listening test is full of names, phone numbers and dates. Write exactly what you hear, check the word limit, and watch for speakers who correct themselves.",
        skills: { L_FORM_COMPLETION: 1, L_SPECIFIC_DETAIL: 0.5 },
      },
      {
        title: "Present and past tenses",
        content:
          "Use the present perfect for changes that continue up to now ('has risen since 2010') and the past simple for finished times ('rose in 2010').",
        skills: { W_TENSES: 1 },
      },
      {
        title: "Word stress basics",
        content:
          "Most two-syllable nouns are stressed on the first syllable (PREsent) and most two-syllable verbs on the second (preSENT). Words ending in -graphy stress the syllable before it.",
        skills: { S_WORD_STRESS: 1 },
      },
    ],
    remedial: [
      {
        title: "Spelling names, numbers and dates",
        content:
          "Practise the alphabet in groups of letters that sound alike (A H J K, B C D E G P T V). Say phone numbers in chunks, and write dates the way the question shows them.",
        skills: { L_FORM_COMPLETION: 1, L_SPECIFIC_DETAIL: 0.6 },
      },
      {
        title: "Following directions on a map",
        content:
          "Before the audio starts, name every landmark on the map. Listen for prepositions of place: opposite, next to, behind, at the far end of.",
        skills: { L_MAP_LABELLING: 1 },
      },
      {
        title: "Sounds that change meaning",
        content:
          "Long /iː/ (sheep) and short /ɪ/ (ship) change meaning. The -ed ending is /ɪd/ only after /t/ or /d/ (wanted, needed).",
        skills: { S_SOUNDS: 1, S_WORD_STRESS: 0.5 },
      },
    ],
    quiz: {
      title: "Numbers and spelling check",
      groups: [
        {
          passage: {
            type: "listening_audio",
            title: "Booking a table",
            mediaPath: "seed/courses/foundations/booking.mp3",
            content:
              "Woman: I'd like to book a table for Friday.\n" +
              "Man: Certainly. What name is it?\n" +
              "Woman: Okafor. O-K-A-F-O-R.\n" +
              "Man: And how many people?\n" +
              "Woman: Six. Actually, make that seven.\n" +
              "Man: What time would you like?\n" +
              "Woman: Half past seven, please.\n" +
              "Man: Can I take a contact number?\n" +
              "Woman: Yes, it's 0161 498 0723.",
          },
          questions: [
            {
              type: "gap_fill",
              text: "Name: ______",
              answer: ["Okafor"],
              skills: { L_FORM_COMPLETION: 1 },
            },
            {
              type: "gap_fill",
              text: "Number of people: ______",
              answer: ["7", "seven"],
              explanation: "She changes six to seven.",
              skills: { L_DISTRACTORS: 0.5, L_SPECIFIC_DETAIL: 0.5 },
            },
            {
              type: "multiple_choice",
              text: "What time is the booking?",
              options: mc("7:00", "7:30", "6:30"),
              answer: "B",
              skills: { L_SPECIFIC_DETAIL: 1 },
            },
            {
              type: "gap_fill",
              text: "Contact number: ______",
              answer: ["0161 498 0723", "01614980723"],
              skills: { L_FORM_COMPLETION: 1 },
            },
          ],
        },
      ],
    },
  },
  {
    title: "Reading and Writing Strategies",
    description: "Question-type strategies and accurate grammar for learners aiming at Band 6–6.5.",
    level: "intermediate",
    core: [
      {
        title: "True, False or Not Given",
        content:
          "TRUE means the text says the same thing in other words. FALSE means it says the opposite. NOT GIVEN means the text says nothing either way, so never use your own knowledge.",
        skills: { R_TFNG: 1 },
      },
      {
        title: "Linking ideas with cohesive devices",
        content:
          "Contrast: however, whereas, nevertheless. Result: therefore, as a result, consequently. Example: for instance, such as. Choose the linker that matches the logical relationship.",
        skills: { W_COHESION: 1 },
      },
      {
        title: "Conditionals in academic writing",
        content:
          "Third conditional (if + past perfect, would have + past participle) talks about unreal past events: 'If the policy had been introduced earlier, emissions would have fallen.'",
        skills: { W_CONDITIONALS: 1 },
      },
    ],
    remedial: [
      {
        title: "Spotting paraphrase",
        content:
          "IELTS rarely repeats the text's words. Look for synonyms (rose / increased) and opposite-meaning pairs (rare / common) that turn a statement TRUE or FALSE.",
        skills: { R_VOCAB_CONTEXT: 1, R_TFNG: 0.6 },
      },
      {
        title: "Skimming for headings, scanning for detail",
        content:
          "Skim each paragraph's first and last sentence for its main idea. Scan for numbers, names and capital letters when you need a specific fact.",
        skills: { R_SKIM_HEADINGS: 1, R_SCAN_DETAIL: 1 },
      },
      {
        title: "Tenses and agreement clinic",
        content:
          "Neither, each and every take a singular verb. 'The number of' takes a singular verb; 'a number of' takes a plural one.",
        skills: { W_TENSES: 1 },
      },
      {
        title: "Linking words that connect ideas",
        content:
          "Don't start every sentence with a linker. Mix sentence-initial linkers (However,) with ones inside the sentence (whereas, which means that).",
        skills: { W_COHESION: 1 },
      },
    ],
    quiz: {
      title: "True / False / Not Given practice",
      groups: [
        {
          passage: {
            type: "reading_text",
            title: "The first coffee houses",
            content:
              "Coffee was first cultivated in Yemen in the fifteenth century. From there it spread to Egypt and Turkey, and by the 1650s coffee houses had opened in London. " +
              "These establishments became known as 'penny universities' because, for the price of a cup, customers could listen to lively debate. " +
              "Not everyone approved: in 1675 King Charles II tried to close them, but public protest forced him to back down within days.",
          },
          questions: [
            {
              type: "true_false_not_given",
              text: "Coffee was first grown in Egypt.",
              answer: "false",
              skills: { R_TFNG: 1 },
            },
            {
              type: "true_false_not_given",
              text: "London's coffee houses were especially popular with students.",
              answer: "not_given",
              skills: { R_TFNG: 1 },
            },
            {
              type: "true_false_not_given",
              text: "Charles II's attempt to close the coffee houses was quickly abandoned.",
              answer: "true",
              explanation: "'Back down within days' is paraphrased as 'quickly abandoned'.",
              skills: { R_TFNG: 0.5, R_VOCAB_CONTEXT: 0.5 },
            },
            {
              type: "multiple_choice",
              text: "Why were coffee houses called 'penny universities'?",
              options: mc(
                "They trained teachers",
                "A cheap cup gave access to debate",
                "Universities owned them",
              ),
              answer: "B",
              skills: { R_INFERENCE: 0.5, R_SCAN_DETAIL: 0.5 },
            },
          ],
        },
      ],
    },
  },
  {
    title: "Band 7+ Mastery",
    description:
      "Advanced grammar, vocabulary and inference for learners aiming at Band 7 and above.",
    level: "advanced",
    core: [
      {
        title: "Inversion for emphasis",
        content:
          "After negative or limiting adverbials at the start of a sentence, invert the subject and auxiliary: 'Rarely have we seen…', 'Not only did he…'.",
        skills: { W_INVERSION: 1 },
      },
      {
        title: "Collocations for Task 2",
        content:
          "Strong essays use natural pairs: take measures, pose a threat, raise awareness, meet a demand. Learn them as chunks, not single words.",
        skills: { W_COLLOCATIONS: 1 },
      },
      {
        title: "Inference and the writer's view",
        content:
          "Hedging words (may, appears, remains to be seen) signal uncertainty. Evaluative adjectives (welcome, troubling) reveal the writer's attitude.",
        skills: { R_INFERENCE: 1 },
      },
    ],
    remedial: [
      {
        title: "Inversion after negative adverbials",
        content:
          "Drill the patterns: No sooner had… than; Hardly had… when; Under no circumstances should…; and inverted conditionals: Had I known…, Should you need….",
        skills: { W_INVERSION: 1, W_CONDITIONALS: 0.5 },
      },
      {
        title: "Catching distractors and the speaker's main point",
        content:
          "Speakers often mention an option and then reject it ('I thought about the train, but…'). Wait for the final decision, and listen for the overall purpose before details.",
        skills: { L_DISTRACTORS: 1, L_GIST: 0.7 },
      },
      {
        title: "Fluency, intonation and lexical range",
        content:
          "Buy thinking time with markers (Well, To be honest, That's an interesting question). Stress the word that carries new or contrasting information, and paraphrase instead of repeating.",
        skills: { S_DISCOURSE_MARKERS: 1, S_INTONATION: 0.7, S_LEXICAL_RANGE: 0.7 },
      },
      {
        title: "Strong collocations",
        content:
          "Replace weak verbs: make measures → take measures; do a mistake → make a mistake; say an opinion → express an opinion.",
        skills: { W_COLLOCATIONS: 1 },
      },
      {
        title: "Reading between the lines",
        content:
          "Ask what the writer implies but doesn't state. Check every inference against a phrase in the text you can point to.",
        skills: { R_INFERENCE: 1 },
      },
    ],
    quiz: {
      title: "Inversion check",
      groups: [
        {
          questions: [
            {
              type: "multiple_choice",
              text: "Seldom ______ so much rain in a single week.",
              options: mc("we have seen", "have we seen", "we saw"),
              answer: "B",
              skills: { W_INVERSION: 1 },
            },
            {
              type: "multiple_choice",
              text: "No sooner ______ than the phone rang.",
              options: mc("I had sat down", "had I sat down", "I sat down"),
              answer: "B",
              skills: { W_INVERSION: 1 },
            },
            {
              type: "multiple_choice",
              text: "Should you ______ any questions, please contact the office.",
              options: mc("have", "having", "had"),
              answer: "A",
              skills: { W_INVERSION: 0.5, W_CONDITIONALS: 0.5 },
            },
            {
              type: "error_identification",
              text: "Which part of the sentence contains an error?",
              options: mc("Under no circumstances", "you should", "share", "your password."),
              answer: "B",
              explanation: "After 'Under no circumstances', invert: 'should you'.",
              skills: { W_INVERSION: 1 },
            },
          ],
        },
      ],
    },
  },
];
