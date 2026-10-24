import type { Passage, Question, QuestionSkill } from "@/lib/types";

// Sample IELTS-style practice material written for this project (not taken from
// official IELTS papers). Each template is instantiated into one or more practice
// sets in seed.ts; question ids are assigned there.

export type QT = Omit<Question, "id" | "passageId">;

const sk = (...pairs: [string, number][]): QuestionSkill[] => pairs.map(([skillId, weight]) => ({ skillId, weight }));

function tfng(prompt: string, answerKey: "TRUE" | "FALSE" | "NOT GIVEN", explanation: string, skills: QuestionSkill[], difficulty: 1 | 2 | 3 = 2, group?: Partial<QT>): QT {
  return { type: "tfng", prompt, answerKey, explanation, skills, difficulty, ...group };
}
function mcq(prompt: string, options: string[], correct: number, explanation: string, skills: QuestionSkill[], difficulty: 1 | 2 | 3 = 2, group?: Partial<QT>): QT {
  return { type: "mcq", prompt, options, answerKey: String(correct), explanation, skills, difficulty, ...group };
}
function gap(prompt: string, accepted: string, explanation: string, skills: QuestionSkill[], difficulty: 1 | 2 | 3 = 2, wordLimit = "ONE WORD", group?: Partial<QT>): QT {
  return { type: "gap", prompt, answerKey: accepted, explanation, skills, difficulty, wordLimit, ...group };
}
function heading(prompt: string, options: string[], correct: number, explanation: string, skills: QuestionSkill[], difficulty: 1 | 2 | 3 = 2, group?: Partial<QT>): QT {
  return { type: "heading", prompt, options, answerKey: String(correct), explanation, skills, difficulty, ...group };
}

export interface Template {
  key: string;
  passage: Passage;
  questions: QT[];
}

const TFNG_GROUP = {
  groupInstruction: "Do the statements agree with the information in the passage? Choose TRUE if it agrees, FALSE if it contradicts, or NOT GIVEN if there is no information.",
};

/* ───────────────────────────── READING ───────────────────────────── */

export const R_TFNG: Template = {
  key: "R_TFNG",
  passage: {
    kind: "reading",
    title: "The Return of the City Bee",
    paragraphs: [
      { label: "A", text: "For much of the twentieth century, honeybees were considered a countryside concern. Hives stood in orchards and meadows, and city councils saw little reason to welcome them. That view has shifted. Since the early 2000s, rooftop and balcony hives have appeared in cities across Europe and North America, tended by hobbyists and small businesses alike." },
      { label: "B", text: "Urban conditions turn out to suit bees better than many expected. Gardens, parks and street trees provide flowers that bloom at different times of the year, while cities are often a few degrees warmer than the surrounding land. In some studies, city colonies have produced more honey than rural ones, although researchers caution that results vary widely between locations." },
      { label: "C", text: "Not everyone is convinced. Some ecologists argue that adding managed hives to cities may put pressure on wild pollinators, which compete for the same flowers. They suggest that planting more flowering species would help pollinators more than adding hives would." },
      { label: "D", text: "Beekeepers reply that the two aims can go together. Many urban keepers now pair their hives with community planting projects, and several schools use hives to teach children about food and the environment." },
    ],
  },
  questions: [
    tfng("City councils welcomed honeybees throughout the twentieth century.", "FALSE", "Paragraph A says councils 'saw little reason to welcome them' — the opposite of the statement.", sk(["R.TFNG", 1], ["R.PARA", 0.5]), 1, { groupLabel: "Questions 1–4", ...TFNG_GROUP }),
    tfng("City colonies always produce more honey than rural colonies.", "FALSE", "Paragraph B says this happened 'in some studies' and that results vary widely, which contradicts 'always'.", sk(["R.TFNG", 1]), 2),
    tfng("Some ecologists think managed hives and wild pollinators compete for the same flowers.", "TRUE", "Paragraph C: ecologists argue managed hives put pressure on wild pollinators, 'which compete for the same flowers'.", sk(["R.TFNG", 1], ["R.PARA", 0.6]), 1),
    tfng("Most urban beekeepers earn their main income from selling honey.", "NOT GIVEN", "The passage mentions hobbyists and small businesses but never says how keepers earn their income.", sk(["R.TFNG", 1]), 3),
    mcq("What do many urban beekeepers now do?", ["Replace their hives with flower beds", "Pair their hives with community planting projects", "Move their hives to orchards outside the city", "Stop teaching children about food"], 1, "Paragraph D: 'Many urban keepers now pair their hives with community planting projects'.", sk(["R.MCQ", 1], ["R.SKIM", 0.4]), 1, { groupLabel: "Questions 5–6" }),
    gap("Cities are often a few degrees ___ than the surrounding land.", "warmer", "Paragraph B: 'cities are often a few degrees warmer than the surrounding land'.", sk(["R.SENT", 1], ["R.SKIM", 0.5]), 1),
  ],
};

export const R_SKIM: Template = {
  key: "R_SKIM",
  passage: {
    kind: "reading",
    title: "Night Markets of Southeast Asia",
    paragraphs: [
      { label: "A", text: "Night markets have been part of urban life in Southeast Asia for centuries, but their modern form took shape in the 1950s and 1960s, when rapid city growth pushed traders onto the streets after dark. Cooler evening temperatures made shopping more comfortable, and workers finishing late shifts provided a steady flow of customers." },
      { label: "B", text: "Today the largest markets attract remarkable crowds. Taipei's Shilin market, for instance, welcomes an estimated 30,000 visitors on a typical weekend night, and Bangkok's Rot Fai market moved to a larger site in 2015 after outgrowing its original location beside a railway line." },
      { label: "C", text: "Food remains the main attraction. Surveys in Kuala Lumpur found that 72 percent of visitors came primarily to eat, compared with just 18 percent who came mainly to shop. Stalls typically specialise in a single dish, which allows vendors to cook quickly and keep prices low." },
      { label: "D", text: "City authorities have had mixed feelings. Markets bring tourism revenue and support small family businesses, but they can also block traffic and create waste. In 2019, Ho Chi Minh City introduced a licensing scheme that limits each market to a fixed number of stalls and requires vendors to separate their rubbish." },
    ],
  },
  questions: [
    gap("The modern form of night markets developed in the 1950s and ___.", "1960s|1960's|the 1960s", "Paragraph A: 'took shape in the 1950s and 1960s'. Scan for the decade.", sk(["R.SKIM", 1]), 1, "NUMBER", { groupLabel: "Questions 1–4", groupInstruction: "Complete the sentences. Write NO MORE THAN ONE WORD AND/OR A NUMBER from the passage." }),
    gap("Shopping in the evening was more comfortable because of cooler ___.", "temperatures|temperature", "Paragraph A: 'Cooler evening temperatures made shopping more comfortable'.", sk(["R.SKIM", 0.6], ["R.SENT", 0.8]), 1),
    gap("Around ___ people visit Shilin market on a typical weekend night.", "30,000|30000|30 000", "Paragraph B gives the figure 30,000 — scan for numbers.", sk(["R.SKIM", 1]), 1, "NUMBER"),
    gap("Rot Fai market moved to a bigger site in ___.", "2015", "Paragraph B: the market moved in 2015.", sk(["R.SKIM", 1]), 1, "NUMBER"),
    mcq("According to the Kuala Lumpur survey, most visitors came mainly to", ["shop for clothes", "eat", "meet friends", "see live music"], 1, "Paragraph C: 72% came primarily to eat, against 18% to shop.", sk(["R.SKIM", 0.7], ["R.PARA", 0.6]), 2, { groupLabel: "Questions 5–8", groupInstruction: "Choose the correct letter, A, B, C or D." }),
    mcq("Why do stalls usually sell only one dish?", ["Licences only allow one dish", "Customers prefer variety", "It lets vendors cook fast and keep prices low", "Ingredients are expensive"], 2, "Paragraph C links specialising in one dish to cooking quickly and keeping prices low.", sk(["R.MCQ", 1], ["R.PARA", 0.5]), 2),
    mcq("Which problem caused by night markets is mentioned?", ["Noise at night", "Blocked traffic", "Higher rents", "Food poisoning"], 1, "Paragraph D: markets 'can also block traffic and create waste'.", sk(["R.SKIM", 0.8], ["R.MCQ", 0.5]), 2),
    mcq("What does the 2019 scheme in Ho Chi Minh City require?", ["Stalls to close by 10 pm", "Vendors to separate their rubbish", "Markets to move indoors", "Visitors to buy tickets"], 1, "Paragraph D: the scheme 'requires vendors to separate their rubbish'.", sk(["R.SKIM", 1]), 1),
  ],
};

