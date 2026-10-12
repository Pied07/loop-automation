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
    ],
    developments: [
      "As we forced the rusted steel door open, the room inside was freezing, smelling faintly of sulfur.",
      "The shadows on the wallpaper seemed to bend in directions that contradicted the flashlight beam.",
      "A faint scratch came from inside the drywall, moving systematically from left to right.",
      "When we reviewed the camera footage from the night before, something was standing at the foot of the bed watching us breathe.",
      "The temperature dropped instantly. Every clock in the house froze at the exact same second.",
      "A single wooden chair sat in the center of the dark hall, facing the corner.",
      "We discovered handprints on the ceiling—pressed deeply into the concrete from above.",
    ],
    cliffhangers: [
      "Then the door behind us slammed shut and locked from the outside. What stepped out of the darkness will leave you sleepless... Drop a like and watch Part 2.",
      "Just as I looked into the mirror, my reflection smiled back... but I wasn't smiling. Wait until you see what happened next in Part {next_part}.",
      "A voice whispered my childhood nickname directly behind my neck. Tap follow right now for Part {next_part}.",
      "The recording suddenly cleared, revealing who was holding the camera the whole time. To see the horrifying reveal, check Part {next_part}.",
    ],
    resolutions: [
      "When the sunlight broke through the broken windows, the figure was gone—leaving only a single antique key and a note that read: 'We are already inside'.",
      "We finally decoded the audio signal: it was a distress transmission broadcasted from our own house 50 years before it was ever built.",
      "The mirror cracked in two, severing the connection forever. But every night since, the whispers have moved into the shadows under the floorboards.",
    ],
    visual_style: "dark eerie cinematic shadows mist foggy abandoned hallway volumetric lighting 8k octane render",
  },
  "Adventure": {
    hooks: [
      "Deep inside the uncharted Peruvian canyon, satellite radar detected a cavern that shouldn't exist.",
      "Three explorers descended into the deepest subterranean pit in Scandinavia, and only one returned.",
      "We crossed the perimeter of the forbidden exclusion zone where compass needles spin clockwise.",
      "In 1944, a cargo plane vanished over the Himalayas—yesterday, our drone caught its reflection in a glacial lake.",
    ],
    developments: [
      "Rappelling down the 200-meter sheer cliff, the cavern walls shifted from natural limestone to smooth obsidian blocks.",
      "Our atmospheric sensors started beeping frantically as air pressure doubled without warning.",
      "Carved into the volcanic stone were symbols identical to those found on the other side of the globe.",
      "We crossed a subterranean river whose water glowed with faint bioluminescent cyan veins.",
      "Every radio frequency fell dead silent, replaced by a rhythmic metallic pulse from below.",
    ],
    cliffhangers: [
      "That's when our lead climber pointed his spotlight across the chasm, and what he saw stopped his heart. Follow right now for Part {next_part}!",
      "A deafening rumble echoed through the cavern as the rope snapped. To see how we survived, drop a like for Part {next_part}!",
      "Behind the stone barrier wasn't an empty tomb—something alive was breathing in the dark. Part {next_part} drops tomorrow, follow now!",
    ],
    resolutions: [
      "We scrambled onto the daylight ledge with seconds to spare, clutching the obsidian artifact that would rewrite world archaeology forever.",
      "The subterranean river led directly out into a hidden prehistoric valley untouched by human civilization for ten thousand years.",
    ],
    visual_style: "epic extreme exploration majestic landscape dramatic cliff cavern mist 8k national geographic cinematography",
  },
  "Romance": {
    hooks: [
      "She received a handwritten letter in her mailbox with no stamp, postmarked thirty years in the future.",
      "Every rainy Tuesday, a stranger left a single red camellia flower on her antique shop window.",
      "He found an unlabelled photograph in a Paris flea market—and the person beside him was someone he hadn't met yet.",
    ],
    developments: [
      "The handwriting was undeniably familiar, carrying the cadence of words only two souls could know.",
      "Under the golden streetlights of the old bridge, the rain mirrored their reflections in quiet silence.",
      "Every clue led deeper into a mystery that defied time and rational explanation.",
      "Between unspoken words and stolen glances, the truth began to unravel faster than either could stop.",
    ],
    cliffhangers: [
      "Then the stranger turned around under the umbrella, and the face revealed a secret that changed everything. Follow for Part {next_part}!",
      "The final letter contained only five words that shattered their reality. See what it said in Part {next_part}!",
    ],
    resolutions: [
      "They stood under the glowing twilight, finally understanding that true love does not measure time—it creates it.",
      "The two halves of the silver locket clicked shut, reuniting a bond that had traversed decades of waiting.",
    ],
    visual_style: "warm golden hour cinematic emotional bokeh romantic sunset atmosphere 8k masterpiece",
  },
  "Motivational": {
    hooks: [
      "In 2011, he was sleeping in a broken car with zero dollars to his name and everyone calling him a failure.",
      "They told him his nervous system was permanently damaged and he would never walk again.",
      "When the factory closed and all investors walked away, he had 48 hours before bankruptcy.",
    ],
    developments: [
      "While the world slept, he was waking up at 4:00 AM every single morning to train in freezing rain.",
      "He poured every ounce of pain into absolute, unrelenting obsession with mastery.",
      "Rejection after rejection rolled in—over 300 doors slammed directly in his face.",
      "When everyone else surrendered to comfort, he doubled down on the grueling, invisible grind.",
    ],
    cliffhangers: [
      "Then on the absolute darkest day, when quitting was the only logical choice, he made a decision that shocked his entire industry. Follow for Part {next_part}!",
      "With his final ten dollars left in his pocket, he bet everything on one risky move. See the insane outcome in Part {next_part}!",
    ],
    resolutions: [
      "Ten years later, he walked into the same boardroom—not to ask for a job, but as the owner of the entire enterprise. Never let anyone write your ceiling.",
      "He crossed the finish line on his own two feet, proving that the human spirit will always overcome what logic calls impossible.",
    ],
    visual_style: "cinematic hyperrealistic dramatic golden sunrise athlete determination 8k masterpiece",
  },
  "Educational": {
    hooks: [
      "Deep in the center of the Sahara Desert lies a 40-kilometer structure so massive it can only be seen from space.",
      "Physicists ran an experiment with single photons that proved the past can be changed by the future.",
      "Underneath the ice sheets of Antarctica, scientists drilled into water that hasn't seen air for 20 million years.",
    ],
    developments: [
      "When satellite radar penetrated the sand layers, geometric concentric rings emerged identical to Plato's descriptions.",
      "The subatomic particles behaved as waves until observed, completely breaking the classical laws of causality.",
      "Water samples pulled from the subglacial lake contained microorganisms with an entirely foreign genetic code.",
      "Scientific instruments began recording anomalies that existing physics models could not explain.",
    ],
    cliffhangers: [
      "The data returned from the core sample shocked every researcher in the room. What they discovered next is going to blow your mind—follow for Part {next_part}!",
      "When the equation was calculated, the result proved our universe might not be what it seems. Watch Part {next_part} for the full revelation!",
    ],
    resolutions: [
      "The discovery proved that nature holds secrets far greater than our imaginations, opening a brand-new frontier in human science.",
      "Today, this revelation is forcing textbooks around the world to be rewritten from the ground up.",
    ],
    visual_style: "scientific cosmic discovery futuristic clean 8k unreal engine 5 render space nebula",
  },
  "Comedy": {
    hooks: [
      "My friend tried to save $50 by installing his own smart home security system using free code online.",
      "I accidentally replied-all to a 5,000-person corporate email with my grocery shopping list.",
      "He tried to impress his date by ordering in fluent French at a restaurant where the chef was from Chicago.",
    ],
    developments: [
      "By 2:00 AM, the robotic vacuum had declared itself the supreme ruler of the living room.",
      "The smart fridge locked everyone out until we solved a 3-part quadratic equation.",
      "The automatic sprinkler system synced with the bass drop of our neighbors' stereo at full blast.",
      "The waiter listened with a straight face for three solid minutes before responding in pure English.",
    ],
    cliffhangers: [
      "And just when we thought the embarrassment couldn't get any worse, the fire department arrived. Wait until you hear what happened next in Part {next_part}!",
      "Then the CEO replied to the email with an unexpected attachment. Follow right now for Part {next_part}!",
    ],
    resolutions: [
      "In the end, the vacuum ran out of battery, peace was restored, and we vowed never to touch automated home gadgets again.",
      "The company actually adopted three items from the grocery list as official snack policy, turning disaster into legend.",
    ],
    visual_style: "vibrant colorful lively expressive high energy 3d animated style 8k cheerful comedic scene",
  },
  "Music": {
    hooks: [
      "In 1978, a mysterious pirate radio station in London broadcasted a 3-minute melody that vanished forever.",
      "Musicians in Berlin discovered an underground acoustic chamber where a single guitar chord reverberates for 40 seconds.",
      "Legend says this vinyl record contains an inaudible frequency that makes listeners experience vivid dreams.",
    ],
    developments: [
      "Sound engineers analyzing the waveform discovered an embedded mathematical spiral inside the harmony.",
      "When the analog synthesizers hit 432 Hz, the vintage vacuum tubes began glowing in perfect unison.",
      "Cables hummed with resonant energy as the bass frequency resonated through the subterranean concrete floor.",
    ],
    cliffhangers: [
      "When they dropped the needle on the unlabelled B-side, the sound did something nobody expected. Follow for Part {next_part} to hear it!",
      "The recording suddenly stopped and a voice spoke through the monitor. To uncover what it said, follow for Part {next_part}!",
    ],
    resolutions: [
      "The lost frequency was finally mastered and released, proving that music is the true universal language of human consciousness.",
      "The resonance faded into pure harmonic stillness, leaving behind a timeless acoustic masterpiece.",
    ],
    visual_style: "neon cyberpunk stage lights futuristic music concert visual audio waves 8k",
  },
  "Others": {
    hooks: [
      "They told everyone the experiment was shut down in 1999, but the energy readings never dropped.",
      "In the quiet border town of Ashwood, the fog only comes when the streetlights turn green.",
      "A courier was paid $100,000 to deliver an antique briefcase to an address that has been underwater since 1920.",
    ],
    developments: [
      "The perimeter fence was reinforced with reinforced steel and warning signs in four different languages.",
      "Every step through the quiet streets revealed details that grew more surreal and displaced in time.",
      "Inside the container was a brass mechanism running without any battery or apparent power source.",
      "The instruments fluctuated violently as the atmospheric barrier began to shift.",
    ],
    cliffhangers: [
      "That's when the locking mechanism clicked open, revealing what was inside. You won't believe your eyes—follow for Part {next_part}!",
      "Behind the doorway was a sight that shattered all logic. Check Part {next_part} right now for the insane reveal!",
    ],
    resolutions: [
      "The truth was finally documented, proving that the world holds far more unexplained wonders than anyone dared to imagine.",
      "The mechanism locked back into place, sealing the mystery until the next traveler crosses the threshold.",
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
  if (!SUSPENSE_PATTERNS[catClean] && catClean !== "Interesting Facts") {
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
        const cleanKw = scriptText.replace(/[^a-zA-Z\s]/g, " ").toLowerCase().split(/\s+/).filter((w) => w.length > 3);
        for (let sIdx = 0; sIdx < clampedImages; sIdx++) {
          const chunkW = cleanKw.slice(sIdx * 4, (sIdx + 1) * 4);
          const subPrompt = chunkW.length > 0 ? chunkW.join(" ") : subject.toLowerCase();
          const vPrompt = `${subPrompt}, historical origin documentary, vintage photorealistic 8k, cinematic lighting, vertical 9:16 framing`;
          scenes.push({
            scene_index: sIdx,
            text: pSentences.slice(Math.min(sIdx, pSentences.length - 1), Math.min(sIdx + 2, pSentences.length)).join(" "),
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
          const cleanKw = scriptText.replace(/[^a-zA-Z\s]/g, " ").toLowerCase().split(/\s+/).filter((w) => w.length > 3);
          for (let sIdx = 0; sIdx < clampedImages; sIdx++) {
            const chunkW = cleanKw.slice(sIdx * 4, (sIdx + 1) * 4);
            const subPrompt = chunkW.length > 0 ? chunkW.join(" ") : subject.toLowerCase();
            const vPrompt = `${subPrompt}, historical origin documentary, vintage photorealistic 8k, cinematic lighting, vertical 9:16 framing`;
            scenes.push({
              scene_index: sIdx,
              text: pSentences.slice(Math.min(sIdx, pSentences.length - 1), Math.min(sIdx + 2, pSentences.length)).join(" "),
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
      const cleanKw = scriptText.replace(/[^a-zA-Z\s]/g, " ").toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      for (let sIdx = 0; sIdx < clampedImages; sIdx++) {
        const chunkW = cleanKw.slice(sIdx * 4, (sIdx + 1) * 4);
        const subPrompt = chunkW.length > 0 ? chunkW.join(" ") : "mind blowing untold historical mystery";
        const vPrompt = `${subPrompt}, mind-blowing real world discovery cosmic scientific phenomenon 8k high detail macro photography, vertical 9:16 framing, cinematic lighting`;
        scenes.push({
          scene_index: sIdx,
          text: pSentences.slice(Math.min(sIdx, pSentences.length - 1), Math.min(sIdx + 2, pSentences.length)).join(" "),
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
        const cleanKw = scriptText.replace(/[^a-zA-Z\s]/g, " ").toLowerCase().split(/\s+/).filter((w) => w.length > 3);
        for (let sIdx = 0; sIdx < clampedImages; sIdx++) {
          const chunkW = cleanKw.slice(sIdx * 4, (sIdx + 1) * 4);
          const subPrompt = chunkW.length > 0 ? chunkW.join(" ") : "mind blowing untold historical mystery";
          const vPrompt = `${subPrompt}, mind-blowing real world discovery cosmic scientific phenomenon 8k high detail macro photography, vertical 9:16 framing, cinematic lighting`;
          scenes.push({
            scene_index: sIdx,
            text: pSentences.slice(Math.min(sIdx, pSentences.length - 1), Math.min(sIdx + 2, pSentences.length)).join(" "),
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

  // 2. OTHER GENRES (Horror, Adventure, Romance, Motivational, Comedy, Music, etc.)
  const genreData = SUSPENSE_PATTERNS[catClean] || SUSPENSE_PATTERNS["Others"];
  const hooks = genreData.hooks || SUSPENSE_PATTERNS["Others"].hooks;
  const developments = genreData.developments || SUSPENSE_PATTERNS["Others"].developments;
  const cliffhangers = genreData.cliffhangers || SUSPENSE_PATTERNS["Others"].cliffhangers;
  const resolutions = genreData.resolutions || SUSPENSE_PATTERNS["Others"].resolutions;
  const vStyle = genreData.visual_style || "cinematic hyperrealistic 8k masterpiece";

  const isPrevScript = hooks.some((h) => prompt.toLowerCase().includes(h.slice(0, 30).toLowerCase())) || prompt.length > 80;
  let baseTitle = "";
  let baseHook = "";

  if (!prompt.trim() || isPrevScript) {
    const availableHooks = hooks.filter((h) => !prompt.toLowerCase().includes(h.slice(0, 30).toLowerCase()));
    baseHook = availableHooks.length > 0 ? availableHooks[Math.floor(Math.random() * availableHooks.length)] : hooks[0];
    baseTitle = baseHook.split(".")[0].trim();
  } else {
    baseTitle = prompt.trim();
    baseHook = hooks[Math.floor(Math.random() * hooks.length)];
  }

  const shuffledDevs = [...developments].sort(() => Math.random() - 0.5);
  const partsData: StoryPart[] = [];

  for (let pIdx = 0; pIdx < clampedParts; pIdx++) {
    const pNum = pIdx + 1;
    const isLast = pNum === clampedParts;
    const pSentences: string[] = [];

    if (pNum === 1) {
      pSentences.push(baseHook);
    } else {
      pSentences.push(`Welcome back to Part ${pNum}. Picking up right where the mystery left off...`);
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
      pSentences.push("The mystery is finally resolved. Save this video and follow for the next thrilling story!");
    }

    const scriptText = pSentences.join(" ");
    const scenes: StoryScene[] = [];
    const cleanKw = scriptText.replace(/[^a-zA-Z\s]/g, " ").toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    for (let sIdx = 0; sIdx < clampedImages; sIdx++) {
      const chunkW = cleanKw.slice(sIdx * 4, (sIdx + 1) * 4);
      const subPrompt = chunkW.length > 0 ? chunkW.join(" ") : effectiveCategory.toLowerCase();
      const vPrompt = `${subPrompt}, ${vStyle}, vertical 9:16 framing, photorealistic cinematic lighting`;
      scenes.push({
        scene_index: sIdx,
        text: pSentences.slice(Math.min(sIdx, pSentences.length - 1), Math.min(sIdx + 2, pSentences.length)).join(" "),
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
    overallTitle: baseTitle,
    numParts: clampedParts,
    durationPerPart: clampedDuration,
    parts: partsData,
  };
}
