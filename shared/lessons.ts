// Contenido educativo (en inglés, para estudiantes): quiénes fueron los pueblos del juego,
// notas históricas de sus unidades y las preguntas para avanzar de era.
// Los datos históricos son simples pero correctos; si se agrega algo, que sea verificable.

import type { FactionId, UnitType } from './data.ts';

export interface PeopleCard {
  /** Cuándo y dónde. */
  when: string;
  where: string;
  /** Un líder famoso. */
  leader: string;
  /** Cómo peleaban. */
  war: string;
  /** Un dato curioso. */
  fact: string;
  /** Lo que nos dejaron. */
  legacy: string;
}

export const PEOPLE_HISTORY: Record<FactionId, PeopleCard> = {
  romans: {
    when: 'From about 500 BC to AD 476 (the Western Empire)',
    where: 'Rome, in Italy, and then all around the Mediterranean Sea',
    leader: 'Julius Caesar conquered Gaul; Augustus became the first emperor in 27 BC.',
    war: 'Professional soldiers called legionaries fought in tight lines with big shields, short swords and javelins.',
    fact: 'Legionaries carried all their own equipment on long marches, so people called them "Marius\' mules".',
    legacy: 'Latin, the language of Rome, became Spanish, French, Italian, Portuguese and Romanian. Romans also built roads, aqueducts and bridges that still stand.',
  },
  mongols: {
    when: 'From AD 1206, when Genghis Khan united the tribes, to the 1300s',
    where: 'The grasslands (steppe) of Mongolia, then from China to Eastern Europe',
    leader: 'Genghis Khan founded the empire; his grandson Kublai Khan ruled China.',
    war: 'Almost every warrior was a rider and an archer: they shot arrows while galloping and each one had several horses.',
    fact: 'They created the Yam, a chain of relay stations where messengers changed horses to carry news very fast.',
    legacy: 'They built the largest land empire in history and connected trade between Europe and Asia along the Silk Road.',
  },
  gauls: {
    when: 'From about 500 BC until Rome conquered them in 50 BC',
    where: 'Gaul: today France, Belgium and the north of Italy',
    leader: 'Vercingetorix united the Gauls against Julius Caesar and was defeated at Alesia in 52 BC.',
    war: 'Brave warriors with long iron swords, large shields and war chariots, led by noble chiefs.',
    fact: 'Their priests and wise men were called druids. Celtic smiths are often credited with inventing chain mail.',
    legacy: 'Many French place names are Celtic, and Gaulish craftsmen were famous for metalwork and wooden barrels.',
  },
  germans: {
    when: 'From about 100 BC to AD 500',
    where: 'The forests of central and northern Europe, beyond the Rhine river',
    leader: 'Arminius destroyed three Roman legions in the Teutoburg Forest in AD 9.',
    war: 'Tribes of warriors with spears and shields who used the forests to ambush their enemies.',
    fact: 'After the Teutoburg Forest, Rome never again tried to conquer the lands east of the Rhine.',
    legacy: 'English, German and Dutch are Germanic languages, and Germanic peoples like the Franks founded new kingdoms in Europe.',
  },
  visigoths: {
    when: 'From the AD 300s to AD 711',
    where: 'First near the Danube river, then in Hispania (today Spain and Portugal)',
    leader: 'King Alaric captured and sacked the city of Rome in AD 410.',
    war: 'Strong cavalry and armored warriors: in AD 378 they defeated a Roman army at Adrianople.',
    fact: 'Their name means "Western Goths". Their kingdom in Hispania had its capital in Toledo.',
    legacy: 'They mixed Roman law with their own customs, and many Spanish names come from them.',
  },
  ostrogoths: {
    when: 'From the AD 300s to AD 553',
    where: 'North of the Black Sea, then Italy',
    leader: 'Theodoric the Great ruled Italy from AD 493 to 526 from the city of Ravenna.',
    war: 'Gothic horsemen charged with long lances, supported by spearmen on foot.',
    fact: 'Their name means "Eastern Goths". Theodoric kept Roman laws and Roman officials in his kingdom.',
    legacy: 'Beautiful buildings from Theodoric\'s time still stand in Ravenna, Italy.',
  },
  vikings: {
    when: 'The Viking Age: from about AD 793 to 1066',
    where: 'Scandinavia: today Norway, Sweden and Denmark',
    leader: 'Leif Erikson sailed to North America around AD 1000, long before Columbus.',
    war: 'Raiders and traders who sailed fast longships, fought with axes, swords and round shields.',
    fact: 'Viking helmets did NOT have horns: that is a myth from paintings and operas of the 1800s.',
    legacy: 'English words like "sky", "egg" and "knife" come from Old Norse, the Vikings\' language.',
  },
};