export const R_SENT: Template = {
  key: "R_SENT",
  passage: {
    kind: "reading",
    title: "Why Teenagers Sleep Late",
    paragraphs: [
      { label: "A", text: "Parents often assume that teenagers stay up late out of habit or rebellion. Sleep scientists tell a different story. During adolescence, the body begins to release melatonin, the hormone that signals it is time to sleep, roughly two hours later than it does in childhood. As a result, many teenagers simply do not feel tired until well after 11 pm." },
      { label: "B", text: "School timetables rarely take this shift into account. When classes begin at 7.30 am, a student who falls asleep at midnight gets far less than the eight to ten hours recommended for their age group. Researchers describe the result as 'social jet lag': the body is living in one time zone while the timetable runs in another." },
      { label: "C", text: "The effects are measurable. A study of 9,000 students in the United States found that when one district moved its start time from 7.35 am to 8.55 am, attendance improved and the number of car accidents involving teenage drivers fell by 70 percent. Students also reported fewer symptoms of depression." },
      { label: "D", text: "Critics point to practical obstacles. Later starts can disrupt bus schedules shared with primary schools and leave less time for after-school sports and part-time jobs. Supporters reply that these are problems of organisation, whereas sleep loss is a problem of health." },
      { label: "E", text: "Screens make the picture more complicated. The blue light from phones and laptops delays the release of melatonin even further, so experts recommend switching devices off an hour before bed. However, they stress that screen use alone cannot explain the biological shift that every adolescent experiences." },
    ],
  },
  questions: [
    gap("During adolescence, the body produces ___ about two hours later than in childhood.", "melatonin", "Paragraph A names the hormone: melatonin.", sk(["R.SENT", 1], ["R.SKIM", 0.4]), 1, "ONE WORD", { groupLabel: "Questions 1–6", groupInstruction: "Complete the sentences. Choose NO MORE THAN TWO WORDS from the passage for each answer." }),
    gap("Many teenagers do not feel ___ until after 11 pm.", "tired", "Paragraph A: 'do not feel tired until well after 11 pm'.", sk(["R.SENT", 1]), 1),
    gap("Researchers call the mismatch between body clock and timetable social ___.", "jet lag|jetlag", "Paragraph B uses the term 'social jet lag'.", sk(["R.SENT", 1], ["R.PARA", 0.5]), 2, "TWO WORDS"),
    gap("After the later start time, school ___ improved.", "attendance", "Paragraph C: 'attendance improved'.", sk(["R.SENT", 1]), 2),
    gap("Car accidents involving teenage drivers fell by ___ percent.", "70|seventy", "Paragraph C gives 70 percent.", sk(["R.SENT", 0.6], ["R.SKIM", 0.8]), 1, "NUMBER"),
    gap("Later starts may affect ___ schedules shared with primary schools.", "bus", "Paragraph D: 'disrupt bus schedules'.", sk(["R.SENT", 1]), 2),
    gap("Critics worry about less time for after-school sports and part-time ___.", "jobs", "Paragraph D mentions 'part-time jobs'.", sk(["R.SENT", 1]), 2, "ONE WORD", { groupLabel: "Questions 7–10", groupInstruction: "Complete the summary. Choose ONE WORD ONLY from the passage." }),
    gap("Supporters say sleep loss is a problem of ___, not organisation.", "health", "Paragraph D contrasts organisation with health.", sk(["R.SENT", 1], ["R.PARA", 0.6]), 2),
    gap("Blue ___ from devices delays melatonin even further.", "light", "Paragraph E: 'The blue light from phones and laptops'.", sk(["R.SENT", 1]), 1),
    gap("Experts advise switching devices off an ___ before bed.", "hour", "Paragraph E: 'an hour before bed'.", sk(["R.SENT", 1]), 1),
  ],
};

const REMOTE_PASSAGE: Passage = {
  kind: "reading",
  title: "The Long Road to Remote Work",
  paragraphs: [
    { label: "A", text: "The idea of working away from the office is older than the internet. In 1973, an engineer named Jack Nilles coined the term 'telecommuting' while studying how to reduce traffic in Los Angeles. He calculated that if one in seven urban workers stayed home, the city would no longer need to import oil." },
    { label: "B", text: "For decades, however, technology lagged behind the vision. Early home workers relied on telephone lines and fax machines, and managers worried that staff they could not see would not work hard. As late as 2019, fewer than one in twenty employees in most European countries worked mainly from home." },
    { label: "C", text: "The pandemic of 2020 changed this almost overnight. Video-calling software that had been a niche business tool became part of daily life, and companies discovered that many tasks could be done just as well from a kitchen table. Some firms reported that productivity rose rather than fell." },
    { label: "D", text: "Not all workers benefited equally. Employees with spare rooms and fast connections adapted easily, while those sharing small flats struggled to concentrate. Younger staff in particular said they missed learning by watching experienced colleagues." },
    { label: "E", text: "The effects reached beyond offices. City-centre cafés and sandwich shops lost much of their weekday trade, while businesses in suburbs and small towns gained customers. Some city councils began converting empty office blocks into housing." },
    { label: "F", text: "Most organisations have now settled on a hybrid model, with staff in the office two or three days a week. Researchers argue the key question is no longer where people work but how teams share knowledge when they are rarely in the same place at the same time." },
  ],
};

