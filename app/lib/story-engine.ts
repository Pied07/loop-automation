// Native TypeScript implementation of the Story & Script Engine
// Zero Python or binary dependency — runs instantly in Node.js and Vercel Serverless

export interface StoryScene {
  scene_index: number;
  text: string;
  visual_prompt: string;
}

export interface StoryPart {
  partNumber: number;
  title: string;
  script: string;
  sentences: string[];
  scenes: StoryScene[];
  isLastPart: boolean;
}

export interface StoryResult {
  category: string;
  overallTitle: string;
  numParts: number;
  durationPerPart: number;
  parts: StoryPart[];
  factId?: string;
  source?: string;
}

/**
 * Synthesizes a clean, high-fidelity visual prompt for a scene image,
 * systematically stripping conversational filler and quantity multipliers (e.g. 'eighteen times', '300 doors')
 * that trigger facial warping or feature duplication in diffusion models,
 * and anchoring anatomical symmetry.
 */
export function buildCleanVisualPrompt(
  sceneText: string,
  fallbackSubject: string,
  styleDescriptor: string
): string {
  let clean = sceneText
    .replace(/\b(?:Part\s+\d+|Welcome back to Part\s+\d+|Follow for Part\s+\d+|Watch Part\s+\d+|Save this video|follow for your daily drive|follow for more|subscribe|share this|comment below)[^.]*/gi, "")
    // Strip quantity multipliers like 'eighteen times', '300 doors' that confuse cross-attention into duplicating eyes/limbs
    .replace(/\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|eighteen|twenty|thirty|forty|fifty|hundred|thousand|million)\s+(?:times|doors|days|hours|years|copies|rejections)\b/gi, "")
    .replace(/["'*_#`~]/g, " ")
    .replace(/[^a-zA-Z0-9\s,.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (clean.length < 12) {
    clean = fallbackSubject;
  } else {
    const sentences = clean.split(/[.!?]/).map((s) => s.trim()).filter((s) => s.length > 8);
    clean = sentences[0] || clean;
    if (clean.length > 120) {
      clean = clean.slice(0, 120).replace(/\s+\S*$/, "");
    }
  }

  const qualityAnchors = "symmetrical facial features, natural detailed eyes, sharp focused gaze, anatomically correct";
  return `${clean}, ${qualityAnchors}, ${styleDescriptor}, vertical 9:16 framing, photorealistic cinematic lighting`;
}

export const UNTOLD_INTERESTING_FACTS = [
  {
    id: "tobacco_marketing",
    keywords: ["tobacco", "cigarette", "marketing", "smoke", "advertising", "pr", "edward bernays"],
    title: "The Secret Psychological Trick That Hooked the World on Cigarettes",
    part_1_hook: "Have you ever wondered how cigarette companies convinced half the planet to inhale smoke? In 1929, women smoking in public was strictly taboo. But tobacco magnates hired Edward Bernays, the nephew of Sigmund Freud, to execute the most manipulative psychological experiment in human history.",
    part_1_suspense: "Bernays didn't advertise the cigarettes at all. Instead, he paid wealthy debutantes to march in the 1929 New York Easter Parade, holding hidden cigarettes in their coats. What he told the press they were holding changed global advertising forever... Drop a like and follow for Part 2!",
    part_2_body: "Welcome back to Part 2. When the parade began, the women simultaneously lit their cigarettes in front of hundreds of photographers. Bernays had informed the newspapers that these women were lighting 'Torches of Freedom'—framing smoking not as a habit, but as the ultimate symbol of female independence.",
    part_2_suspense: "Front pages across the nation exploded with the headline: 'Torches of Freedom'. Within weeks, cigarette sales skyrocketed by hundreds of percent. Today, every single brand on Earth uses this exact same formula: they don't sell the product—they sell your identity and freedom.",
  },
  {
    id: "graham_bell_telephone_hello",
    keywords: ["telephone", "phone", "hello", "bell", "alexander graham bell", "call", "edison"],
    title: "The Untold Story of Why 8 Billion People Say 'Hello' on the Phone",
    part_1_hook: "Every single time you answer your phone, you say the exact same word: 'Hello'. But did you know that Alexander Graham Bell, the man who invented the telephone, absolutely hated that word and demanded nobody ever use it?",
    part_1_suspense: "Bell insisted that the only proper way to answer a call was the nautical greeting 'Ahoy-hoy'. But a bitter feud with his greatest rival, Thomas Edison, and a personal secret involving his lover turned a private phrase into a global obsession... Wait until you hear the twist in Part 2!",
    part_2_body: "Welcome back to Part 2. When the very first telephone exchange was built in 1878, Alexander Graham Bell campaigned furiously for 'Ahoy'. But Thomas Edison sent a direct letter to the Central District Printing and Telegraph Company insisting on 'Hello'—because acoustic microphones at the time couldn't register soft vowel sounds.",
    part_2_suspense: "Legend also claims Bell's early assistant and sweetheart was named Margaret Hello, meaning whenever his phone rang, that was the name on his mind. Edison printed 'Hello' in the very first official telephone directory, cementing it into the vocabulary of 8 billion human beings forever.",
  },
  {
    id: "de_beers_diamonds",
    keywords: ["diamond", "diamonds", "engagement", "ring", "marriage", "jewel", "luxury", "de beers"],
    title: "How a Single Ad Campaign Tricked the World into Buying Diamonds",
    part_1_hook: "Why do people spend two months of their hard-earned salary on a small shiny diamond ring for an engagement? In the early 1900s, almost nobody proposed with a diamond. Diamonds were seen as common, cheap minerals.",
    part_1_suspense: "Then in 1938, a South African cartel called De Beers was sitting on warehouses overflowing with worthless diamonds they couldn't sell. So they hired a Philadelphia advertising agency to invent a psychological illusion... Follow right now for Part 2 to see the con!",
    part_2_body: "Welcome back to Part 2. The advertising agency N.W. Ayer realized diamonds had almost zero resale value. So copywriter Mary Frances Gerety penned four simple words that changed human culture forever: 'A Diamond is Forever'.",
    part_2_suspense: "By linking the eternal durability of a diamond to the eternal durability of true love, they convinced young men that a smaller diamond meant less love. They engineered the 'two-month salary' rule out of thin air, creating an artificial multi-billion dollar monopoly that rules the world to this day.",
  },
  {
    id: "orange_carrot_dutch",
    keywords: ["carrot", "vegetable", "orange", "dutch", "netherlands", "food history", "biology"],
    title: "Why Carrots Weren't Orange Until a Royal Rebellion",
    part_1_hook: "If you traveled back in time 500 years and pulled a carrot out of the soil, you would be stunned. For thousands of years, all wild and cultivated carrots across Asia and Europe were deep purple, stark white, and pale yellow.",
    part_1_suspense: "So why is every single carrot in your local grocery store bright orange today? It wasn't Mother Nature. It was a calculated political revolution by Dutch farmers fighting a bloody war of independence... Check Part 2 for the full untold truth!",
    part_2_body: "Welcome back to Part 2. In the 17th century, Dutch growers were fiercely loyal to William of Orange, the revolutionary leader who fought Spanish rule to establish the Dutch Republic.",
    part_2_suspense: "To honor the Royal House of Orange, Dutch botanists spent decades cross-breeding mutant yellow and red seeds until they bred a stable, sweeter, vibrant orange variety. The Dutch distributed the seeds across world trade routes, permanently rewriting the genetic color of a vegetable for the entire human race.",
  },
  {
    id: "kelloggs_corn_flakes",
    keywords: ["cereal", "corn flakes", "kellogg", "breakfast", "doctor", "health"],
    title: "The Bizarre Reason Corn Flakes Were Invented by a Doctor",
    part_1_hook: "Every morning, millions of children and adults pour a bowl of crunchy Corn Flakes. But Dr. John Harvey Kellogg never designed Corn Flakes to be a delicious morning breakfast.",
    part_1_suspense: "In 1894 at his Battle Creek Sanitarium, Dr. Kellogg was obsessed with the idea that flavorful, spicy, and sweet foods stimulated human passions and immoral desires. His real goal was far darker than anyone realizes... Follow right now for Part 2!",
    part_2_body: "Welcome back to Part 2. Dr. Kellogg created plain, completely tasteless toasted flakes of wheat and corn specifically as an anti-passion diet to keep his patients calm and mentally subdued.",
    part_2_suspense: "When his brother Will Kellogg secretly added sugar to make it taste good, a bitter 20-year family lawsuit erupted. Will won the rights, sold millions of boxes, and accidentally created the multi-billion dollar global breakfast cereal industry we know today.",
  },
  {
    id: "high_heels_soldiers",
    keywords: ["high heels", "shoes", "fashion", "soldiers", "cavalry", "boots"],
    title: "High Heels Were Actually Invented for Male Soldiers",
    part_1_hook: "Today, high heels are viewed around the world as the quintessential symbol of women's fashion. But high heels were originally engineered exclusively for rough, battle-hardened male warriors.",
    part_1_suspense: "In 10th-century Persia, elite soldiers riding on horseback were missing their targets while shooting arrows at full gallop. The solution they engineered was dangerous, ingenious, and surprising... Watch Part 2 to see how it happened!",
    part_2_body: "Welcome back to Part 2. Persian cavalry fighters added high heels to their leather boots so their feet would lock securely into horse stirrups, allowing them to stand up and aim bow and arrows with lethal precision.",
    part_2_suspense: "When Persian diplomats visited Europe in 1599, French and English aristocrats copied the heels to appear taller, dominant, and aristocratic. It took another two centuries before women adopted them to assert bold equality, transforming war armor into iconic modern fashion.",
  },
  {
    id: "mcdonalds_real_estate",
    keywords: ["mcdonalds", "burger", "business", "real estate", "franchise", "ray kroc"],
    title: "McDonald's Isn't a Fast Food Chain—It's a Real Estate Empire",
    part_1_hook: "If you ask anyone how McDonald's makes its billions of dollars, they will tell you burgers, french fries, and soft drinks. But former McDonald's CEO Harry Sonneborn openly admitted: 'We are not in the food business. We are in the real estate business.'",
    part_1_suspense: "In the 1950s, Ray Kroc was going completely bankrupt trying to sell 15-cent hamburgers. Then a financial genius walked into his office with a revolutionary hidden business model... Tap follow for Part 2 to see the empire!",
    part_2_body: "Welcome back to Part 2. The strategy was deceptively simple: McDonald's Corporation buys the prime street corner land where every restaurant sits, and leases it back to the franchisees with massive markup margins.",
    part_2_suspense: "Franchisees take all the risk of cooking food and paying employees, while McDonald's collects guaranteed rent regardless of whether burgers sell. Today, McDonald's owns over $40 billion in prime commercial real estate, making it one of the largest property landlords on planet Earth.",
  },
  {
    id: "bubble_wrap_wallpaper",
    keywords: ["bubble wrap", "packaging", "wallpaper", "plastic", "invention"],
    title: "Bubble Wrap Was Originally Invented as 3D Wallpaper",
    part_1_hook: "We all love popping the plastic bubbles of bubble wrap. But engineers Alfred Fielding and Marc Chavannes did not invent it to protect Amazon packages or fragile ceramics.",
    part_1_suspense: "In 1957, they sealed two shower curtains together in a garage in New Jersey, creating tiny trapped air bubbles. Their original plan for this invention will leave you laughing in disbelief... Check Part 2 to see what it was!",
    part_2_body: "Welcome back to Part 2. They were attempting to invent high-tech textured 3D wallpaper for modern living rooms! When nobody in America wanted plastic shower curtains on their living room walls, the inventors nearly went broke.",
    part_2_suspense: "Three years later, IBM announced the launch of its revolutionary 1401 mainframe computers. The inventors convinced IBM to wrap the million-dollar machines in their air bubbles for shipping—saving the company and birthing the most satisfying packaging material in human history.",
  },
  {
    id: "play_doh_wallpaper_cleaner",
    keywords: ["play-doh", "playdoh", "toy", "clay", "wallpaper", "cleaner"],
    title: "Play-Doh Was Originally Invented as Wallpaper Soot Cleaner",
    part_1_hook: "Almost every child on Earth has squished colorful Play-Doh between their fingers. But Play-Doh wasn't invented as a creative children's toy.",
    part_1_suspense: "In the 1930s, Kutol Products in Cincinnati was manufacturing a pliable, doughy compound for one single purpose: cleaning dark coal soot off living room wallpaper. When gas heating replaced coal, Kutol was days away from bankruptcy... Wait until you see the twist in Part 2!",
    part_2_body: "Welcome back to Part 2. The company owner's sister-in-law, Kay Zufall, was a nursery school teacher. She read an article about using non-toxic wallpaper dough for arts and crafts, and gave it to her students to sculpt Christmas ornaments.",
    part_2_suspense: "The kids fell in love with it. Kutol removed the detergent compound, added vibrant coloring and an almond scent, and rebranded it as Play-Doh. They turned a dying household cleaner into a toy empire that has sold over 3 billion cans worldwide.",
  },
  {
    id: "treadmill_victorian_prison",
    keywords: ["treadmill", "gym", "exercise", "workout", "prison", "torture", "running"],
    title: "Treadmills Were Originally Invented as Victorian Prison Torture",
    part_1_hook: "Next time you step onto a treadmill at the gym, remember this disturbing historical truth: treadmills were never designed for fitness, weight loss, or healthy cardio.",
    part_1_suspense: "In 1818, British civil engineer Sir William Cubitt designed the 'treadwheel' as a severe disciplinary punishment for lazy inmates in Victorian prisons. The grueling daily regime they were subjected to was terrifying... Check Part 2 to see how harsh it was!",
    part_2_body: "Welcome back to Part 2. Incarcerated convicts were forced to climb gigantic stepped wooden wheels for over six continuous hours every day to crush grain or pump water. On average, a prisoner climbed the vertical equivalent of 7,200 feet every single shift.",
    part_2_suspense: "The torture caused hundreds of catastrophic injuries until British Parliament banned it in 1902 under the Prison Act as cruel and unusual punishment. Decades later in 1952, Dr. Robert Bruce revived the machine for medical testing, which gyms eventually monetized into the $5 billion fitness industry we pay to use today.",
  },
  {
    id: "listerine_floor_cleaner",
    keywords: ["listerine", "mouthwash", "halitosis", "breath", "antiseptic", "doctor"],
    title: "Listerine Was Floor Cleaner Until They Invented 'Bad Breath'",
    part_1_hook: "How did a harsh floor cleaner and surgical antiseptic become the most trusted bottle of mouthwash in your bathroom cabinet? The answer lies in the most brilliant advertising scam in American history.",
    part_1_suspense: "Formulated in 1879 by Dr. Joseph Lawrence, Listerine was originally sold as a heavy surgical disinfectant, a dandruff treatment, and even a cure for gonorrhea. For 40 years, sales were stagnant because nobody needed it... Tap follow for Part 2 to see the psychological trick!",
    part_2_body: "Welcome back to Part 2. In the 1920s, the company dug up an obscure Latin medical term: 'Halitosis', which simply meant stale human breath. They launched dramatic magazine ads showing heartbroken young women unable to get married because of their unseen 'medical condition'.",
    part_2_suspense: "The ads terrified Americans into believing that bad breath was an unforgivable social disease that only Listerine could cure. Within four years, Listerine's profits soared from $100,000 to over $4 million, inventing a brand-new hygiene crisis and solving it with the same bottle.",
  },
  {
    id: "super_glue_wwii_accident",
    keywords: ["super glue", "glue", "adhesive", "wwii", "accident", "gunsight", "invention"],
    title: "Super Glue Was Rejected as a Failed Military Disaster",
    part_1_hook: "Super Glue is so powerful that a single square inch can lift an entire three-ton truck into the air. But the chemist who discovered it thought it was a complete failure and threw it into the trash.",
    part_1_suspense: "In 1942 during World War II, Dr. Harry Coover was leading a team at Eastman Kodak trying to develop clear plastic precision gunsights for Allied rifles. But the substance they synthesized, cyanoacrylate, was a military nightmare... Follow for Part 2 to see the accidental discovery!",
    part_2_body: "Welcome back to Part 2. The formula stuck instantly and permanently to every single piece of laboratory equipment, destroying expensive lenses and optical tools. Frustrated, Coover abandoned the formula as completely useless.",
    part_2_suspense: "Nine years later in 1951, Coover was researching heat-resistant jet airplane canopies when an assistant accidentally glued two prisms together permanently. Coover suddenly realized the compound didn't require heat or pressure to form unbreakable bonds. He demonstrated it on live television by lifting a car, revolutionizing modern adhesives forever.",
  },
  {
    id: "percy_spencer_microwave_chocolate",
    keywords: ["microwave", "oven", "chocolate", "radar", "percy spencer", "kitchen", "cooking"],
    title: "How a Melted Candy Bar in a Pocket Built the Microwave Oven",
    part_1_hook: "Over 90 percent of all homes on Earth have a microwave oven in their kitchen. But the revolutionary device was never designed by chefs, appliance makers, or culinary scientists.",
    part_1_suspense: "In 1945, self-taught engineer Percy Spencer was standing in front of an active military radar magnetron at Raytheon Corporation. When he reached into his pocket for a snack, what he discovered changed cooking forever... Check Part 2 for the shocking moment!",
    part_2_body: "Welcome back to Part 2. A peanut cluster chocolate candy bar in his pocket had completely melted into a warm puddle, even though he felt no heat on his body. Intrigued, Spencer placed unpopped corn kernels near the tube—and watched them explosively pop across the room.",
    part_2_suspense: "The next morning, he placed a raw egg in front of the magnetron, which violently exploded in his colleague's face. Spencer realized that low-density microwave radiation heated water molecules inside food instantly. Raytheon patented the technology and built the 'Radarrange', birthing the microwave oven that transformed the modern world.",
  },
  {
    id: "chupa_chups_salvador_dali",
    keywords: ["chupa chups", "lollipop", "salvador dali", "candy", "logo", "art"],
    title: "Why a Surrealist Mastermind Designed the Chupa Chups Logo",
    part_1_hook: "Have you ever looked closely at the wrapper of a Chupa Chups lollipop? The bright yellow daisy logo wasn't made by a commercial graphic design agency. It was drawn by one of the most eccentric artists who ever lived: Salvador Dalí.",
    part_1_suspense: "In 1969, the Spanish lollipop founder Enric Bernat was struggling to expand internationally. He took his good friend Salvador Dalí out for coffee at an outdoor cafe in Figueres... Follow for Part 2 to see what Dalí created in just one hour!",
    part_2_body: "Welcome back to Part 2. Dalí grabbed a piece of scrap newspaper and immediately began doodling bright, flamboyant daisy petals around the lettering. In less than sixty minutes, he presented Bernat with the iconic design.",
    part_2_suspense: "Dalí made one crucial demand that became marketing genius: never place the logo on the side of the wrapper where it gets crinkled, but place it squarely on the very top so it remains completely visible from above. The logo catapulted Chupa Chups into a global pop-culture phenomenon that still sells billions of lollipops worldwide.",
  },
  {
    id: "post_it_failed_glue",
    keywords: ["post-it", "post it", "notes", "3m", "glue", "paper", "invention"],
    title: "Post-It Notes Were Born from a Complete Chemistry Failure",
    part_1_hook: "We stick yellow Post-it Notes on computer screens, refrigerators, and notebooks every day. But 3M spent millions trying to create an adhesive that was supposed to be the strongest glue in the world.",
    part_1_suspense: "In 1968, chemist Dr. Spencer Silver was attempting to invent super-strong glue for aerospace engineering. Instead, he accidentally created an adhesive that stuck lightly to surfaces and peeled off with zero residue. His bosses dismissed it as useless garbage... Watch Part 2 to see the turning point!",
    part_2_body: "Welcome back to Part 2. For five years, the failed weak glue sat untouched in 3M supply closets. Then a colleague, Art Fry, was singing in his church choir and grew infuriated when his scrap paper bookmarks kept falling out of his hymnal.",
    part_2_suspense: "Fry remembered Silver's 'failed' adhesive and coated a scrap of yellow paper from the lab next door. It held perfectly and pulled away without damaging the pages. Today, Post-it Notes generate over $1 billion annually, proving that one person's failed experiment can become a global staple.",
  },
  {
    id: "ruth_graves_wakefield_cookie",
    keywords: ["ruth graves wakefield", "cookie", "chocolate chip", "toll house", "baking", "dessert"],
    title: "The Untold Origin of the Chocolate Chip Cookie",
    part_1_hook: "Have you ever wondered the bizarre origin of Ruth Graves Wakefield? What history books rarely tell you is that the world's most famous cookie was born through pure culinary determination.",
    part_1_suspense: "In the 1930s, Ruth ran the Toll House Inn in Whitman, Massachusetts. When baking chocolate cookies, she realized she had run out of regular baker's chocolate. What happened next changed desserts forever... Follow for Part 2!",
    part_2_body: "Welcome back to Part 2. Ruth chopped up a bar of Nestlé semi-sweet chocolate, expecting it to melt smoothly into the dough. Instead, the chocolate morsels held their shape, creating the first ever chocolate chip cookie.",
    part_2_suspense: "Nestlé was so impressed by the surging sales that they reached a historic deal with Ruth: printing her Toll House recipe on every package in exchange for a lifetime supply of chocolate.",
  },
];

export interface MotivationalArchetype {
  id: string;
  title: string;
  keywords: string[];
  hooks: string[];
  developments: string[];
  cliffhangers: string[];
  resolutions: string[];
  cta: string;
  visual_style: string;
}

export const MOTIVATIONAL_ARCHETYPES: MotivationalArchetype[] = [
  {
    id: "startup_turnaround",
    title: "From 48 Hours Before Bankruptcy to a Global Revolution",
    keywords: ["startup", "business", "company", "bankruptcy", "founder", "money", "investor"],
    hooks: [
      "When the factory closed and all investors walked away, he had exactly 48 hours before total bankruptcy.",
      "With zero dollars left in the company account and payroll due by midnight, everyone told him to throw in the towel.",
      "Three days before losing his family home to foreclosure, he received one final rejection from his 40th investor.",
      "In 2011, he was sleeping in a broken car with zero dollars to his name and everyone calling him a failure.",
      "With maxed-out credit cards and eviction notices on his door, he was down to his absolute last fifty dollars.",
    ],
    developments: [
      "When everyone else surrendered to comfort, he doubled down on the grueling, invisible grind.",
      "While the world slept, he was waking up at 4:00 AM every single morning to code in an unheated garage.",
      "Rejection after rejection rolled in—over 300 doors slammed directly in his face without a second glance.",
      "He poured every ounce of pain into absolute, unrelenting obsession with product mastery.",
      "Maxing out his final credit card for server parts, he bet everything on one radical architecture nobody else believed in.",
      "He refused to accept defeat as an outcome, working through blinding exhaustion until the breakthrough arrived.",
      "Every single critic told him the market was crowded and he stood zero chance against corporate giants.",
      "He converted pure desperation into fierce, mathematical focus that ignored fear entirely.",
    ],
    cliffhangers: [
      "Then on the absolute darkest day, when quitting was the only logical choice, he made a decision that shocked his entire industry. Follow for Part {next_part}!",
      "With his final ten dollars left in his pocket, he bet everything on one risky move. See the insane outcome in Part {next_part}!",
    ],
    resolutions: [
      "Ten years later, he walked into the same boardroom—not to ask for capital, but as the owner of the entire enterprise.",
      "Today, his company employs over five thousand people and powers systems worldwide, proving that conviction outlasts circumstance.",
      "He proved that when you refuse to quit, the world eventually makes way for your vision.",
      "Standing before the ringing bell of the stock exchange, he smiled thinking of the cold garage where it all began.",
    ],
    cta: "Remember: your current chapter is not your final destination. Save this video to stay relentless, and follow for your daily drive!",
    visual_style: "cinematic ultra-realistic startup founder determination dramatic lighting 8k octane render golden hour skyscraper boardroom",
  },
  {
    id: "paralyzed_athlete",
    title: "The Paralyzed Athlete Who Defied Every Medical Law",
    keywords: ["athlete", "paralyzed", "doctor", "walk", "injury", "olympic", "runner", "gold"],
    hooks: [
      "They told him his nervous system was permanently shattered and he would spend the rest of his life in a wheelchair.",
      "After a catastrophic crash at 80 miles per hour, doctors told the young athlete to accept that his career was over.",
      "Lying in an intensive care bed unable to move a single finger, he made a silent vow that shocked his surgeons.",
      "When the specialists said walking was medically impossible, he looked them in the eye and whispered: watch me.",
      "He had dedicated twelve years to sprint training, only to wake up in a hospital room with zero feeling below his waist.",
    ],
    developments: [
      "Every morning began with four hours of agonizing physical therapy, fighting for millimeters of nerve sensation.",
      "While others rested, he visualized every muscle fiber firing, enduring searing pain that brought him to tears.",
      "Month after grueling month, through sweat and silent tears in an empty gym, a single toe began to twitch.",
      "He ignored every statistic, every doubt, and every well-meaning person telling him to be realistic.",
      "He poured his heart into thousands of brutal repetitions when nobody was watching and hope seemed irrational.",
      "His physical therapist called it a medical miracle, but he called it four thousand hours of unbroken discipline.",
      "When the braces came off, every agonizing step felt like walking on broken glass, but he refused to pause.",
    ],
    cliffhangers: [
      "Just when the team doctors warned him that one more trial would ruin his spine forever, he stepped to the starting block. Follow for Part {next_part}!",
      "The crowd gasped as he fell during the semifinal qualifier. To see how he responded, watch Part {next_part}!",
    ],
    resolutions: [
      "Six years after being told he would never stand, he walked onto the world championship track under deafening cheers.",
      "He crossed the finish line on his own two feet, proving that the human spirit will always overcome what logic calls impossible.",
      "He stood atop the Olympic podium with tears streaming down his face, holding the gold medal everyone said didn't exist.",
      "He gifted his original wheelchair to the hospital ward, with a plaque that read: 'Never surrender your legs to someone else's opinion.'",
    ],
    cta: "Never let someone else's ceiling become your limit. Hit save for when the journey feels too heavy, and follow for daily fire!",
    visual_style: "dramatic cinematic sports comeback athlete golden sunlight lens flare 8k hyperrealism sweat and determination",
  },
  {
    id: "rejected_author",
    title: "142 Rejections Before Becoming a Global Bestseller",
    keywords: ["author", "book", "writer", "rejection", "manuscript", "novel", "art"],
    hooks: [
      "She was living in a freezing flat with a leaking roof, counting pennies to buy baby formula between shifts.",
      "Over one hundred and forty publishing houses sent identical rejection letters calling her manuscript unpublishable.",
      "Sitting by candlelight because the electricity had been shut off, she had nothing left except a typewriter and a dream.",
      "Everyone in her hometown begged her to give up on her childish fantasy and get a sensible desk job.",
      "With stacks of unopened rejection envelopes piling on her floor, she was down to her final box of typing paper.",
    ],
    developments: [
      "She spent every evening after putting her child to sleep writing until dawn, hands numb from the cold.",
      "Instead of burning the rejection letters, she taped all 142 of them across her wall as fuel.",
      "She poured raw vulnerability and unforgettable heart into every single rewritten sentence.",
      "When doubt whispered in the dead of night, she reminded herself why she started in the first place.",
      "She rewrote the climax eighteen times until every word vibrated with undeniable emotional power.",
      "With her last five dollars, she mailed the manuscript to one final independent press in London.",
      "She believed in her characters when the entire literary industry treated them like worthless scrap.",
    ],
    cliffhangers: [
      "On the very day she decided to pack her typewriter into storage, the telephone rang with news from London. Follow for Part {next_part}!",
      "The publisher gave her an ultimatum: change the entire ending or walk away. What she chose next shocked everyone in Part {next_part}!",
    ],
    resolutions: [
      "That single book became an international bestseller, selling over 120 million copies across sixty languages.",
      "Today, her stories inspire millions of dreamers around the planet, proving that authentic courage cannot be silenced.",
      "She transformed her deepest grief into a timeless masterpiece that reshaped modern literature forever.",
      "She returned to the cafe where she wrote the first draft, writing scholarships for young underprivileged authors.",
    ],
    cta: "It only takes one open door to erase a hundred closed ones. Save this video, keep creating, and follow for your creative spark!",
    visual_style: "moody vintage cozy rainy apartment candlelight author writing vintage typewriter emotional cinematic 8k",
  },
  {
    id: "blue_collar_revival",
    title: "The Welder Who Saved an Entire Abandoned Hometown",
    keywords: ["factory", "worker", "welder", "town", "foundry", "labor", "industrial"],
    hooks: [
      "When the town's primary steel foundry closed down, 800 workers were handed pink slips on a freezing Monday morning.",
      "Main Street was boarded up, families were packing moving trucks, and the news declared the town officially dead.",
      "With his retirement savings on the line, an ordinary factory welder made a gamble nobody else dared to make.",
      "They told him manufacturing in America was a relic of the past that could never be resurrected.",
      "Looking at the empty smokestacks where his father and grandfather had worked, he refused to let the flame die.",
    ],
    developments: [
      "He mortgaged his house and purchased the abandoned foundry for pennies on the dollar amidst heavy skepticism.",
      "Together with five loyal coworkers, they spent eighteen months cleaning rusted machinery by hand.",
      "He re-engineered the plant for precision aerospace components, learning advanced robotic engineering late into the night.",
      "They worked sixteen-hour shifts through sub-zero winter temperatures, fueling their furnace with pure grit.",
      "Rejection from corporate defense buyers only forced them to refine tolerances to microscopic perfection.",
      "When a major satellite contractor needed urgent precision fabrication that nobody else could deliver, their phone finally rang.",
    ],
    cliffhangers: [
      "With forty-eight hours left before the bank seized the machinery, they test-fired the high-precision forge. Follow for Part {next_part}!",
      "The inspectors arrived to examine the aerospace parts with calipers. To see if they passed, check Part {next_part}!",
    ],
    resolutions: [
      "Within three years, the factory had rehired all 800 laid-off workers and revitalized Main Street with thriving new businesses.",
      "He proved that honest labor, community loyalty, and relentless innovation can breathe life back into the darkest ruin.",
      "The town erected a plaque at the factory gates inscribed with his motto: 'We don't give up on each other.'",
    ],
    cta: "True leaders don't flee the storm; they build shelter for everyone. Save this story and follow for real-world resilience!",
    visual_style: "cinematic industrial workshop golden sparks welding heroic blue-collar realism cinematic 8k",
  },
  {
    id: "unlikely_scholar",
    title: "From High School Dropout to Quantum Lab Director",
    keywords: ["math", "physics", "dropout", "janitor", "genius", "scholar", "quantum"],
    hooks: [
      "His teachers told him he lacked the cognitive discipline to ever graduate high school or hold a decent job.",
      "At nineteen, he was sweeping floors at a local supermarket on the midnight graveyard shift with no prospects.",
      "Nobody knew that inside his janitor locker lay advanced mathematics textbooks borrowed from the public library.",
      "Expelled twice as a teenager, society had already written him off as another statistic of wasted potential.",
    ],
    developments: [
      "Between mopping supermarket aisles at 2:00 AM, he worked through differential equations on discarded cardboard boxes.",
      "He taught himself quantum mechanics, linear algebra, and computational physics without a single tutor.",
      "When prestigious university professors ignored his handwritten research letters, he kept sharpening his proofs.",
      "He spent every free dollar on open-source scientific computing hardware, building a home cluster in his bedroom.",
      "He discovered an elegant mathematical symmetry that had baffled senior theoretical physicists for thirty years.",
      "A Nobel laureate accidentally read his preprint paper and booked an emergency flight to meet this unknown genius.",
    ],
    cliffhangers: [
      "Standing at the chalkboard of the international physics conference, the former janitor drew his revolutionary equation. Follow for Part {next_part}!",
      "The committee challenged his proof in front of five hundred leading scientists. See what happened in Part {next_part}!",
    ],
    resolutions: [
      "At age twenty-nine, the former janitor was named head of an elite international quantum computing laboratory.",
      "He proved that authentic curiosity and obsessive self-education will always outperform hollow privilege.",
      "Today his algorithms power next-generation encryption, reminding the world that brilliant minds can hide anywhere.",
    ],
    cta: "Never let credentials or past failures define your intellect. Bookmark this reminder and follow to conquer your goals!",
    visual_style: "atmospheric library chalkboards glowing mathematical formulas neon cinematic lighting 8k",
  },
  {
    id: "lone_inventor",
    title: "5,000 Failed Prototypes Before Changing Human History",
    keywords: ["inventor", "prototype", "shed", "machine", "clean water", "patent", "breakthrough"],
    hooks: [
      "For eleven years in his backyard shed, his neighbors laughed as smoke billowed from his nightly experiments.",
      "He exhausted every penny of his savings, borrowed against his car, and endured 5,126 failed prototypes.",
      "His business partners walked out, claiming the invention was impossible and violating fundamental thermodynamics.",
      "At his lowest point, staring at a smoking pile of melted components, he had one dollar and sixty cents left.",
    ],
    developments: [
      "Instead of walking away, he carefully logged every single failure as a roadmap showing what didn't work.",
      "He tested exotic ceramic alloys and composite fibers, working through sleep deprivation and chemical burns.",
      "While others spent their weekends at social parties, he was measuring voltage fluctuations with an oscilloscope.",
      "He realized that the flaw wasn't in his theory, but in the heat dissipation method everyone took for granted.",
      "On trial 5,127, at 3:45 AM, the prototype spun into motion—running at 99% thermodynamic efficiency without friction.",
      "The device operated in complete silence, emitting pure clean energy and outperforming every industrial engine on Earth.",
    ],
    cliffhangers: [
      "The energy gauge surged past the red line as the prototype reached critical RPM. To see the breakthrough, follow for Part {next_part}!",
      "Government regulators arrived at the shed with an inspection team. See the shocking test results in Part {next_part}!",
    ],
    resolutions: [
      "His clean water filtration invention now supplies safe drinking water to over twenty million people across developing nations.",
      "He proved that genius is not born from effortless talent, but forged through five thousand moments of refusing to stop.",
      "The shed where he worked is now preserved as a national historic monument honoring human perseverance.",
    ],
    cta: "Failure is just raw data guiding you to your breakthrough. Save this video, stay patient, and follow for daily motivation!",
    visual_style: "steampunk inventor workshop glowing vacuum tubes electrical coils sparks hyperrealistic 8k",
  },
  {
    id: "mountain_survival",
    title: "Stranded at 24,000 Feet in a Sub-Zero Blizzard",
    keywords: ["mountain", "blizzard", "everest", "climbing", "survival", "himalayas", "frostbite"],
    hooks: [
      "Trapped on an icy knife-edge ridge in the Himalayas at minus forty degrees, his oxygen tank hissed empty.",
      "The storm had wiped out the fixed ropes, his climbing partner was incapacitated, and darkness was falling fast.",
      "Every rational survival guide instructed climbers in that death zone to sit down and prepare for the end.",
      "With frostbite numbing his fingertips and sixty-knot winds howling, he chose to fight for every single breath.",
    ],
    developments: [
      "He secured his partner to the rock face with one ice screw, carving a tiny snow cave with his bare crampons.",
      "He stayed awake for forty-eight straight hours, slapping his limbs to force circulation through freezing veins.",
      "Hallucinations tore through his mind, but he anchored himself to the thought of returning home to his daughter.",
      "When his headlamp battery died in pitch-black whiteout conditions, he navigated purely by the texture of the granite.",
      "He carried his partner over three sheer technical crevasses, moving six inches at a time through waist-deep snow.",
      "His body was at total physiological exhaustion, but his will was a furnace that cold could not extinguish.",
    ],
    cliffhangers: [
      "Stepping across a bottomless chasm on a snow bridge that began cracking beneath his boots, he took the leap. Follow for Part {next_part}!",
      "The radio crackled with a distress beacon from base camp. To see how they made it down, follow for Part {next_part}!",
    ],
    resolutions: [
      "As dawn broke, rescue helicopters spotted two figures standing tall at high camp against all odds.",
      "Medical teams called their survival the greatest feat of human endurance ever recorded in modern mountaineering.",
      "He proved that when external resources vanish, the depth of the human spirit is truly limitless.",
    ],
    cta: "When you can't run, walk. When you can't walk, crawl. Never surrender. Save this video and follow to conquer your peaks!",
    visual_style: "epic dramatic snow-capped mountain ridge blizzard sunrise golden peaks extreme cinematic 8k",
  },
  {
    id: "underdog_boxer",
    title: "Down Three Times in Round Ten Before the Championship KO",
    keywords: ["boxer", "boxing", "champion", "ring", "knockout", "fight", "underdog"],
    hooks: [
      "His left eye was completely swollen shut, his ribs were fractured, and the referee was about to wave the fight off.",
      "Nobody gave him a chance against the undefeated world champion who had knocked out thirty straight opponents.",
      "As he sat in the corner between rounds spitting blood into a bucket, the crowd screamed for him to throw in the towel.",
      "He had grown up in an orphanage, fighting for respect his entire life—and this was his final stand.",
    ],
    developments: [
      "His trainer looked into his one good eye and said: 'Show the world what you're made of right now.'",
      "He rose off the stool at the bell, walking directly into the storm of punches without flinching.",
      "He slipped inside the champion's devastating right cross, planting his feet firmly onto the canvas.",
      "Years of waking up at 4:30 AM, running hills in heavy boots, and sparring in damp basements flashed through his veins.",
      "He unleashed an explosive, perfectly timed left hook that shook the entire stadium to its foundation.",
      "The arena erupted into absolute chaos as the reigning champion crashed to the mat for the ten-count.",
    ],
    cliffhangers: [
      "As the referee reached the count of eight, the champion began stumbling to his feet. Check Part {next_part} for the final seconds!",
      "The judges' scorecards were split down the middle. Watch Part {next_part} for the official verdict!",
    ],
    resolutions: [
      "The referee raised his bruised hand in victory as the new undisputed champion of the world.",
      "He embraced his trainer with tears in his eyes, dedicating the championship belt to every kid who was told they'd never matter.",
      "He proved that heart, hunger, and unrelenting resilience will always triumph over arrogance.",
    ],
    cta: "It's not about how hard you hit; it's about how hard you can get hit and keep moving forward. Save this and follow for daily drive!",
    visual_style: "dramatic boxing ring arena stadium lights sweat spray heroic champion cinematic 8k",
  },
  {
    id: "immigrant_builder",
    title: "Arriving with $14 in His Pocket to Building a Food Empire",
    keywords: ["immigrant", "restaurant", "food", "kitchen", "chef", "empire", "hustle"],
    hooks: [
      "He arrived at the international terminal with one taped cardboard suitcase and fourteen dollars to his name.",
      "Unable to speak a word of English, he slept on a subway bench his first three nights in the foreign metropolis.",
      "People laughed when he said he would one day buy the very restaurant where he was scrubbing kitchen pots.",
      "He worked eighty-four hours a week between three minimum wage jobs, sending half of every paycheck back home.",
    ],
    developments: [
      "He arrived thirty minutes early to every shift and stayed thirty minutes late without asking for overtime.",
      "He memorized twenty English words every single evening before closing his eyes for four hours of sleep.",
      "For nine straight years, he never bought new clothes or took a single vacation day, saving every cent in a coffee can.",
      "He mastered the culinary craft from master chefs by observing their techniques with razor-sharp attention.",
      "When the aging restaurant owner prepared to retire, the former dishwasher stepped forward with cash in hand.",
      "He treated every single customer like family, serving authentic recipes that reminded people of home.",
    ],
    cliffhangers: [
      "On opening night of his flagship restaurant, a critical food critic from the city newspaper took a seat. Follow for Part {next_part}!",
      "A sudden health inspection put the grand opening in jeopardy. See what happened in Part {next_part}!",
    ],
    resolutions: [
      "Today, his hospitality empire spans forty-five locations and employs three thousand immigrant workers with full benefits.",
      "He purchased his parents their first home and established a scholarship fund sending fifty underprivileged students to college every year.",
      "He proved that humility, relentless labor, and genuine gratitude can conquer any border or obstacle.",
    ],
    cta: "Where you start has nothing to do with where you can finish. Save this video to honor the hustle, and follow for daily motivation!",
    visual_style: "bustling warm restaurant kitchen culinary perfection warm golden lighting cinematic 8k",
  },
  {
    id: "silent_discipline",
    title: "1,000 Days of Silent Consistency That Changed Everything",
    keywords: ["discipline", "habits", "transformation", "workout", "mindset", "consistency"],
    hooks: [
      "Three years ago, he stared in the mirror at three in the morning and broke down in tears at what he had become.",
      "Overweight, drowning in high-interest debt, and numb to life, he realized nobody was coming to rescue him.",
      "He deleted all his social media apps, cut out every toxic distraction, and made one radical silent pact with himself.",
      "He didn't announce his goals to the world or seek validation—he simply put his head down and went to work.",
    ],
    developments: [
      "Day 1, Day 50, Day 200—cold showers, four-mile runs at dawn, and two hours of deep focused study every single day.",
      "When old friends mocked his discipline and invited him out to party, he politely declined and kept grinding.",
      "He tracked every expense, eliminated his debt dollar by dollar, and invested in his skills with monastic devotion.",
      "There were days when motivation vanished completely, but discipline carried him through without question.",
      "His body transformed, his mind sharpened like a blade, and his career surged into top-tier leadership.",
      "He proved that real transformation does not happen in loud moments, but in the dark when nobody is watching.",
    ],
    cliffhangers: [
      "On Day 750, a sudden personal crisis threatened to unravel all his hard work. Follow for Part {next_part} to see his reaction!",
      "His former rivals invited him back for a competitive showcase. See the shocking transformation in Part {next_part}!",
    ],
    resolutions: [
      "One thousand days later, he stood as a physically dominant, financially free, and mentally unshakeable master of his life.",
      "He looked in the same mirror with quiet pride, knowing he had rebuilt himself from the inside out.",
      "He proved that discipline is the highest form of self-love that any human being can cultivate.",
    ],
    cta: "Nobody is coming to save you. Manufacture your own discipline. Save this video to lock in today, and follow for your daily drive!",
    visual_style: "intense lone runner morning mist sunrise aesthetic athletic physique cinematic 8k",
  },
  {
    id: "music_virtuoso",
    title: "The Deaf Virtuoso Who Felt Sound Through the Floorboards",
    keywords: ["music", "pianist", "deaf", "hearing", "piano", "symphony", "carnegie hall"],
    hooks: [
      "At age twenty-two, right after winning a seat in the national symphony, an infection took ninety percent of his hearing.",
      "Conductors told him his musical career was dead and that a deaf pianist was an impossible contradiction.",
      "Sitting alone at his Steinway grand piano, he couldn't hear the keys he was striking with his fingertips.",
      "Devastated and weeping, he pressed his bare forehead against the wooden casing of the instrument.",
    ],
    developments: [
      "That's when he felt it: the resonant acoustic vibration traveling directly through the wood into his skull.",
      "He took off his shoes and socks, learning to perceive bass notes through his heels and treble through his toes.",
      "He studied the pure mathematical frequency of harmony, mapping octaves through micro-vibrations in his body.",
      "He practiced twelve hours a day in silence, turning his entire skeletal frame into a biological microphone.",
      "He began composing original melodies so profound and emotionally complex that experienced conductors wept.",
      "He memorized the acoustics of every major concert hall by sending tap pulses through the stage flooring.",
    ],
    cliffhangers: [
      "As he walked onto the stage at Carnegie Hall, the silence in the room was deafening. Follow for Part {next_part} to hear what happened!",
      "Halfway through the performance, the stage lighting failed. See how he finished in Part {next_part}!",
    ],
    resolutions: [
      "At his comeback performance at Carnegie Hall, he performed his original concerto to a fifteen-minute standing ovation.",
      "The audience rose in deafening applause, and when he turned around and saw their tears, he knew he had triumphed.",
      "He proved that true music is not heard with the ears—it is experienced directly through the soul.",
    ],
    cta: "When life takes away your normal senses, your spirit builds greater ones. Save this video and follow for daily inspiring stories!",
    visual_style: "epic concert hall grand piano spotlight dust particles acoustic resonance cinematic 8k",
  },
  {
    id: "medical_pioneer",
    title: "The Scientist Who Sacrificed Everything to Cure the Incurable",
    keywords: ["doctor", "medicine", "cure", "scientist", "cure", "laboratory", "cancer", "breakthrough"],
    hooks: [
      "They revoked his medical license and called him a dangerous heretic for proposing his radical therapy.",
      "The pharmaceutical board shut down his laboratory funding and expelled him from the university hospital.",
      "He watched terminal patients suffer with no hope while the medical establishment clung to sixty-year-old textbooks.",
      "Refusing to let patients die while bureaucracy debated, he converted his home basement into a sterile bio-lab.",
    ],
    developments: [
      "He poured his life savings into specialized bioreactors, synthesizing peptide sequences at his kitchen counter.",
      "He worked through the night testing cellular interactions under an electron microscope, logging 10,000 trials.",
      "When animal models proved successful, he took the ultimate risk and injected himself first to prove safety.",
      "He monitored his own vitals for forty-eight hours, proving zero toxicity with absolute clinical rigor.",
      "With informed consent from a terminal volunteer who had forty-eight hours left, he administered the first dose.",
      "Within seventy-two hours, the malignant cell count plummeted by ninety percent in a clinical miracle.",
    ],
    cliffhangers: [
      "The medical tribunal convened to decide whether to arrest him or review the patient data. Follow for Part {next_part}!",
      "The biopsy results arrived by courier under armed escort. See the shocking lab report in Part {next_part}!",
    ],
    resolutions: [
      "Five years later, the same medical board awarded him the highest medal of honor in modern oncology.",
      "His breakthrough therapy has now saved over two hundred thousand human lives across fifty countries.",
      "He proved that true progress requires courage to stand alone when the entire consensus is blind.",
    ],
    cta: "Stand tall for what is right, even if you have to stand alone. Save this video and follow for more extraordinary stories!",
    visual_style: "dramatic futuristic medical laboratory glowing blue pipettes electron microscope cinematic 8k",
  },
];

export const GENRE_CTA: Record<string, string[]> = {
  "Motivational": [
    "Remember: your current chapter is not your final destination. Save this video to stay relentless, and follow for your daily drive!",
    "The pain you endure today becomes the strength you wear tomorrow. Save this video, stay disciplined, and follow for daily fire!",
    "Never let someone who settled for average talk you out of your destiny. Save this reminder and follow to conquer your goals!",
    "One decision to keep going can rewrite your entire life. Hit save, stay focused, and follow for your daily fuel!",
  ],
  "Horror": [
    "Some secrets were never meant to be uncovered in the dark. Save this video if you dare, and follow for the next chilling encounter!",
    "Lock your doors and check behind you tonight. Save this encounter and follow for more spine-chilling horror!",
    "The shadows are always watching. Double tap, save this video, and follow for the next terrifying story!",
  ],
  "Romance": [
    "When two souls are destined to meet, the entire universe conspires to bring them together. Save this to share with someone special, and follow for daily romance!",
    "True love does not count the miles or the years—it creates its own time. Save this heartwarming moment and follow for more love stories!",
    "Some bonds are written in the stars long before we ever cross paths. Save this video and follow for your daily dose of romance!",
  ],
  "Adventure": [
    "The world still holds secrets waiting far beyond the horizon. Save this video for your next expedition, and follow for more untold adventures!",
    "Courage is not the absence of fear, but the mastery of it. Save this journey and follow for more thrilling expeditions across the globe!",
    "Step off the beaten path and explore the impossible. Save this video and follow for daily breathtaking adventures!",
  ],
  "Educational": [
    "The universe is far stranger and more fascinating than textbooks ever taught us. Save this discovery to expand your mind, and follow for daily knowledge!",
    "Every breakthrough begins with asking the question nobody else dared to ask. Save this fact and follow for daily discoveries!",
    "Knowledge is the only wealth that multiplies when you give it away. Save this video and follow for your daily dose of brilliance!",
  ],
  "Comedy": [
    "And that is exactly why we can't have nice things! Share this with a friend who would totally do this, and follow for more laughs!",
    "Moral of the story: always read the room before making your move. Save this for a laugh and follow for more hilarious chaos!",
    "If you didn't laugh, check your pulse! Hit save, send this to your funniest friend, and follow for daily comedy!",
  ],
  "Music": [
    "Music speaks directly to the soul where words fail. Save this track, turn up the volume, and follow for more original beats!",
    "Every beat tells a story that echoes through time. Save this song and follow for daily acoustic journeys!",
  ],
  "Interesting Facts": [
    "History is stranger than fiction when you uncover the untold truth. Save this fact to blow your friends' minds, and follow for more daily discoveries!",
    "Today this hidden origin shapes the modern world in ways we take for granted. Save this video and follow for more untold origin secrets every day!",
  ],
  "Others": [
    "The boundary between reality and imagination is thinner than we think. Save this video and follow for more mind-bending tales!",
    "Some wonders can never be explained by ordinary logic. Save this story and follow for more extraordinary mysteries!",
  ],
};

export const SUSPENSE_PATTERNS: Record<string, {
  hooks: string[];
  developments: string[];
  cliffhangers: string[];
  resolutions: string[];
  visual_style: string;
}> = {
  "Horror": {
    hooks: [
      "It was supposed to be an abandoned hospital, but the third floor was still lit.",
      "I found an old audio cassette inside my grandmother's attic labeled 'Do Not Play Alone'.",
      "At exactly 3:17 AM every morning, the footsteps in the hallway stop right outside my bedroom door.",
      "Deep in the Blackwood forest, locals say whatever follows you never lets you see its face.",
      "The surveillance camera in our basement started recording 4 hours of missing time.",
      "Every mirror in the antique shop had been covered in black velvet, except the smallest one in the cellar.",
      "When we bought the Victorian manor, the previous owners left one locked brass trunk in the master closet.",
      "The radio in our car began tuning into a frequency that broadcasted private conversations inside our house.",
    ],
    developments: [
      "As we forced the rusted steel door open, the room inside was freezing, smelling faintly of sulfur.",
      "The shadows on the wallpaper seemed to bend in directions that contradicted the flashlight beam.",
      "A faint scratch came from inside the drywall, moving systematically from left to right.",
      "When we reviewed the camera footage from the night before, something was standing at the foot of the bed watching us breathe.",
      "The temperature dropped instantly. Every clock in the house froze at the exact same second.",
      "A single wooden chair sat in the center of the dark hall, facing the corner.",
      "We discovered handprints on the ceiling—pressed deeply into the concrete from above.",
      "The floorboards beneath our feet hummed with a low, sickening vibrational frequency.",
      "A music box began playing a slow, warped lullaby from the locked attic above us.",
      "Our dog refused to enter the hallway, whimpering and staring at the empty space beside the coat rack.",
    ],
    cliffhangers: [
      "Then the door behind us slammed shut and locked from the outside. What stepped out of the darkness will leave you sleepless... Drop a like and watch Part {next_part}.",
      "Just as I looked into the mirror, my reflection smiled back... but I wasn't smiling. Wait until you see what happened next in Part {next_part}.",
      "A voice whispered my childhood nickname directly behind my neck. Tap follow right now for Part {next_part}.",
      "The recording suddenly cleared, revealing who was holding the camera the whole time. To see the horrifying reveal, check Part {next_part}.",
    ],
    resolutions: [
      "When the sunlight broke through the broken windows, the figure was gone—leaving only a single antique key and a note that read: 'We are already inside'.",
      "We finally decoded the audio signal: it was a distress transmission broadcasted from our own house 50 years before it was ever built.",
      "The mirror cracked in two, severing the connection forever. But every night since, the whispers have moved into the shadows under the floorboards.",
      "The trunk clicked open to reveal a diary detailing events of our own lives written sixty years before we were born.",
    ],
    visual_style: "dark eerie cinematic shadows mist foggy abandoned hallway volumetric lighting 8k octane render",
  },
  "Adventure": {
    hooks: [
      "Deep inside the uncharted Peruvian canyon, satellite radar detected a cavern that shouldn't exist.",
      "Three explorers descended into the deepest subterranean pit in Scandinavia, and only one returned.",
      "We crossed the perimeter of the forbidden exclusion zone where compass needles spin clockwise.",
      "In 1944, a cargo plane vanished over the Himalayas—yesterday, our drone caught its reflection in a glacial lake.",
      "Beneath the shifting sand dunes of the Rub' al Khali desert, ground-penetrating radar revealed a stone fortress.",
      "The antique map bought in Cairo had an island sketched off the coast that does not appear on any modern satellite.",
      "We navigated through the Amazonian mist until our GPS coordinates placed us in the middle of a blank grid.",
    ],
    developments: [
      "Rappelling down the 200-meter sheer cliff, the cavern walls shifted from natural limestone to smooth obsidian blocks.",
      "Our atmospheric sensors started beeping frantically as air pressure doubled without warning.",
      "Carved into the volcanic stone were symbols identical to those found on the other side of the globe.",
      "We crossed a subterranean river whose water glowed with faint bioluminescent cyan veins.",
      "Every radio frequency fell dead silent, replaced by a rhythmic metallic pulse from below.",
      "The air grew warm and smelled of ancient ozone as our headlamps caught massive monolithic archways.",
      "Footprints in the damp clay led forward into the subterranean canyon—and they were fresh from hours ago.",
      "The rock tunnel opened into an underground chamber so vast our spotlights couldn't reach the ceiling.",
    ],
    cliffhangers: [
      "That's when our lead climber pointed his spotlight across the chasm, and what he saw stopped his heart. Follow right now for Part {next_part}!",
      "A deafening rumble echoed through the cavern as the rope snapped. To see how we survived, drop a like for Part {next_part}!",
      "Behind the stone barrier wasn't an empty tomb—something alive was breathing in the dark. Part {next_part} drops tomorrow, follow now!",
      "The stone floor began to tilt downwards towards the subterranean abyss. Watch Part {next_part} to see what happened next!",
    ],
    resolutions: [
      "We scrambled onto the daylight ledge with seconds to spare, clutching the obsidian artifact that would rewrite world archaeology forever.",
      "The subterranean river led directly out into a hidden prehistoric valley untouched by human civilization for ten thousand years.",
      "We emerged under the desert stars with documentation proving the lost city had flourished long before recorded history.",
      "The coordinates led us to a hidden freshwater oasis surrounded by ancient temple ruins that mapmakers had lost for centuries.",
    ],
    visual_style: "epic extreme exploration majestic landscape dramatic cliff cavern mist 8k national geographic cinematography",
  },
  "Romance": {
    hooks: [
      "She received a handwritten letter in her mailbox with no stamp, postmarked thirty years in the future.",
      "Every rainy Tuesday, a stranger left a single red camellia flower on her antique shop window.",
      "He found an unlabelled photograph in a Paris flea market—and the person beside him was someone he hadn't met yet.",
      "Two train commuters exchanged glances at 7:14 AM for six months without ever speaking a single syllable.",
      "A violin melody drifting from a fifth-floor balcony across the canal carried a tune known only to her childhood.",
      "She ordered a coffee at the airport terminal and received a napkin with a sketch of her favorite childhood memory.",
    ],
    developments: [
      "The handwriting was undeniably familiar, carrying the cadence of words only two souls could know.",
      "Under the golden streetlights of the old bridge, the rain mirrored their reflections in quiet silence.",
      "Every clue led deeper into a mystery that defied time and rational explanation.",
      "Between unspoken words and stolen glances, the truth began to unravel faster than either could stop.",
      "A chance meeting at a crowded bookshop cafe shattered the distance that had kept them apart.",
      "They walked through cobblestone alleys as the autumn leaves fell, each step revealing unspoken shared memories.",
      "The locket in her hands felt warm to the touch, as if responding to the rhythm of her heartbeat.",
    ],
    cliffhangers: [
      "Then the stranger turned around under the umbrella, and the face revealed a secret that changed everything. Follow for Part {next_part}!",
      "The final letter contained only five words that shattered their reality. See what it said in Part {next_part}!",
      "Just as their fingers touched, the departure train sounded its final whistle. Check Part {next_part} right now!",
    ],
    resolutions: [
      "They stood under the glowing twilight, finally understanding that true love does not measure time—it creates it.",
      "The two halves of the silver locket clicked shut, reuniting a bond that had traversed decades of waiting.",
      "Under the warm cafe lights of Montmartre, their eyes met and words were no longer needed.",
      "They walked hand in hand along the shoreline as the sunset painted the sky in shades of gold and rose.",
    ],
    visual_style: "warm golden hour cinematic emotional bokeh romantic sunset atmosphere 8k masterpiece",
  },
  "Educational": {
    hooks: [
      "Deep in the center of the Sahara Desert lies a 40-kilometer structure so massive it can only be seen from space.",
      "Physicists ran an experiment with single photons that proved the past can be changed by the future.",
      "Underneath the ice sheets of Antarctica, scientists drilled into water that hasn't seen air for 20 million years.",
      "In the deepest trenches of the Mariana Abyss, organisms survive under pressures that would crush a nuclear submarine.",
      "Biologists discovered that forest mycelium networks transfer nutrients and warnings between trees like a biological internet.",
      "Astronomers detected an anomalous radio signal from a star system 100 light years away pulsing at prime number intervals.",
    ],
    developments: [
      "When satellite radar penetrated the sand layers, geometric concentric rings emerged identical to Plato's descriptions.",
      "The subatomic particles behaved as waves until observed, completely breaking the classical laws of causality.",
      "Water samples pulled from the subglacial lake contained microorganisms with an entirely foreign genetic code.",
      "Scientific instruments began recording anomalies that existing physics models could not explain.",
      "Spectrometry data revealed unexpected elemental isotopes that should not naturally form on terrestrial planets.",
      "The chemical signals traveling through tree roots demonstrated a collective decision-making intelligence across entire biomes.",
    ],
    cliffhangers: [
      "The data returned from the core sample shocked every researcher in the room. What they discovered next is going to blow your mind—follow for Part {next_part}!",
      "When the equation was calculated, the result proved our universe might not be what it seems. Watch Part {next_part} for the full revelation!",
      "The signal repeated three times with unmistakable mathematical symmetry. Follow for Part {next_part} to see what was decoded!",
    ],
    resolutions: [
      "The discovery proved that nature holds secrets far greater than our imaginations, opening a brand-new frontier in human science.",
      "Today, this revelation is forcing textbooks around the world to be rewritten from the ground up.",
      "The findings confirmed that the universe is governed by mathematical principles far more interconnected than science previously believed.",
    ],
    visual_style: "scientific cosmic discovery futuristic clean 8k unreal engine 5 render space nebula",
  },
  "Comedy": {
    hooks: [
      "My friend tried to save $50 by installing his own smart home security system using free code online.",
      "I accidentally replied-all to a 5,000-person corporate email with my grocery shopping list.",
      "He tried to impress his date by ordering in fluent French at a restaurant where the chef was from Chicago.",
      "My dad bought a high-tech robotic lawnmower and immediately lost a territorial war against our golden retriever.",
      "I tried to bake a sourdough loaf from a 200-year-old starter and accidentally created a living biological entity.",
      "He wore noise-canceling headphones on a flight and sang an entire 90s boy band ballad without realizing everyone was watching.",
    ],
    developments: [
      "By 2:00 AM, the robotic vacuum had declared itself the supreme ruler of the living room.",
      "The smart fridge locked everyone out until we solved a 3-part quadratic equation.",
      "The automatic sprinkler system synced with the bass drop of our neighbors' stereo at full blast.",
      "The waiter listened with a straight face for three solid minutes before responding in pure English.",
      "The golden retriever stood on top of the doghouse holding the lawnmower's remote control in its jaws.",
      "The sourdough dough expanded overnight, consuming three kitchen shelves and the coffee maker.",
    ],
    cliffhangers: [
      "And just when we thought the embarrassment couldn't get any worse, the fire department arrived. Wait until you hear what happened next in Part {next_part}!",
      "Then the CEO replied to the email with an unexpected attachment. Follow right now for Part {next_part}!",
      "The restaurant kitchen doors swung open and out walked the head chef holding a frying pan. See the reaction in Part {next_part}!",
    ],
    resolutions: [
      "In the end, the vacuum ran out of battery, peace was restored, and we vowed never to touch automated home gadgets again.",
      "The company actually adopted three items from the grocery list as official snack policy, turning disaster into legend.",
      "The chef came over with two free desserts, admitting he had practiced his French in high school for three weeks just for moments like this.",
      "The family finally negotiated a truce with the retriever, who now rides the lawnmower like a golf cart.",
    ],
    visual_style: "vibrant colorful lively expressive high energy 3d animated style 8k cheerful comedic scene",
  },
  "Music": {
    hooks: [
      "In 1978, a mysterious pirate radio station in London broadcasted a 3-minute melody that vanished forever.",
      "Musicians in Berlin discovered an underground acoustic chamber where a single guitar chord reverberates for 40 seconds.",
      "Legend says this vinyl record contains an inaudible frequency that makes listeners experience vivid dreams.",
      "An anonymous producer uploaded an electronic beat at 3:00 AM that went viral across twenty countries by sunrise.",
      "A vintage upright piano found in an abandoned church cellar produced harmonics that synced with local radio waves.",
    ],
    developments: [
      "Sound engineers analyzing the waveform discovered an embedded mathematical spiral inside the harmony.",
      "When the analog synthesizers hit 432 Hz, the vintage vacuum tubes began glowing in perfect unison.",
      "Cables hummed with resonant energy as the bass frequency resonated through the subterranean concrete floor.",
      "The melody wove through vintage polyphonic synths, creating an immersive soundscape that defied ordinary acoustic physics.",
      "Microphones in the acoustic chamber captured overtones that sounded unmistakably like a human choir.",
    ],
    cliffhangers: [
      "When they dropped the needle on the unlabelled B-side, the sound did something nobody expected. Follow for Part {next_part} to hear it!",
      "The recording suddenly stopped and a voice spoke through the monitor. To uncover what it said, follow for Part {next_part}!",
      "The acoustic vibration shattered three antique glassware bottles on the studio shelf. Watch Part {next_part} to hear the climax!",
    ],
    resolutions: [
      "The lost frequency was finally mastered and released, proving that music is the true universal language of human consciousness.",
      "The resonance faded into pure harmonic stillness, leaving behind a timeless acoustic masterpiece.",
      "The melody was adopted as a cultural anthem, uniting listeners across continents through pure sonic frequency.",
    ],
    visual_style: "neon cyberpunk stage lights futuristic music concert visual audio waves 8k",
  },
  "Others": {
    hooks: [
      "They told everyone the experiment was shut down in 1999, but the energy readings never dropped.",
      "In the quiet border town of Ashwood, the fog only comes when the streetlights turn green.",
      "A courier was paid $100,000 to deliver an antique briefcase to an address that has been underwater since 1920.",
      "A lighthouse on an isolated island keeps turning on every winter solstice despite having no bulb or wiring.",
      "Deep inside an abandoned subway tunnel in Manhattan, workers discovered a platform that does not exist on any blueprint.",
    ],
    developments: [
      "The perimeter fence was reinforced with reinforced steel and warning signs in four different languages.",
      "Every step through the quiet streets revealed details that grew more surreal and displaced in time.",
      "Inside the container was a brass mechanism running without any battery or apparent power source.",
      "The instruments fluctuated violently as the atmospheric barrier began to shift.",
      "Shadows against the tiled platform walls moved independently of the flashlight beams.",
    ],
    cliffhangers: [
      "That's when the locking mechanism clicked open, revealing what was inside. You won't believe your eyes—follow for Part {next_part}!",
      "Behind the doorway was a sight that shattered all logic. Check Part {next_part} right now for the insane reveal!",
    ],
    resolutions: [
      "The truth was finally documented, proving that the world holds far more unexplained wonders than anyone dared to imagine.",
      "The mechanism locked back into place, sealing the mystery until the next traveler crosses the threshold.",
      "We stepped back into the daylight with photographic proof that history contains chapters that were deliberately erased.",
    ],
    visual_style: "cinematic hyperrealistic dramatic 8k unreal engine lighting storytelling masterpiece",
  },
};

export const DYNAMIC_DISCOVERY_TOPICS = [
  "Frank Epperson",
  "Ruth Graves Wakefield",
  "Percy Spencer",
  "Alexander Fleming",
  "Wilson Greatbatch",
  "Roy J. Plunkett",
  "Édouard Bénédictus",
  "Arthur Fry",
  "James Wright (inventor)",
  "Leo Baekeland",
  "George de Mestral",
  "John Stith Pemberton",
  "Thomas Sullivan (inventor)",
  "Earl Tupper",
  "Garrett Morgan",
  "Hedy Lamarr",
  "Stephanie Kwolek",
  "Willis Carrier",
  "Lonnie Johnson (inventor)",
  "Richard James (naval engineer)",
  "Charles Goodyear",
  "Chester Greenwood",
  "John Walker (inventor)",
  "Wilhelm Röntgen",
  "Henri Becquerel",
  "Saccharin",
  "Play-Doh",
  "Treadmill",
  "Listerine",
  "Bubble Wrap",
  "Chupa Chups",
  "Super Glue",
  "Velcro",
  "Post-it note",
  "Bakelite",
  "Penicillin",
];

export async function scrapeWikipediaFact(query: string = "", excludeId: string = ""): Promise<{
  id: string;
  title: string;
  subject: string;
  sentences: string[];
} | null> {
  const cleanQ = query.trim();
  let searchTarget = "";

  if (cleanQ && cleanQ.length < 70 && !UNTOLD_INTERESTING_FACTS.some((f) => f.title.toLowerCase().includes(cleanQ.toLowerCase()))) {
    searchTarget = cleanQ;
  } else {
    const avail = DYNAMIC_DISCOVERY_TOPICS.filter((s) => !excludeId.toLowerCase().includes(s.toLowerCase()));
    searchTarget = avail.length > 0 ? avail[Math.floor(Math.random() * avail.length)] : DYNAMIC_DISCOVERY_TOPICS[0];
  }

  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTarget)}&srlimit=5&format=json`;
    const sRes = await fetch(searchUrl, {
      headers: { "User-Agent": "TheViralDesk/2.0 (education bot; info@theviraldesk.com)" },
      signal: AbortSignal.timeout(4000),
    });
    if (!sRes.ok) return null;
    const sData = await sRes.json();
    const hits: string[] = (sData.query?.search || [])
      .map((h: any) => h.title)
      .filter((t: string) => !t.includes(":"));

    const targetTitle = hits[0] || searchTarget;

    const extUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(targetTitle)}&format=json`;
    const eRes = await fetch(extUrl, {
      headers: { "User-Agent": "TheViralDesk/2.0 (education bot; info@theviraldesk.com)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!eRes.ok) return null;
    const eData = await eRes.json();
    const pages = eData.query?.pages || {};
    let rawText = "";
    for (const pid of Object.keys(pages)) {
      rawText = pages[pid].extract || "";
      break;
    }

    if (!rawText || rawText.length < 120 || rawText.includes("may refer to:")) {
      return null;
    }

    const clean = rawText
      .replace(/==+[^=]+==+/g, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/\[[^\]]*\]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const sentences = clean
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 25 && !s.startsWith("See also") && !s.startsWith("References") && !s.startsWith("External links"));

    if (sentences.length < 3) return null;

    return {
      id: `wiki_${targetTitle.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}`,
      title: `${targetTitle}: The Untold Origin Story`,
      subject: targetTitle,
      sentences: sentences.slice(0, 16),
    };
  } catch {
    return null;
  }
}

export function findMatchingInterestingFact(prompt: string, excludeId: string = ""): typeof UNTOLD_INTERESTING_FACTS[0] {
  const cleanPrompt = prompt.toLowerCase().trim();
  let matchedPrevId: string | null = null;
  for (const item of UNTOLD_INTERESTING_FACTS) {
    if (
      cleanPrompt.includes(item.id) ||
      cleanPrompt.includes(item.title.toLowerCase()) ||
      cleanPrompt.includes(item.part_1_hook.slice(0, 35).toLowerCase())
    ) {
      matchedPrevId = item.id;
      break;
    }
  }

  const targetExclude = excludeId || matchedPrevId;

  if (cleanPrompt && cleanPrompt.length < 70 && !matchedPrevId) {
    for (const item of UNTOLD_INTERESTING_FACTS) {
      if (item.id === targetExclude) continue;
      if (item.keywords.some((kw) => cleanPrompt.includes(kw))) {
        return item;
      }
    }
  }

  const candidates = UNTOLD_INTERESTING_FACTS.filter((f) => f.id !== targetExclude);
  return candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : UNTOLD_INTERESTING_FACTS[0];
}

export async function generateStoryParts(params: {
  category: string;
  customTag?: string;
  prompt?: string;
  duration?: number;
  numImages?: number;
  numParts?: number;
  excludeId?: string;
}): Promise<StoryResult> {
  const {
    category,
    customTag = "",
    prompt = "",
    duration = 20,
    numImages = 3,
    numParts = 1,
    excludeId = "",
  } = params;

  let catClean = category.trim();
  if (catClean.toLowerCase() === "food" || catClean.toLowerCase() === "trending") {
    catClean = "Interesting Facts";
  }
  if (!SUSPENSE_PATTERNS[catClean] && catClean !== "Interesting Facts" && catClean !== "Motivational") {
    catClean = "Others";
  }

  const clampedParts = Math.max(1, Math.min(5, Number(numParts)));
  const clampedDuration = Math.max(10, Math.min(120, Number(duration)));
  const clampedImages = Math.max(1, Math.min(5, Number(numImages)));
  const sentencesNeeded = Math.max(3, Math.min(14, Math.floor(clampedDuration / 6.5)));
  const effectiveCategory = catClean === "Others" && customTag.trim() ? customTag.trim() : catClean;

  // 1. INTERESTING FACTS
  if (catClean === "Interesting Facts") {
    const scraped = await scrapeWikipediaFact(prompt, excludeId);
    if (scraped && scraped.sentences.length >= 3) {
      const subject = scraped.subject;
      const scrapedSents = scraped.sentences;
      const baseTitle = scraped.title;
      const partsData: StoryPart[] = [];

      if (clampedParts === 1) {
        const pSentences: string[] = [
          `Have you ever wondered the bizarre true origin of ${subject}? What history books rarely tell you is that it was shaped by an unbelievable real-world accident.`,
        ];
        for (const s of scrapedSents.slice(0, sentencesNeeded - 1)) {
          if (!pSentences.includes(s)) pSentences.push(s);
        }
        pSentences.push(`Today, the legacy of ${subject} has permanently transformed our world. Save this video right now and follow for more untold daily facts!`);

        const scriptText = pSentences.join(" ");
        const scenes: StoryScene[] = [];
        for (let sIdx = 0; sIdx < clampedImages; sIdx++) {
          const sceneSentence = pSentences[Math.min(sIdx, pSentences.length - 1)] || subject;
          const sceneText = pSentences.slice(Math.min(sIdx, pSentences.length - 1), Math.min(sIdx + 2, pSentences.length)).join(" ");
          const vPrompt = buildCleanVisualPrompt(
            sceneSentence,
            subject.toLowerCase(),
            "historical origin documentary, vintage photorealistic 8k, cinematic lighting"
          );
          scenes.push({
            scene_index: sIdx,
            text: sceneText,
            visual_prompt: vPrompt,
          });
        }

        partsData.push({
          partNumber: 1,
          title: baseTitle,
          script: scriptText,
          sentences: pSentences,
          scenes,
          isLastPart: true,
        });
      } else {
        const sentsPerPart = Math.max(3, sentencesNeeded - 2);
        for (let pIdx = 0; pIdx < clampedParts; pIdx++) {
          const pNum = pIdx + 1;
          const isLast = pNum === clampedParts;
          const pSentences: string[] = [];

          if (pNum === 1) {
            pSentences.push(`Have you ever wondered the bizarre untold origin of ${subject}? What history books never teach you is that it was created by pure accident.`);
          } else {
            pSentences.push(`Welcome back to Part ${pNum}. The untold story of ${subject} takes an even stranger turn...`);
          }

          const chunkStart = (pIdx * sentsPerPart) % Math.max(1, scrapedSents.length);
          const rotated = [...scrapedSents.slice(chunkStart), ...scrapedSents.slice(0, chunkStart)];
          for (const s of rotated) {
            if (!pSentences.includes(s)) {
              pSentences.push(s);
              if (pSentences.length >= sentencesNeeded - 1) break;
            }
          }

          if (!isLast && clampedParts > 1) {
            pSentences.push(`Nobody could have predicted the unbelievable twist that happened next. Follow right now for Part ${pNum + 1}!`);
          } else {
            pSentences.push(`Today, ${subject} impacts billions of human beings across the globe. Save this video and follow for more untold origin secrets every day!`);
          }

          const scriptText = pSentences.join(" ");
          const scenes: StoryScene[] = [];
          for (let sIdx = 0; sIdx < clampedImages; sIdx++) {
            const sceneSentence = pSentences[Math.min(sIdx, pSentences.length - 1)] || subject;
            const sceneText = pSentences.slice(Math.min(sIdx, pSentences.length - 1), Math.min(sIdx + 2, pSentences.length)).join(" ");
            const vPrompt = buildCleanVisualPrompt(
              sceneSentence,
              subject.toLowerCase(),
              "historical origin documentary, vintage photorealistic 8k, cinematic lighting"
            );
            scenes.push({
              scene_index: sIdx,
              text: sceneText,
              visual_prompt: vPrompt,
            });
          }

          partsData.push({
            partNumber: pNum,
            title: `${baseTitle} (Part ${pNum}/${clampedParts})`,
            script: scriptText,
            sentences: pSentences,
            scenes,
            isLastPart: isLast,
          });
        }
      }

      return {
        category: "Interesting Facts",
        factId: scraped.id,
        overallTitle: baseTitle,
        numParts: clampedParts,
        durationPerPart: clampedDuration,
        parts: partsData,
        source: "dynamic_scraper",
      };
    }

    // Fallback to curated local pool
    const factItem = findMatchingInterestingFact(prompt, excludeId);
    const isPreviousScript = prompt.trim().length > 80 || UNTOLD_INTERESTING_FACTS.some((f) => prompt.toLowerCase().includes(f.part_1_hook.slice(0, 30).toLowerCase()));
    const baseTitle = isPreviousScript || !prompt.trim() || prompt.trim().length < 10 ? factItem.title : prompt.trim();

    const deepBackground = [
      "Behind closed doors, the initial prototypes faced relentless skepticism and doubt from industry veterans.",
      "Every conventional expert at the time insisted that this strange concept could never survive in the open market.",
      "Yet against all odds, a single breakthrough moment changed the entire trajectory of the project.",
      "The secret lied in a completely overlooked detail that none of the competitors had ever noticed.",
      "What began as an ignored laboratory anomaly soon unlocked an entirely unprecedented technological breakthrough.",
    ];

    const partsData: StoryPart[] = [];

    if (clampedParts === 1) {
      const cleanBody = factItem.part_2_body.replace(/^Welcome back to Part \d+\.\s*/, "").trim();
      const pSentences = [factItem.part_1_hook];
      for (const bg of deepBackground) {
        if (pSentences.length < sentencesNeeded - 2) pSentences.push(bg);
      }
      pSentences.push(cleanBody);
      pSentences.push(factItem.part_2_suspense);
      pSentences.push("Save this video right now and follow for more mind-bending untold facts every single day!");

      const scriptText = pSentences.join(" ");
      const scenes: StoryScene[] = [];
      for (let sIdx = 0; sIdx < clampedImages; sIdx++) {
        const sceneSentence = pSentences[Math.min(sIdx, pSentences.length - 1)] || "mind blowing untold historical mystery";
        const sceneText = pSentences.slice(Math.min(sIdx, pSentences.length - 1), Math.min(sIdx + 2, pSentences.length)).join(" ");
        const vPrompt = buildCleanVisualPrompt(
          sceneSentence,
          "mind blowing untold historical mystery",
          "mind-blowing real world discovery cosmic scientific phenomenon 8k high detail macro photography, cinematic lighting"
        );
        scenes.push({
          scene_index: sIdx,
          text: sceneText,
          visual_prompt: vPrompt,
        });
      }

      partsData.push({
        partNumber: 1,
        title: baseTitle,
        script: scriptText,
        sentences: pSentences,
        scenes,
        isLastPart: true,
      });
    } else {
      for (let pIdx = 0; pIdx < clampedParts; pIdx++) {
        const pNum = pIdx + 1;
        const isLast = pNum === clampedParts;
        const pSentences: string[] = [];

        if (pNum === 1) {
          pSentences.push(factItem.part_1_hook);
          pSentences.push("Nobody at the time questioned the real motive behind what was happening.");
          for (let bgIdx = 0; bgIdx < deepBackground.length; bgIdx++) {
            if (pSentences.length < sentencesNeeded - 1 && bgIdx % 2 === 0) {
              pSentences.push(deepBackground[bgIdx]);
            }
          }
          pSentences.push(factItem.part_1_suspense);
        } else if (isLast) {
          pSentences.push(`Welcome back to the final Part ${pNum}. The shocking truth is finally revealed.`);
          pSentences.push(factItem.part_2_body);
          for (let bgIdx = 0; bgIdx < deepBackground.length; bgIdx++) {
            if (pSentences.length < sentencesNeeded - 2 && bgIdx % 2 === 1) {
              pSentences.push(deepBackground[bgIdx]);
            }
          }
          pSentences.push(factItem.part_2_suspense);
          pSentences.push("This changed our world forever. Save this video and follow for more daily untold truths!");
        } else {
          pSentences.push(`Welcome back to Part ${pNum}. The mystery deepens further.`);
          pSentences.push(factItem.part_2_body);
          for (let bgIdx = 0; bgIdx < deepBackground.length; bgIdx++) {
            if (pSentences.length < sentencesNeeded - 1 && bgIdx % 2 === (pIdx % 2)) {
              pSentences.push(deepBackground[bgIdx]);
            }
          }
          pSentences.push(`Just when everyone believed the story was over, the real mastermind stepped forward. Follow right now for Part ${pNum + 1}!`);
        }

        const scriptText = pSentences.join(" ");
        const scenes: StoryScene[] = [];
        for (let sIdx = 0; sIdx < clampedImages; sIdx++) {
          const sceneSentence = pSentences[Math.min(sIdx, pSentences.length - 1)] || "mind blowing untold historical mystery";
          const sceneText = pSentences.slice(Math.min(sIdx, pSentences.length - 1), Math.min(sIdx + 2, pSentences.length)).join(" ");
          const vPrompt = buildCleanVisualPrompt(
            sceneSentence,
            "mind blowing untold historical mystery",
            "mind-blowing real world discovery cosmic scientific phenomenon 8k high detail macro photography, cinematic lighting"
          );
          scenes.push({
            scene_index: sIdx,
            text: sceneText,
            visual_prompt: vPrompt,
          });
        }

        partsData.push({
          partNumber: pNum,
          title: `${baseTitle} (Part ${pNum}/${clampedParts})`,
          script: scriptText,
          sentences: pSentences,
          scenes,
          isLastPart: isLast,
        });
      }
    }

    return {
      category: "Interesting Facts",
      factId: factItem.id,
      overallTitle: baseTitle,
      numParts: clampedParts,
      durationPerPart: clampedDuration,
      parts: partsData,
    };
  }

  // 2. MOTIVATIONAL STORIES (Multi-Archetype Procedural & Diverse Generation)
  if (catClean === "Motivational") {
    let availableArchetypes = MOTIVATIONAL_ARCHETYPES;
    if (excludeId) {
      const filtered = MOTIVATIONAL_ARCHETYPES.filter((a) => !excludeId.toLowerCase().includes(a.id.toLowerCase()));
      if (filtered.length > 0) availableArchetypes = filtered;
    }

    const cleanPrompt = prompt.trim().toLowerCase();
    const isPrevScript = cleanPrompt.length > 80 || MOTIVATIONAL_ARCHETYPES.some((a) => a.hooks.some((h) => cleanPrompt.includes(h.slice(0, 30).toLowerCase())));
    let chosenArchetype = availableArchetypes[Math.floor(Math.random() * availableArchetypes.length)];

    if (cleanPrompt && !isPrevScript) {
      const keywordMatch = availableArchetypes.find((a) =>
        cleanPrompt.includes(a.id) ||
        a.title.toLowerCase().includes(cleanPrompt) ||
        (a.keywords && a.keywords.some((kw) => cleanPrompt.includes(kw)))
      );
      if (keywordMatch) chosenArchetype = keywordMatch;
    }

    const storySeed = Math.floor(Math.random() * 90000) + 10000;
    const storyId = `motivational_${chosenArchetype.id}_${storySeed}`;
    const baseTitle = chosenArchetype.title;
    const vStyle = chosenArchetype.visual_style;

    const hook = chosenArchetype.hooks[Math.floor(Math.random() * chosenArchetype.hooks.length)];
    const shuffledDevs = [...chosenArchetype.developments].sort(() => Math.random() - 0.5);
    const res = chosenArchetype.resolutions[Math.floor(Math.random() * chosenArchetype.resolutions.length)];
    const cta = chosenArchetype.cta || GENRE_CTA["Motivational"][Math.floor(Math.random() * GENRE_CTA["Motivational"].length)];

    const partsData: StoryPart[] = [];

    for (let pIdx = 0; pIdx < clampedParts; pIdx++) {
      const pNum = pIdx + 1;
      const isLast = pNum === clampedParts;
      const pSentences: string[] = [];

      if (pNum === 1) {
        pSentences.push(hook);
      } else {
        pSentences.push(`Welcome back to Part ${pNum}. The struggle only deepened, but the fire inside burned hotter...`);
      }

      for (let sI = 0; sI < sentencesNeeded - 2; sI++) {
        const devIdx = (pIdx * 3 + sI) % shuffledDevs.length;
        const sent = shuffledDevs[devIdx];
        if (!pSentences.includes(sent)) {
          pSentences.push(sent);
        }
      }

      if (!isLast && clampedParts > 1) {
        const rawCliff = chosenArchetype.cliffhangers[Math.floor(Math.random() * chosenArchetype.cliffhangers.length)];
        const cliff = rawCliff.replace("{next_part}", String(pNum + 1));
        pSentences.push(cliff);
      } else {
        pSentences.push(res);
        pSentences.push(cta);
      }

      const scriptText = pSentences.join(" ");
      const scenes: StoryScene[] = [];
      for (let sIdx = 0; sIdx < clampedImages; sIdx++) {
        const sceneSentence = pSentences[Math.min(sIdx, pSentences.length - 1)] || chosenArchetype.title;
        const sceneText = pSentences.slice(Math.min(sIdx, pSentences.length - 1), Math.min(sIdx + 2, pSentences.length)).join(" ");
        const vPrompt = buildCleanVisualPrompt(
          sceneSentence,
          `${chosenArchetype.title.toLowerCase()} determination`,
          vStyle
        );
        scenes.push({
          scene_index: sIdx,
          text: sceneText,
          visual_prompt: vPrompt,
        });
      }

      const partTitle = clampedParts > 1 ? `${baseTitle} (Part ${pNum}/${clampedParts})` : baseTitle;

      partsData.push({
        partNumber: pNum,
        title: partTitle,
        script: scriptText,
        sentences: pSentences,
        scenes,
        isLastPart: isLast,
      });
    }

    return {
      category: "Motivational",
      factId: storyId,
      overallTitle: baseTitle,
      numParts: clampedParts,
      durationPerPart: clampedDuration,
      parts: partsData,
      source: "motivational_generator",
    };
  }

  // 3. OTHER GENRES (Horror, Adventure, Romance, Educational, Comedy, Music, Others)
  const genreData = SUSPENSE_PATTERNS[catClean] || SUSPENSE_PATTERNS["Others"];
  const hooks = genreData.hooks || SUSPENSE_PATTERNS["Others"].hooks;
  const developments = genreData.developments || SUSPENSE_PATTERNS["Others"].developments;
  const cliffhangers = genreData.cliffhangers || SUSPENSE_PATTERNS["Others"].cliffhangers;
  const resolutions = genreData.resolutions || SUSPENSE_PATTERNS["Others"].resolutions;
  const vStyle = genreData.visual_style || "cinematic hyperrealistic 8k masterpiece";
  const genreCtas = GENRE_CTA[catClean] || GENRE_CTA["Others"];

  const cleanPrompt = prompt.trim().toLowerCase();
  const isPrevScript = hooks.some((h) => cleanPrompt.includes(h.slice(0, 30).toLowerCase())) || cleanPrompt.length > 80;
  let baseTitle = "";
  let baseHook = "";

  if (!cleanPrompt || isPrevScript) {
    let availableHooks = hooks;
    if (excludeId || cleanPrompt) {
      const filtered = hooks.filter((h) => !cleanPrompt.includes(h.slice(0, 30).toLowerCase()) && !excludeId.toLowerCase().includes(h.slice(0, 20).toLowerCase()));
      if (filtered.length > 0) availableHooks = filtered;
    }
    baseHook = availableHooks[Math.floor(Math.random() * availableHooks.length)];
    baseTitle = baseHook.split(".")[0].trim();
  } else {
    baseTitle = prompt.trim();
    baseHook = hooks[Math.floor(Math.random() * hooks.length)];
  }

  const storySeed = Math.floor(Math.random() * 90000) + 10000;
  const storyId = `${catClean.toLowerCase()}_${storySeed}`;
  const shuffledDevs = [...developments].sort(() => Math.random() - 0.5);
  const partsData: StoryPart[] = [];

  for (let pIdx = 0; pIdx < clampedParts; pIdx++) {
    const pNum = pIdx + 1;
    const isLast = pNum === clampedParts;
    const pSentences: string[] = [];

    if (pNum === 1) {
      pSentences.push(baseHook);
    } else {
      pSentences.push(`Welcome back to Part ${pNum}. Picking up right where the story left off...`);
    }

    for (let sI = 0; sI < sentencesNeeded - 2; sI++) {
      const devIdx = (pIdx * 3 + sI) % shuffledDevs.length;
      const sent = shuffledDevs[devIdx];
      if (!pSentences.includes(sent)) {
        pSentences.push(sent);
      }
    }

    if (!isLast && clampedParts > 1) {
      const rawCliff = cliffhangers[Math.floor(Math.random() * cliffhangers.length)];
      const cliff = rawCliff.replace("{next_part}", String(pNum + 1));
      pSentences.push(cliff);
    } else {
      const res = resolutions[Math.floor(Math.random() * resolutions.length)];
      pSentences.push(res);
      const chosenCta = genreCtas[Math.floor(Math.random() * genreCtas.length)];
      pSentences.push(chosenCta);
    }

    const scriptText = pSentences.join(" ");
    const scenes: StoryScene[] = [];
    for (let sIdx = 0; sIdx < clampedImages; sIdx++) {
      const sceneSentence = pSentences[Math.min(sIdx, pSentences.length - 1)] || effectiveCategory;
      const sceneText = pSentences.slice(Math.min(sIdx, pSentences.length - 1), Math.min(sIdx + 2, pSentences.length)).join(" ");
      const vPrompt = buildCleanVisualPrompt(
        sceneSentence,
        effectiveCategory.toLowerCase(),
        vStyle
      );
      scenes.push({
        scene_index: sIdx,
        text: sceneText,
        visual_prompt: vPrompt,
      });
    }

    const partTitle = clampedParts > 1 ? `${baseTitle} (Part ${pNum}/${clampedParts})` : baseTitle;

    partsData.push({
      partNumber: pNum,
      title: partTitle,
      script: scriptText,
      sentences: pSentences,
      scenes,
      isLastPart: isLast,
    });
  }

  return {
    category: effectiveCategory,
    factId: storyId,
    overallTitle: baseTitle,
    numParts: clampedParts,
    durationPerPart: clampedDuration,
    parts: partsData,
  };
}