/** Una línea de historia para las unidades únicas (y algunas comunes). */
export const UNIT_HISTORY: Partial<Record<UnitType, string>> = {
  spearman: 'Spears were the most common weapon of ancient and medieval armies: a wall of spears could stop horses.',
  swordsman: 'Swords were expensive, so swordsmen were often better trained and better armored soldiers.',
  archer: 'Archers could shoot many arrows a minute; good archers trained for years.',
  knight: 'Heavy horsemen in armor: a charge of knights could break enemy lines.',
  legionary: 'Roman legionaries served for 20 to 25 years and fought with a short sword (gladius) and a big shield (scutum).',
  scorpion: 'The scorpion was a Roman bolt-thrower, like a giant crossbow on a stand.',
  triarius: 'The triarii were the veterans of the third line. Romans said "it has come down to the triarii" when things got desperate.',
  horse_archer: 'Mongol riders used short, powerful composite bows and could shoot in every direction from the saddle.',
  keshig: 'The keshig was the personal guard of Genghis Khan: his most loyal warriors.',
  trebuchet: 'The Mongols brought engineers from China and Persia to build siege engines like the trebuchet.',
  fanatic: 'Ancient writers tell of Celtic warriors who charged into battle without armor to show their courage.',
  chosen_swordsman: 'Celtic warriors fought with long iron swords made by skilled smiths.',
  war_chariot: 'Celtic chariots carried a driver and a warrior; Britons still used them against Julius Caesar.',
  chosen_spearman: 'The Roman writer Tacitus described the framea, a short spear used by Germanic warriors.',
  axe_thrower: 'The Franks, a Germanic people, threw axes called franciscas just before charging.',
  chosen_axeman: 'Germanic warriors used axes both as tools and as weapons.',
  gothic_knight: 'At Adrianople in AD 378 the Gothic cavalry helped defeat a Roman army and its emperor.',
  armored_archer: 'Visigothic soldiers often combined armor with bows and javelins.',
  javelin_rider: 'Light horsemen threw javelins and rode away before the enemy could reach them.',
  gothic_lancer: 'The Byzantine historian Procopius described Gothic horsemen charging with long lances.',
  heavy_spearman: 'Gothic spearmen on foot protected their cavalry from enemy charges.',
  gothic_warband: 'Gothic warbands were groups of warriors loyal to a chief.',
  berserker: 'Berserkers were Norse warriors said to fight in a wild fury. The name may mean "bear shirt".',
  huscarl: 'Huscarls were the household guards of Norse and English lords; they fought at Hastings in 1066.',
  ulfhednar: 'The ulfhednar ("wolf coats") were warriors linked to Odin who wore wolf skins.',
};

/** Pregunta de opción múltiple: la primera respuesta es la correcta (se mezclan al mostrarla). */
export interface QuizQuestion {
  q: string;
  a: string[];
  /** Dato para aprender después de contestar. */
  fact?: string;
}