const HEADINGS = [
  "An unequal experience",
  "A sudden turning point",
  "An idea ahead of its time",
  "A compromise and a new question",
  "Slow progress and lasting doubts",
  "Winners and losers outside the workplace",
  "The end of the office building",
  "Rising costs for employers",
];

export const R_HEAD: Template = {
  key: "R_HEAD",
  passage: REMOTE_PASSAGE,
  questions: [
    heading("Paragraph A", HEADINGS, 2, "A describes Nilles' 1973 idea long before the internet — an idea ahead of its time.", sk(["R.HEAD", 1], ["R.SKIM", 0.5]), 2, { groupLabel: "Questions 1–6", groupInstruction: "Choose the correct heading for each paragraph from the list of headings." }),
    heading("Paragraph B", HEADINGS, 4, "B: technology lagged and managers worried — slow progress and lasting doubts.", sk(["R.HEAD", 1]), 2),
    heading("Paragraph C", HEADINGS, 1, "C: the 2020 pandemic changed things 'almost overnight' — a sudden turning point.", sk(["R.HEAD", 1]), 1),
    heading("Paragraph D", HEADINGS, 0, "D: 'Not all workers benefited equally' — an unequal experience.", sk(["R.HEAD", 1], ["R.PARA", 0.5]), 2),
    heading("Paragraph E", HEADINGS, 5, "E: city cafés lost trade while suburbs gained — winners and losers outside the workplace. 'The end of the office building' goes too far.", sk(["R.HEAD", 1]), 3),
    heading("Paragraph F", HEADINGS, 3, "F: a hybrid model (compromise) and a new research question.", sk(["R.HEAD", 1]), 2),
    tfng("Jack Nilles first used the word 'telecommuting'.", "TRUE", "Paragraph A: Nilles 'coined the term telecommuting'.", sk(["R.TFNG", 1], ["R.PARA", 0.5]), 1, { groupLabel: "Questions 7–8", ...TFNG_GROUP }),
    tfng("All companies saw productivity fall in 2020.", "FALSE", "Paragraph C: some firms reported productivity rose.", sk(["R.TFNG", 1]), 2),
  ],
};

export const R_MINF: Template = {
  key: "R_MINF",
  passage: REMOTE_PASSAGE,
  questions: [
    mcq("a statistic about home working before 2020", ["A", "B", "C", "D", "E", "F"], 1, "B: fewer than one in twenty employees worked mainly from home in 2019.", sk(["R.MINF", 1], ["R.SKIM", 0.5]), 2, { groupLabel: "Questions 1–6", groupInstruction: "Which paragraph, A–F, contains the following information? You may use any letter more than once." }),
    mcq("a reference to changing the use of buildings", ["A", "B", "C", "D", "E", "F"], 4, "E: councils began converting empty office blocks into housing.", sk(["R.MINF", 1], ["R.PARA", 0.6]), 2),
    mcq("the original reason for proposing work from home", ["A", "B", "C", "D", "E", "F"], 0, "A: Nilles was studying how to reduce traffic.", sk(["R.MINF", 1]), 2),
    mcq("a difficulty faced by less experienced employees", ["A", "B", "C", "D", "E", "F"], 3, "D: younger staff missed learning by watching colleagues.", sk(["R.MINF", 1], ["R.PARA", 0.5]), 3),
    mcq("mention of a tool becoming widely used", ["A", "B", "C", "D", "E", "F"], 2, "C: video-calling software became part of daily life.", sk(["R.MINF", 1]), 2),
    mcq("a suggestion about what researchers should focus on", ["A", "B", "C", "D", "E", "F"], 5, "F: the key question is how teams share knowledge.", sk(["R.MINF", 1]), 2),
  ],
};

export const R_MCQ: Template = {
  key: "R_MCQ",
  passage: {
    kind: "reading",
    title: "Turning Seawater into Drinking Water",
    paragraphs: [
      { label: "A", text: "Almost 97 percent of the world's water is salty, so turning seawater into fresh water has long been an attractive idea. Modern desalination plants mostly use reverse osmosis, pushing seawater at high pressure through membranes that hold back salt." },
      { label: "B", text: "The method works, but it is hungry for energy. Producing a thousand litres of drinking water this way typically requires three to four kilowatt-hours of electricity, several times more than treating river water. Engineers have cut this figure by more than half since the 1990s, mainly by recovering pressure from the waste stream." },
      { label: "C", text: "The waste itself is a concern. For every litre of fresh water, plants release roughly one and a half litres of brine, twice as salty as the sea. If it is not spread carefully, this heavy liquid sinks and can harm creatures living on the sea floor." },
      { label: "D", text: "For dry coastal nations the benefits often outweigh the costs. Israel now produces most of its household water by desalination, and plants powered by solar energy are being tested in Chile and Saudi Arabia. Even so, experts warn that desalination should complement water saving, not replace it." },
    ],
  },
  questions: [
    mcq("What is the main purpose of the membranes in reverse osmosis?", ["To heat the seawater", "To stop salt passing through", "To add minerals", "To collect brine"], 1, "Paragraph A: membranes 'hold back salt'.", sk(["R.MCQ", 1]), 1, { groupLabel: "Questions 1–6", groupInstruction: "Choose the correct letter, A, B, C or D." }),
    mcq("Compared with treating river water, reverse osmosis", ["uses less energy", "uses about the same energy", "uses several times more energy", "uses no electricity"], 2, "Paragraph B: 'several times more than treating river water'.", sk(["R.MCQ", 1], ["R.PARA", 0.5]), 2),
    mcq("How have engineers mainly reduced energy use?", ["By using thinner membranes", "By recovering pressure from waste", "By building smaller plants", "By using river water"], 1, "Paragraph B: 'mainly by recovering pressure from the waste stream'.", sk(["R.MCQ", 1]), 2),
    mcq("Why can brine damage sea-floor life?", ["It is hot", "It contains chemicals", "It is heavy and sinks", "It blocks sunlight"], 2, "Paragraph C: 'this heavy liquid sinks'.", sk(["R.MCQ", 1], ["R.PARA", 0.6]), 2),
    mcq("What does the writer say about Israel?", ["It has stopped desalination", "Most household water comes from desalination", "It only uses solar-powered plants", "It exports water to Chile"], 1, "Paragraph D: Israel produces most of its household water by desalination.", sk(["R.MCQ", 1]), 1),
    mcq("What is the experts' view in the final paragraph?", ["Desalination should replace saving water", "Desalination is too expensive", "Desalination should be used alongside saving water", "Desalination will end droughts"], 2, "Paragraph D: it 'should complement water saving, not replace it'.", sk(["R.MCQ", 1], ["R.PARA", 0.7]), 3),
  ],
};

/* ───────────────────────────── LISTENING ───────────────────────────── */

export const L_FORM: Template = {
  key: "L_FORM",
  passage: {
    kind: "listening",
    title: "Section 1 · Enrolling on an evening course",
    paragraphs: [{ text: "You will hear a telephone conversation between a student and a receptionist at a community college. Complete the form. Write ONE WORD AND/OR A NUMBER for each answer." }],
    audioScript: [
      { speaker: "Receptionist", text: "Good evening, Westfield Community College, how can I help?" },
      { speaker: "Student", text: "Hi, I'd like to enrol on one of your evening courses, please. The photography one." },
      { speaker: "Receptionist", text: "Certainly. Can I take your surname first?" },
      { speaker: "Student", text: "It's Dawson. D-A-W-S-O-N." },
      { speaker: "Receptionist", text: "Thank you. And your first name?" },
      { speaker: "Student", text: "Elena." },
      { speaker: "Receptionist", text: "And what's your address, Elena?" },
      { speaker: "Student", text: "Forty-two Harbour Road, that's in Kingsley." },
      { speaker: "Receptionist", text: "Lovely. And a phone number?" },
      { speaker: "Student", text: "Yes, it's oh seven nine double four, six one eight, two three five." },
      { speaker: "Receptionist", text: "The photography course runs on Tuesdays — oh, sorry, it moved this term. It's now on Thursdays, from seven to nine." },
      { speaker: "Student", text: "Thursday is fine. How much does it cost?" },
      { speaker: "Receptionist", text: "The full fee is one hundred and twenty pounds, but students get a discount, so it would be ninety-five." },
      { speaker: "Student", text: "I'm a student, so ninety-five then. Do I need my own camera?" },
      { speaker: "Receptionist", text: "Not for the first month; we lend them. But you will need to bring a notebook to every class." },
      { speaker: "Student", text: "Okay. And where are the classes held?" },
      { speaker: "Receptionist", text: "In the Arts building, room fourteen. Parking is free after six in the car park behind the library." },
      { speaker: "Student", text: "Great. How did I hear about you? A friend recommended it." },
    ],
  },
  questions: [
    gap("Surname: ___", "Dawson", "The student spells it: D-A-W-S-O-N.", sk(["L.SPELL", 1], ["L.FORM", 0.6]), 1, "ONE WORD", { groupLabel: "Questions 1–10", groupInstruction: "Complete the form below. Write ONE WORD AND/OR A NUMBER for each answer." }),
    gap("First name: Elena · Address: 42 ___ Road, Kingsley", "Harbour|Harbor", "'Forty-two Harbour Road'.", sk(["L.FORM", 1], ["L.SPELL", 0.5]), 1),
    gap("Phone: 0794 618 ___", "235", "'oh seven nine double four, six one eight, two three five'.", sk(["L.SPELL", 1]), 2, "NUMBER"),
    gap("Day of course: ___", "Thursday|Thursdays", "Tuesday is a distractor — the receptionist corrects it to Thursdays.", sk(["L.FORM", 1], ["L.MCQ", 0.4]), 2),
    gap("Time: 7 to ___ pm", "9|nine", "'from seven to nine'.", sk(["L.FORM", 1]), 1, "NUMBER"),
    gap("Fee to pay: £___", "95|ninety-five", "The full fee is £120 but the student discount makes it £95.", sk(["L.FORM", 1], ["L.SPELL", 0.5]), 2, "NUMBER"),
    gap("Bring a ___ to every class", "notebook", "'you will need to bring a notebook to every class'. Cameras are lent.", sk(["L.FORM", 1]), 2),
    gap("Building: ___ building", "Arts|Art", "'In the Arts building'.", sk(["L.FORM", 1]), 1),
    gap("Room number: ___", "14|fourteen", "'room fourteen'.", sk(["L.SPELL", 0.8], ["L.FORM", 0.6]), 1, "NUMBER"),
    gap("Heard about the course from a ___", "friend", "'A friend recommended it.'", sk(["L.FORM", 1]), 1),
  ],
};

export const L_MAP: Template = {
  key: "L_MAP",
  passage: {
    kind: "listening",
    title: "Section 2 · A tour of Riverside Community Centre",
    paragraphs: [{ text: "You will hear a guide describing the ground floor of a community centre. Choose where each facility is located." }],
    audioScript: [
      { speaker: "Guide", text: "Welcome to Riverside Community Centre. We're standing in the main entrance hall, which faces the car park on the south side." },
      { speaker: "Guide", text: "Straight ahead of you, at the far end of the corridor, is the sports hall — it takes up the whole north side of the building." },
      { speaker: "Guide", text: "Just to your left as you come in is the reception desk, and next to reception, in the south-west corner, you'll find the café." },
      { speaker: "Guide", text: "If you turn right instead, the first door you pass is the library. Many people expect the computer room to be there too, but it's actually upstairs." },
      { speaker: "Guide", text: "Opposite the library, on the left side of the corridor, is the children's play area, so parents can keep an eye on kids from the café." },
      { speaker: "Guide", text: "The changing rooms are beside the sports hall, in the north-east corner, and the toilets are between the library and the changing rooms." },
      { speaker: "Guide", text: "Finally, the art studio is in the north-west corner, next to the sports hall, with big windows looking out onto the garden." },
    ],
  },
  questions: [
    mcq("Where is the reception desk?", ["To the left of the entrance", "To the right of the entrance", "Next to the sports hall", "Upstairs"], 0, "'Just to your left as you come in is the reception desk'.", sk(["L.MAP", 1]), 1, { groupLabel: "Questions 1–10", groupInstruction: "Choose the correct answer." }),
    mcq("Where is the café?", ["North-east corner", "South-west corner", "Opposite the library", "Above reception"], 1, "'next to reception, in the south-west corner, you'll find the café'.", sk(["L.MAP", 1]), 1),
    mcq("Which room is the first on the right?", ["Computer room", "Library", "Art studio", "Toilets"], 1, "'If you turn right instead, the first door you pass is the library.'", sk(["L.MAP", 1]), 1),
    mcq("Where is the computer room?", ["Next to the library", "Beside the café", "Upstairs", "In the sports hall"], 2, "Distractor: people expect it next to the library, but 'it's actually upstairs'.", sk(["L.MAP", 0.7], ["L.MCQ", 0.6]), 2),
    mcq("What is opposite the library?", ["The café", "The children's play area", "The changing rooms", "Reception"], 1, "'Opposite the library ... is the children's play area'.", sk(["L.MAP", 1]), 2),
    mcq("Where are the changing rooms?", ["North-east corner", "North-west corner", "South-east corner", "Next to reception"], 0, "'in the north-east corner'.", sk(["L.MAP", 1]), 2),
    mcq("Where are the toilets?", ["Next to the café", "Between the library and the changing rooms", "Upstairs", "Opposite reception"], 1, "'the toilets are between the library and the changing rooms'.", sk(["L.MAP", 1]), 2),
    mcq("Where is the art studio?", ["South-west corner", "North-west corner", "Opposite the entrance", "Beside the library"], 1, "'the art studio is in the north-west corner'.", sk(["L.MAP", 1]), 2),
    mcq("Which side of the building does the sports hall occupy?", ["South", "East", "West", "North"], 3, "'it takes up the whole north side of the building'.", sk(["L.MAP", 1]), 1),
    mcq("Why is the play area in its location?", ["It is quieter there", "Parents can watch from the café", "It is near the garden", "It is close to the toilets"], 1, "'so parents can keep an eye on kids from the café'.", sk(["L.MAP", 0.6], ["L.MCQ", 0.6]), 2),
  ],
};