/** Preguntas para avanzar a cada era (2 = Medieval, 3 = Industrial, 4 = Moderna). */
export const QUIZ_BANK: Record<number, QuizQuestion[]> = {
  2: [
    { q: 'Which empire spoke Latin and built roads all over Europe?', a: ['The Romans', 'The Mongols', 'The Vikings'], fact: 'Spanish, French and Italian all come from Latin.' },
    { q: 'Who united the Mongol tribes in 1206?', a: ['Genghis Khan', 'Julius Caesar', 'Theodoric the Great'], fact: 'The Mongol Empire became the largest land empire in history.' },
    { q: 'Which Gaul leader fought against Julius Caesar at Alesia?', a: ['Vercingetorix', 'Arminius', 'Alaric'], fact: 'Caesar won at Alesia in 52 BC and Gaul became part of Rome.' },
    { q: 'In AD 9, Arminius defeated three Roman legions in which forest?', a: ['The Teutoburg Forest', 'Sherwood Forest', 'The Amazon rainforest'], fact: 'After this battle, Rome never conquered the lands east of the Rhine.' },
    { q: 'Which people sacked the city of Rome in AD 410 under King Alaric?', a: ['The Visigoths', 'The Mongols', 'The Vikings'], fact: '"Visigoths" means "Western Goths".' },
    { q: 'Theodoric the Great ruled which land?', a: ['Italy', 'Iceland', 'Mongolia'], fact: 'He ruled from the city of Ravenna, where his buildings still stand.' },
    { q: 'What were the fast ships of the Vikings called?', a: ['Longships', 'Galleons', 'Submarines'], fact: 'Longships could sail on the open sea and up shallow rivers.' },
    { q: 'Did Viking helmets have horns?', a: ['No, that is a myth', 'Yes, always', 'Only on Sundays'], fact: 'The horned helmet idea comes from paintings and operas of the 1800s.' },
    { q: 'Which group reached North America around AD 1000?', a: ['The Vikings', 'The Romans', 'The Gauls'], fact: 'Leif Erikson landed in a place he called Vinland.' },
    { q: 'Mongol warriors were famous for…', a: ['shooting arrows while riding', 'building pyramids', 'sailing longships'], fact: 'Each Mongol warrior had several horses so they could change and keep riding.' },
    { q: 'When did the Western Roman Empire fall?', a: ['AD 476', 'AD 1492', '44 BC'], fact: 'The Eastern Roman (Byzantine) Empire lasted until 1453.' },
    { q: 'The Visigoths later built a kingdom in…', a: ['Hispania (Spain and Portugal)', 'Scandinavia', 'China'], fact: 'Their capital was Toledo.' },
    { q: 'In this game, which soldiers are best against cavalry?', a: ['Spearmen', 'Swordsmen', 'Workers'], fact: 'A wall of spears stops a charge. But swordsmen beat spearmen!' },
    { q: 'In this game, which soldiers beat spearmen?', a: ['Swordsmen', 'Knights', 'Workers'], fact: 'Rock, paper, scissors: spears beat cavalry, cavalry beats swords, swords beat spears.' },
    { q: 'What were the priests and wise men of the Gauls called?', a: ['Druids', 'Samurai', 'Pharaohs'], fact: 'Druids were judges, teachers and priests.' },
  ],
  3: [
    { q: 'Which machine powered the Industrial Revolution?', a: ['The steam engine', 'The sundial', 'The catapult'], fact: 'James Watt improved the steam engine in the 1760s and 1770s.' },
    { q: 'In which country did the Industrial Revolution begin?', a: ['Great Britain', 'Mongolia', 'Peru'], fact: 'It started in the 1700s with textile factories and coal mines.' },
    { q: 'Who built the first printing press with movable type in Europe, around 1440?', a: ['Johannes Gutenberg', 'Napoleon', 'Genghis Khan'], fact: 'Books became cheaper and many more people learned to read.' },
    { q: 'Napoleon Bonaparte was the emperor of…', a: ['France', 'Japan', 'Brazil'], fact: 'He was defeated at the Battle of Waterloo in 1815.' },
    { q: 'Where was gunpowder first invented?', a: ['China', 'France', 'Norway'], fact: 'Chinese alchemists discovered it more than 1,000 years ago.' },
    { q: 'What did factories use to make things faster?', a: ['Machines', 'Only hand tools', 'Magic spells'], fact: 'Machines made cloth, tools and engines much faster than by hand.' },
  ],
  4: [
    { q: 'Who made the first powered airplane flight, in 1903?', a: ['The Wright brothers', 'Leonardo da Vinci', 'Marco Polo'], fact: 'Their first flight lasted only 12 seconds.' },
    { q: 'Tanks were first used in which war?', a: ['World War I', 'The Viking raids', 'The Punic Wars'], fact: 'British tanks first went into battle in 1916.' },
    { q: 'In which year did World War II end?', a: ['1945', '1815', '1492'], fact: 'After the war, countries created the United Nations to keep the peace.' },
    { q: 'What does radar help to do?', a: ['Detect airplanes far away', 'Cook food', 'Build roads'], fact: 'Radar uses radio waves that bounce back from objects.' },
  ],
};

/** Una pregunta propia del profesor (validada): texto y entre 2 y 4 respuestas, la primera es la correcta. */
export const QUIZ_LIMITS = { questions: 60, q: 200, a: 80 };

/** Lee las preguntas del profesor: una por línea, "Pregunta | correcta | incorrecta | incorrecta". */
export function parseQuizText(text: string): QuizQuestion[] {
  const out: QuizQuestion[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split('|').map((s) => s.trim()).filter(Boolean);
    if (parts.length < 3) continue;
    out.push({ q: parts[0].slice(0, QUIZ_LIMITS.q), a: parts.slice(1, 5).map((s) => s.slice(0, QUIZ_LIMITS.a)) });
    if (out.length >= QUIZ_LIMITS.questions) break;
  }
  return out;
}