export const L_MCQ: Template = {
  key: "L_MCQ",
  passage: {
    kind: "listening",
    title: "Section 3 · Planning a research project",
    paragraphs: [{ text: "You will hear two students, Tom and Aisha, discussing their research project with their tutor. Choose the correct letter, A, B or C." }],
    audioScript: [
      { speaker: "Tutor", text: "So, what topic did you finally decide on for your project?" },
      { speaker: "Aisha", text: "At first we wanted to look at plastic packaging, but there's already so much research. So we've chosen food waste in student canteens." },
      { speaker: "Tutor", text: "Good. How are you going to collect data?" },
      { speaker: "Tom", text: "We thought about interviews, but they take too long. We'll weigh the waste from three canteens every day for two weeks." },
      { speaker: "Aisha", text: "And we'll add a short online questionnaire to find out why students leave food." },
      { speaker: "Tutor", text: "What do you expect the main reason to be?" },
      { speaker: "Tom", text: "I assumed it would be portion size, but our pilot survey showed most students say the food goes cold too quickly." },
      { speaker: "Tutor", text: "Interesting. What was the hardest part of the pilot?" },
      { speaker: "Aisha", text: "Not the cost — the canteens were happy to help. It was getting permission from the university's ethics committee. That took almost a month." },
      { speaker: "Tutor", text: "And how will you present your results?" },
      { speaker: "Tom", text: "We'll use a short video for the open day, but for the assessment the department wants a written report, so that's our priority." },
      { speaker: "Tutor", text: "Who is going to do the statistics?" },
      { speaker: "Aisha", text: "Tom is better with numbers, but he's doing the video, so I'll handle the statistics and he'll check them." },
      { speaker: "Tutor", text: "When can you send me the first draft?" },
      { speaker: "Tom", text: "We said the end of March, but with the Easter break, let's say the tenth of April." },
      { speaker: "Tutor", text: "Fine. One last thing: make sure you compare your results with the national figures." },
    ],
  },
  questions: [
    mcq("What topic have the students chosen?", ["Plastic packaging", "Food waste in canteens", "Student diets"], 1, "Plastic packaging was their first idea — a distractor.", sk(["L.MCQ", 1]), 1, { groupLabel: "Questions 1–10", groupInstruction: "Choose the correct letter, A, B or C." }),
    mcq("How will they mainly collect data?", ["Interviews", "Weighing waste", "Watching students"], 1, "Interviews are rejected; they will weigh the waste.", sk(["L.MCQ", 1]), 2),
    mcq("How long will they collect data?", ["One week", "Two weeks", "One month"], 1, "'every day for two weeks'.", sk(["L.MCQ", 0.6], ["L.SPELL", 0.5]), 1),
    mcq("What reason did most students give in the pilot?", ["Portions are too big", "Food gets cold quickly", "Food is too expensive"], 1, "Tom assumed portion size — a distractor; the pilot showed food goes cold.", sk(["L.MCQ", 1]), 2),
    mcq("What was most difficult in the pilot?", ["Cost", "Canteen cooperation", "Ethics approval"], 2, "Cost is denied; ethics committee permission took a month.", sk(["L.MCQ", 1]), 2),
    mcq("What is their priority for presenting results?", ["A video", "A written report", "A poster"], 1, "The video is for open day; the report is for assessment and is the priority.", sk(["L.MCQ", 1]), 2),
    mcq("Who will do the statistics?", ["Tom", "Aisha", "The tutor"], 1, "Tom is better with numbers, but Aisha will handle them.", sk(["L.MCQ", 1]), 3),
    mcq("What will Tom do with the statistics?", ["Check them", "Present them", "Ignore them"], 0, "'he'll check them'.", sk(["L.MCQ", 0.8]), 2),
    mcq("When will the first draft be sent?", ["End of March", "Easter break", "10 April"], 2, "End of March is changed to 10 April.", sk(["L.MCQ", 1], ["L.SPELL", 0.4]), 2),
    mcq("What does the tutor advise?", ["Compare results with national figures", "Interview canteen staff", "Shorten the questionnaire"], 0, "'compare your results with the national figures'.", sk(["L.MCQ", 1]), 1),
  ],
};

export const L_LECT: Template = {
  key: "L_LECT",
  passage: {
    kind: "listening",
    title: "Section 4 · Lecture: How coral reefs survive",
    paragraphs: [{ text: "You will hear part of a lecture on coral reefs. Complete the notes. Write ONE WORD ONLY for each answer." }],
    audioScript: [
      { speaker: "Lecturer", text: "Today I want to look at how coral reefs survive in waters that are actually very poor in nutrients." },
      { speaker: "Lecturer", text: "Corals are animals, but they live in partnership with tiny algae that sit inside their tissue. The algae use sunlight to make sugars, and they pass up to ninety percent of this food to the coral." },
      { speaker: "Lecturer", text: "That's why reefs are found in shallow, clear water: the algae need light. In return, the coral gives the algae shelter and the nitrogen they need." },
      { speaker: "Lecturer", text: "The algae also give coral its colour. When water becomes too warm, the coral expels the algae and turns white — a process known as bleaching." },
      { speaker: "Lecturer", text: "Bleached coral isn't dead, but it is starving. If temperatures fall within a few weeks, the algae can return." },
      { speaker: "Lecturer", text: "Reefs also depend on fish. Parrotfish, for example, graze on seaweed that would otherwise cover the coral and block the light." },
      { speaker: "Lecturer", text: "Finally, reefs protect coastlines. They can reduce the energy of waves by up to ninety-seven percent, which is why some governments now fund reef restoration as a form of flood defence." },
      { speaker: "Lecturer", text: "Restoration usually means growing young coral in underwater nurseries and then attaching it to damaged reefs." },
    ],
  },
  questions: [
    gap("Corals live in partnership with tiny ___ inside their tissue.", "algae", "'they live in partnership with tiny algae'.", sk(["L.LECT", 1]), 1, "ONE WORD", { groupLabel: "Questions 1–10", groupInstruction: "Complete the notes below. Write ONE WORD AND/OR A NUMBER for each answer." }),
    gap("The algae use ___ to make sugars.", "sunlight|light", "'The algae use sunlight to make sugars'.", sk(["L.LECT", 1]), 1),
    gap("Up to ___ percent of the food goes to the coral.", "90|ninety", "'up to ninety percent'.", sk(["L.LECT", 0.7], ["L.SPELL", 0.6]), 1, "NUMBER"),
    gap("Reefs are found in shallow, ___ water.", "clear", "'shallow, clear water'.", sk(["L.LECT", 1]), 2),
    gap("The coral provides shelter and ___ for the algae.", "nitrogen", "'shelter and the nitrogen they need'.", sk(["L.LECT", 1]), 2),
    gap("Warm water causes coral to turn white: this is called ___.", "bleaching", "'a process known as bleaching'.", sk(["L.LECT", 1]), 2),
    gap("Bleached coral is not dead but is ___.", "starving", "'it is starving'.", sk(["L.LECT", 1]), 2),
    gap("Parrotfish eat ___ that could block the light.", "seaweed", "'graze on seaweed'.", sk(["L.LECT", 1]), 2),
    gap("Reefs reduce wave energy by up to ___ percent.", "97|ninety-seven", "'up to ninety-seven percent'.", sk(["L.LECT", 0.7], ["L.SPELL", 0.7]), 2, "NUMBER"),
    gap("Young coral is grown in underwater ___.", "nurseries|nursery", "'growing young coral in underwater nurseries'.", sk(["L.LECT", 1]), 2),
  ],
};

/* ───────────────────────────── WRITING (objective) ───────────────────────────── */

export const W_T1: Template = {
  key: "W_T1",
  passage: {
    kind: "writing",
    title: "Task 1 language · Cinema visits, 2000–2020",
    paragraphs: [
      { text: "The line graph shows the average number of cinema visits per person per year in three countries between 2000 and 2020." },
      { text: "Country A: 2.0 (2000) → 3.5 (2010) → 3.4 (2020). Country B: 4.0 (2000) → 2.5 (2010) → 1.5 (2020). Country C: 1.0 (2000) → 1.1 (2010) → 3.0 (2020)." },
      { text: "Choose the most accurate language to describe the data." },
    ],
  },
  questions: [
    mcq("Country A between 2000 and 2010: visits ___.", ["rose sharply", "rose slightly", "remained stable", "fell gradually"], 0, "2.0 → 3.5 is a 75% increase: 'rose sharply'.", sk(["W.T1", 1]), 1, { groupLabel: "Questions 1–8", groupInstruction: "Choose the best option to complete each sentence." }),
    mcq("Country A between 2010 and 2020: visits ___.", ["plummeted", "levelled off", "doubled", "fluctuated wildly"], 1, "3.5 → 3.4 is almost no change: 'levelled off'.", sk(["W.T1", 1]), 2),
    mcq("Country B showed ___ over the whole period.", ["a steady decline", "a sudden peak", "a slight recovery", "no change"], 0, "4.0 → 2.5 → 1.5: a steady decline.", sk(["W.T1", 1]), 1),
    mcq("Which sentence about Country C is accurate?", ["Visits rose dramatically throughout the period.", "Visits were flat until 2010 and then almost tripled.", "Visits fell after 2010.", "Visits doubled between 2000 and 2010."], 1, "1.0 → 1.1 is flat; 1.1 → 3.0 is almost triple.", sk(["W.T1", 1]), 2),
    mcq("Choose the best overview sentence.", ["In 2000 Country B had 4 visits per person.", "Overall, cinema-going rose in A and C but fell in B, which went from highest to lowest.", "Country C increased by 1.9 between 2010 and 2020.", "Cinemas are popular in many countries."], 1, "An overview summarises main trends without detailed figures.", sk(["W.T1OV", 1], ["W.T1", 0.4]), 2),
    mcq("'There was a ___ in Country B's figures.' Choose the correct noun.", ["decrease", "decreasing", "decreased", "decreasingly"], 0, "After 'a' we need a noun: 'a decrease'.", sk(["W.T1", 0.8], ["V.COLL", 0.5]), 1),
    mcq("Which phrase correctly compares A and B in 2020?", ["A was more than twice as high as B.", "A was more twice than B.", "A was double of B.", "A was higher as B."], 0, "3.4 vs 1.5: 'more than twice as high as'.", sk(["W.T1", 1]), 3),
    mcq("The figure for C in 2020 was ___ that of A.", ["slightly lower than", "much higher than", "the same as", "far below"], 0, "3.0 vs 3.4: slightly lower than.", sk(["W.T1", 1]), 2),
  ],
};

export const W_T1OV: Template = {
  key: "W_T1OV",
  passage: {
    kind: "writing",
    title: "Task 1 · Writing the overview",
    paragraphs: [
      { text: "The bar chart compares how students at one university travelled to campus in 2010 and 2020. Car: 45% → 20%. Bus: 25% → 30%. Bicycle: 10% → 30%. Walking: 20% → 20%." },
      { text: "A good overview names the biggest changes and any clear pattern, with no detailed numbers." },
    ],
  },
  questions: [
    mcq("Which is the best overview?", ["Car use fell from 45% to 20%.", "Overall, driving became far less common while cycling rose sharply, and walking stayed the same.", "The chart has four kinds of transport.", "Students should cycle more."], 1, "It covers the main trends and contains no detailed figures.", sk(["W.T1OV", 1]), 1, { groupLabel: "Questions 1–6", groupInstruction: "Choose the correct answer." }),
    mcq("Where should the overview usually appear?", ["Only in the conclusion", "After the introduction or at the end", "In every paragraph", "It is optional"], 1, "Examiners accept it after the introduction or at the end; it is required for Band 6+ in Task Achievement.", sk(["W.T1OV", 1]), 2),
    mcq("Which word best links two contrasting trends?", ["Moreover", "Whereas", "Therefore", "For instance"], 1, "'Whereas' contrasts two clauses.", sk(["W.COH", 1], ["W.T1OV", 0.4]), 1),
    mcq("Which sentence contains an inaccuracy?", ["Walking remained unchanged.", "Bus use rose slightly.", "Cycling tripled.", "Car use doubled."], 3, "Car use halved; it did not double.", sk(["W.T1", 1]), 2),
    mcq("Which introduction paraphrases the task best?", ["The bar chart compares how students at one university travelled to campus in 2010 and 2020.", "The chart illustrates the proportions of students using four modes of transport to reach a university in 2010 and 2020.", "This is about transport.", "Here is a chart of cars and buses."], 1, "It paraphrases the task instead of copying it.", sk(["W.T1OV", 0.8]), 2),
    mcq("By 2020, which two modes were equally popular?", ["Car and walking", "Bus and bicycle", "Walking and bus", "Car and bicycle"], 1, "Bus and bicycle were both 30%.", sk(["W.T1", 1]), 1),
  ],
};

export const W_T2: Template = {
  key: "W_T2",
  passage: {
    kind: "writing",
    title: "Task 2 · Cohesion and accuracy",
    paragraphs: [
      { text: "Essay question: Some people believe that university education should be free for everyone. To what extent do you agree or disagree?" },
      { text: "Choose the option that makes each sentence accurate, cohesive and academic." },
    ],
  },
  questions: [
    mcq("Free tuition would widen access. ___, it may reduce the quality of teaching if funding falls.", ["However", "Furthermore", "As a result", "For example"], 0, "The second idea contrasts with the first: 'However'.", sk(["W.COH", 1]), 1, { groupLabel: "Questions 1–8", groupInstruction: "Choose the best option." }),
    mcq("Which thesis statement answers 'to what extent'?", ["University is important.", "I partly agree: tuition should be free for low-income students, but not for everyone.", "There are many views on this.", "Education is a human right."], 1, "It states a clear, qualified position.", sk(["W.T2", 1]), 2),
    mcq("Not only ___ graduates, but they also pay more tax.", ["do they earn more", "they earn more", "they do earn more", "earn they more"], 0, "After 'Not only' at the start we invert: 'do they earn'.", sk(["G.INV", 1]), 3),
    mcq("If the government ___ invested in universities, fewer students would have left.", ["has", "had", "would have", "will"], 1, "Third conditional: If + had + past participle.", sk(["G.COND3", 1]), 2),
    mcq("Choose the natural collocation: rising fees ___ a serious threat to equality.", ["make", "pose", "do", "give"], 1, "'pose a threat' is the standard collocation.", sk(["V.COLL", 1]), 2),
    mcq("Which sentence uses reference correctly?", ["Governments fund schools. This funding comes from taxes.", "Governments fund schools. It comes from taxes, they.", "Governments fund schools. Which comes from taxes.", "Governments fund schools. Those comes from taxes."], 0, "'This funding' clearly refers back to the previous idea.", sk(["W.COH", 1]), 2),
    mcq("Which body-paragraph order is most logical?", ["Example → Topic sentence → Explanation", "Topic sentence → Explanation → Example", "Explanation → Example → Topic sentence", "Example → Example → Topic sentence"], 1, "Topic sentence first, then develop and support.", sk(["W.T2", 1]), 1),
    mcq("Rarely ___ such a clear link between education and income.", ["we have seen", "have we seen", "we saw", "seen we have"], 1, "Negative adverbial 'Rarely' triggers inversion: 'have we seen'.", sk(["G.INV", 1]), 3),
  ],
};

export const W_GRAM: Template = {
  key: "W_GRAM",
  passage: {
    kind: "writing",
    title: "Grammar & vocabulary for Band 7",
    paragraphs: [{ text: "Error recognition: each sentence may contain a problem with grammar or word choice. Choose the corrected version." }],
  },
  questions: [
    mcq("If I would have studied harder, I would have passed.", ["If I had studied harder, I would have passed.", "If I studied harder, I would pass.", "If I have studied harder, I would have passed.", "No change"], 0, "Third conditional uses 'had + past participle' in the if-clause.", sk(["G.COND3", 1]), 2, { groupLabel: "Questions 1–6", groupInstruction: "Choose the correct version of each sentence." }),
    mcq("Never I have seen such a crowded city.", ["Never have I seen such a crowded city.", "Never I saw such a crowded city.", "I never have seen such a crowded city never.", "No change"], 0, "Inversion after 'Never': 'Never have I seen'.", sk(["G.INV", 1]), 2),
    mcq("The government should make an effort to do more attention to rural schools.", ["pay more attention to", "give more attention at", "make more attention to", "No change"], 0, "Collocation: 'pay attention to'.", sk(["V.COLL", 1]), 2),
    mcq("Had the bridge been inspected, the accident would not happen.", ["would not have happened", "will not happen", "had not happened", "No change"], 0, "Inverted third conditional still needs 'would have + past participle'.", sk(["G.COND3", 1], ["G.INV", 0.5]), 3),
    mcq("Only after the results were published the public realised the risk.", ["did the public realise", "the public did realise", "realised the public", "No change"], 0, "'Only after ...' at the start inverts the main clause.", sk(["G.INV", 1]), 3),
    mcq("Pollution has a big effect for health.", ["a significant impact on health", "a big impact at health", "a large affect on health", "No change"], 0, "Natural academic collocation: 'a significant impact on'.", sk(["V.COLL", 1]), 1),
  ],
};

/* ───────────────────────────── SPEAKING (objective) ───────────────────────────── */

export const S_P1: Template = {
  key: "S_P1",
  passage: {
    kind: "speaking",
    title: "Part 1 · Extending your answers",
    paragraphs: [
      { text: "In Part 1 the examiner asks short questions about familiar topics. Strong answers give a direct reply, a reason and a short example or detail — usually two or three sentences." },
      { text: "Choose the response or phrase that would score best for Fluency & Coherence and Lexical Resource." },
    ],
  },
  questions: [
    mcq("Examiner: 'Do you like cooking?'", ["Yes.", "Yes, I do. It helps me relax after work, and at weekends I usually try a new noodle recipe.", "Cooking is the process of preparing food using heat.", "Yes, yes, I like, I like cooking very much very much."], 1, "Direct answer + reason + example, natural and fluent.", sk(["S.P1", 1]), 1, { groupLabel: "Questions 1–6", groupInstruction: "Choose the best option." }),
    mcq("Examiner: 'Is your hometown a good place for young people?'", ["Not really, to be honest. There aren't many jobs, so most of my friends have moved to the city.", "My hometown is a town.", "I don't know.", "Young people are people who are young."], 0, "Gives a clear opinion and a reason with a consequence.", sk(["S.P1", 1], ["S.DM", 0.4]), 1),
    mcq("Which phrase buys thinking time naturally?", ["Ummmmmm.", "That's an interesting question — I've never really thought about it, but…", "Can you repeat the question five times?", "I don't understand anything."], 1, "A natural filler keeps fluency without long silence.", sk(["S.DM", 1]), 1),
    mcq("Which answer is too short for Part 1?", ["Mostly at the weekend, because I'm too busy on weekdays.", "No.", "I'd say so — especially in summer when the parks are full.", "Not as often as I'd like, unfortunately."], 1, "One-word answers limit your fluency score.", sk(["S.P1", 1]), 1),
    mcq("Examiner: 'What do you do in your free time?' Choose the best linking phrase: 'I mostly play badminton. ___ I've started learning the guitar.'", ["On top of that,", "In conclusion,", "Firstly,", "Nevertheless,"], 0, "'On top of that' adds a point naturally in speech.", sk(["S.DM", 1]), 2),
    mcq("Which response uses the most natural spoken style?", ["Furthermore, it is evident that I enjoy music.", "I'm really into music, actually — mainly jazz.", "Music: enjoyable.", "As stated previously, music."], 1, "Spoken English uses informal, natural phrases.", sk(["S.P1", 0.8], ["S.DM", 0.5]), 2),
  ],
};

export const S_P2: Template = {
  key: "S_P2",
  passage: {
    kind: "speaking",
    title: "Part 2 · Cue card: Describe a place you visited that was crowded",
    paragraphs: [
      { text: "You should say: where it was · when you went there · why it was crowded · and explain how you felt about being there." },
      { text: "You have one minute to prepare and should speak for one to two minutes." },
    ],
  },
  questions: [
    mcq("How should you use the one-minute preparation time?", ["Write full sentences", "Note keywords for each cue point", "Stay silent and memorise", "Ask the examiner for ideas"], 1, "Keywords are fast to write and easy to glance at.", sk(["S.P2", 1]), 1, { groupLabel: "Questions 1–6", groupInstruction: "Choose the best option." }),
    mcq("Which opening sentence is best?", ["Crowded.", "I'd like to talk about Ben Thanh Market in Ho Chi Minh City, which I visited last Tết.", "Can I talk about something else?", "Places are sometimes crowded."], 1, "It names the place and time, signposting the talk.", sk(["S.P2", 1], ["S.DM", 0.4]), 1),
    mcq("What is the best order for your talk?", ["Feelings → where → when → why", "Where → when → why → feelings", "Why → feelings → where", "Only feelings"], 1, "Follow the cue card order so nothing is missed.", sk(["S.P2", 1]), 1),
    mcq("Which phrase moves to the final cue point smoothly?", ["As for how I felt, …", "Next question.", "Finally, the end.", "I stop now."], 0, "'As for …' introduces a new point naturally.", sk(["S.DM", 1], ["S.P2", 0.5]), 2),
    mcq("If you finish after 50 seconds, you should…", ["Stop and wait", "Add more detail or a short story about the visit", "Repeat your first sentence", "Ask the examiner a question"], 1, "Extend with detail; aim for close to two minutes.", sk(["S.P2", 1]), 2),
    mcq("Which sentence shows a wider range of vocabulary?", ["It was very very crowded.", "It was absolutely packed — you could barely move between the stalls.", "There were many people there.", "It was a lot of people."], 1, "Idiomatic 'packed' and 'barely move' show lexical range.", sk(["S.P2", 0.6], ["V.COLL", 0.5]), 2),
  ],
};

export const S_P3: Template = {
  key: "S_P3",
  passage: {
    kind: "speaking",
    title: "Part 3 · Discussing abstract topics",
    paragraphs: [{ text: "Part 3 questions ask you to compare, evaluate and speculate. Choose the strongest response or phrase." }],
  },
  questions: [
    mcq("Examiner: 'Why do cities become crowded?'", ["Because.", "Mainly because of jobs. Big companies are based in cities, so people move there for better salaries, which in turn pushes up housing demand.", "Cities are big.", "I don't live in a city."], 1, "Explains a cause and a consequence with linking.", sk(["S.P3", 1]), 1, { groupLabel: "Questions 1–6", groupInstruction: "Choose the best option." }),
    mcq("Which phrase is best for speculating about the future?", ["It will definitely happen 100%.", "I imagine that in twenty years' time, more people might work from smaller towns.", "Future is future.", "Nobody knows nothing."], 1, "Hedging language ('I imagine', 'might') fits speculation.", sk(["S.P3", 1]), 2),
    mcq("Which response compares two things well?", ["Old people and young people.", "Whereas older people tend to value stability, younger people are often more willing to move for opportunities.", "Young is better.", "They are same."], 1, "'Whereas' contrasts two groups clearly.", sk(["S.P3", 1], ["S.DM", 0.5]), 2),
    mcq("How can you show the opposite side of an argument?", ["Saying 'no' repeatedly", "'Having said that, there are some drawbacks…'", "Changing the topic", "Staying silent"], 1, "'Having said that' introduces a counterpoint.", sk(["S.DM", 1]), 2),
    mcq("Examiner: 'Should governments limit the number of cars?' Best start:", ["Yes or no.", "To some extent, yes — at least in city centres, where pollution is worst.", "Cars have four wheels.", "I have a car."], 1, "A qualified opinion with a reason.", sk(["S.P3", 1]), 2),
    mcq("Which answer gives a specific supporting example?", ["Many things show this.", "For instance, Singapore charges drivers to enter the centre, and traffic there has dropped noticeably.", "Examples exist.", "It is true for everyone."], 1, "A concrete example supports the point.", sk(["S.P3", 1]), 2),
  ],
};

export const S_PRON: Template = {
  key: "S_PRON",
  passage: {
    kind: "speaking",
    title: "Pronunciation · Word and sentence stress",
    paragraphs: [{ text: "Stressed syllables are shown in CAPITALS. Choose the correct stress pattern or the word that should carry the main stress. Use the 'Listen' button to hear the sentence." }],
    audioScript: [
      { text: "photograph. photographer. photographic." },
      { text: "I didn't say she stole the money." },
    ],
  },
  questions: [
    mcq("photographer", ["PHO-to-gra-pher", "pho-TO-gra-pher", "pho-to-GRA-pher", "pho-to-gra-PHER"], 1, "Words ending in -er from 'photograph' shift stress: pho-TO-gra-pher.", sk(["S.PRON", 1]), 2, { groupLabel: "Questions 1–6", groupInstruction: "Choose the correct answer." }),
    mcq("economic", ["E-co-no-mic", "e-CO-no-mic", "e-co-NO-mic", "e-co-no-MIC"], 2, "Words ending in -ic stress the syllable before: e-co-NO-mic.", sk(["S.PRON", 1]), 2),
    mcq("Which word is usually stressed in: 'I'd like a cup of TEA, please'?", ["I'd", "a", "of", "tea"], 3, "Content words (nouns) carry stress; function words are weak.", sk(["S.PRON", 1]), 1),
    mcq("'record' as a verb is pronounced", ["RE-cord", "re-CORD"], 1, "Two-syllable noun/verb pairs: nouns stress the first syllable, verbs the second.", sk(["S.PRON", 1]), 2),
    mcq("To mean 'someone ELSE said it', which word gets contrastive stress? 'I didn't say she stole the money.'", ["I", "say", "she", "money"], 0, "Stressing 'I' implies another person said it.", sk(["S.PRON", 1], ["S.DM", 0.3]), 3),
    mcq("Which linking sounds most natural in fast speech? 'an apple'", ["an | apple (pause)", "a-napple", "and apple", "a apple"], 1, "Consonant-to-vowel linking: 'a-napple'.", sk(["S.PRON", 1]), 2),
  ],
};

export const TEMPLATES: Record<string, Template> = Object.fromEntries(
  [R_TFNG, R_SKIM, R_SENT, R_HEAD, R_MINF, R_MCQ, L_FORM, L_MAP, L_MCQ, L_LECT, W_T1, W_T1OV, W_T2, W_GRAM, S_P1, S_P2, S_P3, S_PRON].map((t) => [t.key, t]),
);
