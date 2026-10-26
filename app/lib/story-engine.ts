export interface StoryScene {
  scene_index: number;
  text: string;
  visual_prompt: string;
  image_url?: string;
}

export interface StoryPart {
  partNumber: number;
  title: string;
  script: string;
  sentences: string[];
  scenes: StoryScene[];
  isLastPart: boolean;
}

export interface StoryGenerationResult {
  category: string;
  overallTitle: string;
  numParts: number;
  durationPerPart: number;
  parts: StoryPart[];
  factId?: string;
  source?: string;
}

export function buildCleanVisualPrompt(
  sceneText: string,
  fallbackSubject: string,
  styleDescriptor: string
): string {
  let clean = sceneText
    .replace(/\b(?:Part\s+\d+|Welcome back to Part\s+\d+|Follow for Part\s+\d+|Watch Part\s+\d+|Save this video|follow for your daily drive|follow for more|subscribe|share this|comment below)[^.]*/gi, "")
    .replace(/\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|eighteen|twenty|thirty|forty|fifty|hundred|thousand|million)\s+(?:times|doors|days|hours|years|copies|rejections)\b/gi, "")
    .replace(/\b(?:spinal mobility|highway crash|car crash|crash|paralysis|paralyzed|wheelchair|crutches|rehabilitation|hospital|amputation|injured|injury|deformity|deformed|broken|surgery|disease|sick|illness|twisted|severed|bleeding|wound)\b/gi, "")
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

  const isHorror = /horror|haunted|ghost|demon|creepy|paranormal|nightmare|asylum|spectral|phantom|shadow/i.test(`${sceneText} ${fallbackSubject} ${styleDescriptor}`);
  const isRealism = /realism|photoreal|35mm/i.test(styleDescriptor);

  let sceneComposition = "";
  if (isHorror) {
    sceneComposition = "cinematic wide-angle horror film still, terrifyingly creepy atmosphere, pale ghostly apparition with hollow dark eyes, creepy spectral face in the shadows, supernatural mist, haunted abandoned environment, spine-chilling horror movie cinematography, James Wan and Guillermo del Toro aesthetic, 35mm film grain, 8k scary masterpiece";
  } else if (isRealism) {
    const faceQuality = "perfect facial symmetry, symmetrical almond eyes, centered focused pupils, harmonious facial features, beautiful natural smile, clean human anatomy";
    sceneComposition = `cinematic wide-angle environmental establishing shot, dynamic action in full scene, deep background architecture and scenery, atmospheric environmental storytelling, ${faceQuality}, natural skin texture, photorealistic 8k`;
  } else {
    const faceQuality = "perfect facial symmetry, symmetrical almond eyes, centered focused pupils, harmonious facial features, beautiful natural smile, clean human anatomy";
    sceneComposition = `cinematic wide-angle environmental establishing shot, dynamic action in full scene, deep background architecture and scenery, atmospheric environmental storytelling, ${faceQuality}, unified artistic illustration, seamless character rendering, no deformed face, no collage`;
  }

  return `Cinematic scene of ${clean}, ${sceneComposition}, ${styleDescriptor}, vertical 9:16 framing`;
}

export const GENRE_CTA: Record<string, string[]> = {
  Action: [
    "Drop a like right now if you felt that adrenaline! Subscribe for daily high-octane blockbusters!",
    "Share this with someone who loves intense tactical thrillers! Follow for daily action missions!",
    "Double-tap if you survived that ride! Subscribe and never miss the next high-speed chase!"
  ],
  Horror: [
    "Save this video if you dare, and follow right now for the next chilling encounter!",
    "Turn off the lights and follow for daily terrifying encounters from the dark!",
    "Would you have stayed or run for your life? Drop your thoughts below and subscribe for more chills!"
  ],
  "Interesting Facts": [
    "Which of these facts blew your mind the most? Drop your thoughts below and subscribe for daily revelations!",
    "Follow for your daily dose of unbelievable history, science, and mysteries!",
    "Share this with a curious mind! Subscribe right now for daily mind-bending knowledge!"
  ],
  Motivational: [
    "Never surrender when the world doubts your vision. Save this video and follow for daily inspiration!",
    "Drop a comment if you are building something extraordinary today! Subscribe for daily drive!",
    "Discipline always beats talent. Follow right now and claim your greatness every morning!"
  ],
  Adventure: [
    "Would you dare explore these uncharted depths? Subscribe for daily epic expeditions!",
    "Hit follow and join the crew for the greatest explorations across history and legend!",
    "Save this video for your next travel inspiration! Follow for daily wilderness quests!"
  ],
  Romance: [
    "True love always finds a way across time and distance. Follow for more heartfelt stories!",
    "Tag the person who makes your world feel complete! Follow for daily romantic journeys!",
    "Save this video and share it with someone special. Follow for stories of undeniable destiny!"
  ],
  Comedy: [
    "Drop a like if you burst out laughing! Follow for daily hilarious chaotic moments!",
    "Share this with the friend who would definitely do this! Subscribe for daily comedy gold!",
    "Double-tap if you saw that coming! Follow for more ridiculous daily misadventures!"
  ],
  Others: [
    "Follow right now for daily mind-blowing stories you will never forget!",
    "Subscribe for your daily dose of extraordinary viral tales!",
    "Save this video and share it with your friends! Follow for daily premier content!"
  ]
};

interface DynamicStoryArchetype {
  id: string;
  title: string;
  char1: string;
  char2: string;
  enemy: string;
  setting: string;
  visual_style: string;
  hooks: string[];
  beats: string[];
  expansions: string[];
  cliffhanger: string;
}

const PROCEDURAL_STORIES: Record<string, DynamicStoryArchetype[]> = {
  Horror: [
    {
      id: "horror_blackwood_sanatorium",
      title: "The Whispers of Blackwood Sanatorium",
      char1: "Julian Croft, veteran paranormal investigator",
      char2: "Dr. Eleanor Ward, psychiatric archivist",
      enemy: "The Pale Entity of Ward 4",
      setting: "the abandoned Blackwood Sanatorium sealed since 1942",
      visual_style: "cinematic horror movie still, terrifyingly creepy atmosphere, pale ghostly apparition with hollow dark eyes, spectral face in shadows, haunted asylum corridor, 35mm film grain, 8k scary masterpiece",
      hooks: [
        "Julian Croft, a veteran paranormal investigator, and Dr. Eleanor Ward, a psychiatric archivist, broke the rusted chain on the double doors of Blackwood Sanatorium at exactly 3:15 AM as an unnatural freezing fog rolled across the floor.",
        "Standing inside the rotunda of the sealed Blackwood Sanatorium, Julian Croft and Dr. Eleanor Ward watched their breath crystallize into thick plumes as the intercom system crackled to life after eighty years of silence."
      ],
      beats: [
        "Julian clicked on his ultraviolet lantern, revealing fresh handprints pressed into the peeling ceiling paint, facing directly toward them.",
        "'The records state that Ward 4 was sealed overnight after twelve patients and three doctors vanished without a sound,' Eleanor whispered, her thermal gauge plunging to minus twenty.",
        "From the far end of the darkened hydrotherapy hall, the rhythmic sound of wet, barefoot footsteps began slapping against the rusted linoleum.",
        "A disembodied voice hissed Eleanor's full name from inside the bricked-up ventilation flue, vibrating the concrete beneath their boots.",
        "The shadows along the corridor detached themselves from the walls, coalescing into a tall, pale figure with hollow, void-like eye sockets.",
        "'Julian, look at the mirror behind you!' Eleanor gasped, freezing in place as the reflection showed the entity standing inches behind his neck.",
        "Julian raised his crucifix and emergency flare, the crimson sparks illuminating a contorted spectral face grinning without a sound.",
        "Heavy iron fire doors slammed shut down the entire wing with a deafening bang, trapping them inside the pitch-black corridor as the footsteps accelerated directly toward them."
      ],
      expansions: [
        "The air smelled heavily of sulfur, stagnant river water, and ozone as the entity glided forward without its feet touching the floor.",
        "Eleanor scrambled to decode the Latin inscription carved into the brass threshold, her fingers trembling against the icy metal.",
        "'It feeds on fear and isolation,' Julian warned, keeping his back pressed against Eleanor's as cold fingers brushed against his temple.",
        "Every clock mounted on the peeling hospital walls began spinning wildly backward, their ticking accelerating to a frantic heartbeat.",
        "A child's music box in the corner began playing a distorted, minor-key lullaby, though its brass gears had rusted solid decades ago.",
        "The temperature dropped so violently that frost feathered across the lenses of their protective respirators.",
        "In the darkness above, the ceiling seemed to dissolve into an infinite abyss from which dozens of pale faces looked down with sorrowful, unblinking eyes.",
        "Julian discharged the emergency magnesium flare, illuminating the horrifying truth: they were surrounded by dozens of silent, motionless phantoms standing shoulder to shoulder."
      ],
      cliffhanger: "As Julian's flare sputtered into dying embers, the pale entity reached out with elongated black claws and whispered, 'You belong to Ward 4 now'... Follow right now for Part 2 to see if they survive!"
    },
    {
      id: "horror_cape_sorrow_lighthouse",
      title: "The Phantom Light of Cape Sorrow",
      char1: "Silas Kane, night-watch lighthouse keeper",
      char2: "Evelyn Frost, maritime historian",
      enemy: "The Drowned Crew of the Mary Celeste",
      setting: "an isolated sea-swept lighthouse battered by black ocean swells",
      visual_style: "creepy cinematic horror still, dark ocean storm, pale ghostly face peering through rain-streaked window, glowing spectral eyes, eerie green lantern light, 35mm film grain, 8k scary atmosphere",
      hooks: [
        "Silas Kane, the newly appointed lighthouse keeper at Cape Sorrow, and Evelyn Frost, a maritime historian investigating a century of vanished keepers, climbed the spiral iron stairs as black ocean swells violently battered the granite foundation.",
        "At midnight during the fiercest gale of the century, Silas Kane and Evelyn Frost watched the primary lighthouse beacon flicker out, replaced by an eerie, sickly green luminescence rotating from the lantern room."
      ],
      beats: [
        "Evelyn examined the brass logbook bolted to the console, its final entry from 1924 written in trembling handwriting: 'They walk upon the waves at high tide.'",
        "A sudden violent thud shook the storm shutters, followed by the wet scraping of fingernails across the exterior frosted glass eighty feet above the sea.",
        "'Silas, look down at the breakers!' Evelyn shouted, pointing her searchlight into the churning black foam below the cliff.",
        "Standing motionless upon the crest of thirty-foot waves were dozens of pale, waterlogged figures in antique naval uniforms, their hollow eyes staring upward.",
        "The radio transceiver erupted with frantic static feedback, transmitting the sound of drowning sailors gasping for breath beneath the tide.",
        "Water began seeping up through the seams of the granite floorboards, cold as liquid ice and smelling of ancient brine and decaying seaweed.",
        "The heavy iron trapdoor leading to the lantern room flew open with thunderous force, revealing a shadowy, drenched silhouette standing at the top of the stairs.",
        "Silas gripped his brass emergency flare gun, his knuckles whitening as the figure took three deliberate, squelching steps downward into the beam of light."
      ],
      expansions: [
        "The sea air grew so dense and humid that breathing felt like inhaling heavy seawater into their burning lungs.",
        "Evelyn recognized the silver captain's badge pinned to the entity's rotted coat—it belonged to Captain Hastings, who drowned in 1888.",
        "'The lighthouse was never built to guide ships home,' Silas realized with mounting dread. 'It was built as a cage to hold them back from the shore.'",
        "Outside, lightning splintered the midnight sky, illuminating hundreds of spectral sailors climbing the sheer wet cliffs like spiders.",
        "The green light of the beacon pulsed in rhythm with a low, subterranean vibration that made their teeth ache.",
        "A withered, pale hand with blackened fingernails wrapped around the iron handrail, pulling the dripping entity into full view.",
        "Its jaw dropped open unnaturally wide, emitting a bone-chilling shriek that shattered three of the reinforced observation panes.",
        "Icy sea spray burst into the tower, extinguishing Silas's lantern and plunging them into near-total darkness punctuated only by the sweep of the green beacon."
      ],
      cliffhanger: "As the drenched figure extended a freezing hand toward Evelyn's throat, the emergency spiral staircase collapsed behind them, cutting off their only retreat... Follow right now for Part 2 to see the conclusion!"
    },
    {
      id: "horror_inverted_mirror",
      title: "The Inverted Reflection of Blackwood Manor",
      char1: "Detective Marcus Cross, unsolved crimes investigator",
      char2: "Sarah Blackwood, antiquarian restorer",
      enemy: "The Mirror Entity of Countess Vane",
      setting: "the decaying parlor of Blackwood Manor under a full blood moon",
      visual_style: "terrifying horror film cinematography, cracked antique mirror, ghostly pale doppelganger with black void eyes, creepy atmospheric lighting, 35mm film still, 8k scary masterpiece",
      hooks: [
        "Detective Marcus Cross and Sarah Blackwood removed the dust sheet covering the seven-foot Venetian glass mirror in the parlor of Blackwood Manor, unaware that the glass had been turned toward the wall for two centuries for a terrifying reason.",
        "Standing before the ornate gilded mirror of Countess Vane, Detective Marcus Cross and Sarah Blackwood noticed a sickening detail: their reflections in the glass were not blinking at the same time."
      ],
      beats: [
        "Sarah stepped forward to inspect the silver filigree frame, but her reflection in the glass remained standing perfectly still, watching her with an unnerving, frozen smile.",
        "'Marcus... don't look into the glass,' Sarah whispered, her heart hammering against her ribs as the temperature in the room dropped thirty degrees.",
        "The reflection of Marcus inside the mirror slowly raised its arm, pointing a blackened finger directly at the real Marcus standing in the room.",
        "A sound like cracking ice echoed across the parlor as thin crimson fractures spread outward from the center of the mirror.",
        "The candles on the mantle flickered violently and died, leaving only the blood-red moonlight streaming through the velvet drapes.",
        "From within the depth of the mirror, the sound of weeping began—slow, mournful, and getting closer with every passing second.",
        "The surface of the glass rippled like dark liquid, and two pale, translucent hands pushed through the solid glass into the real world.",
        "Marcus drew his service weapon and fired a round into the frame, but the bullet simply vanished into the mirror's dark void without leaving a scratch."
      ],
      expansions: [
        "The entity pushing through the mirror had Sarah's exact facial structure, but its eyes were bottomless pits of pure, malevolent darkness.",
        "'The mirror does not reflect reality,' Sarah read from her grandfather's journal with trembling hands. 'It trades places with whoever stares too long.'",
        "Marcus reached for Sarah's jacket, pulling her backward as the ghostly doppelganger's icy breath brushed across his cheek.",
        "The floorboards beneath their boots turned transparent, showing an infinite upside-down version of the mansion descending into darkness beneath their feet.",
        "A chorus of whispered warnings echoed from the grandfather clock, repeating the names of everyone who had entered this room since 1890.",
        "The doppelganger stepped fully out of the glass frame onto the Persian rug, leaving wet, freezing footprints of black water behind it.",
        "Every mirror and window in the estate began vibrating in resonance, reflecting hundreds of variations of the smiling entity.",
        "Marcus realized with cold terror that his own shadow was no longer connected to his shoes—it was standing behind the entity, bowing toward the glass."
      ],
      cliffhanger: "Just as the entity whispered in Sarah's own voice, 'Thank you for freeing me,' the front doors bolted themselves from the outside and the lights went out... Follow right now for Part 2 to see who escapes!"
    },
    {
      id: "horror_devil_ridge_mimic",
      title: "The Mimic in Devil's Ridge",
      char1: "Caleb Finch, Appalachian park ranger",
      char2: "Dr. Nora Hastings, wildlife acoustic biologist",
      enemy: "The Ancient Skinwalker of the Pines",
      setting: "an isolated fire lookout tower surrounded by freezing fog and black pines",
      visual_style: "deep woods atmospheric horror, tall sinister entity with glowing pale eyes lurking behind fog-draped pine trees, terrifying creature silhouette, creepy cold aesthetic, 35mm horror cinematography, 8k",
      hooks: [
        "Ranger Caleb Finch and acoustic biologist Dr. Nora Hastings were analyzing mysterious ultrasonic audio anomalies from the Devil's Ridge basin when they heard Nora's own voice calling for help from the dark forest below the fire tower.",
        "Perched eighty feet above the dense canopy of Devil's Ridge, Caleb Finch and Dr. Nora Hastings locked the lookout tower's steel trapdoor after motion sensors detected something moving at sixty miles per hour on two legs through the snow."
      ],
      beats: [
        "Nora played back the hydrophone recording captured five minutes earlier: a perfect, synthetic replica of Caleb's voice begging to be let inside the tower.",
        "'Caleb, whoever is speaking on that frequency is standing directly beneath our ladder right now,' Nora whispered, pointing the infrared scope into the trees.",
        "Through the thermal imaging lens, a towering, nine-foot silhouette was coiled at the base of the tower, radiating zero body heat against the blue snow.",
        "The creature began tapping on the steel support struts—rhythmic, metallic clangs that vibrated through the floorboards under their boots.",
        "Suddenly, the radio transceiver crackled to life, broadcasting the frantic breathing of someone trapped inside this very room with them.",
        "Caleb shone his spotlight over the railing, catching a brief, horrifying glimpse of a pale, elongated face with unblinking eyes peering up from the darkness.",
        "The ladder began rattling violently as the creature ascended forty rungs in less than three seconds with inhuman, silent agility.",
        "Caleb racked his shotgun, leveling the barrel dead center at the reinforced roof hatch as wood began splintering above their heads."
      ],
      expansions: [
        "The forest outside fell completely silent—no wind, no nocturnal birds, no rustling branches—only the oppressive weight of a predatory intelligence.",
        "Nora's acoustic analyzer showed that the entity was emitting infrasound frequencies designed to induce paralysis and vertigo in human prey.",
        "'Native folklore called it the Forest Walker,' Caleb whispered, feeling the cold air seep through the cracked glass.",
        "A pale, clawed hand with gray leather-like skin wrapped around the exterior window sill, tapping three times on the glass.",
        "From the other side of the glass, a voice spoke with chilling perfection—using Caleb's mother's voice, pleading with him to open the door.",
        "The spotlight bulb exploded in a shower of sparks as an electromagnetic surge swept through the cabin's solar generator.",
        "Through the cracked window, two glowing amber eyes locked onto Nora, unblinking and devoid of any human empathy.",
        "The entire wooden lookout tower began swaying from side to side as immense weight shifted onto the observation deck."
      ],
      cliffhanger: "With a sickening screech of bending metal, the roof hatch was torn clean off its hinges into the black sky, and the creature dropped inside... Follow right now for Part 2 to see what happens next!"
    }
  ],
  Action: [
    {
      id: "action_iron_phantom",
      title: "Operation Iron Phantom",
      char1: "Agent Leo Sterling, elite black ops operative",
      char2: "Maya Ray, tactical electronic warfare specialist",
      enemy: "The Black Dagger Syndicate",
      setting: "a high-speed magnetic bullet train speeding through alpine tunnels",
      visual_style: "cinematic wide-angle Hollywood blockbuster action sequence, explosive debris and sparks, dynamic motion blur, high-octane battle scene, dramatic rim lighting, 8k octane render, natural human anatomy, vertical 9:16 framing",
      hooks: [
        "Agent Leo Sterling, an elite black ops operative, and Maya Ray, a tactical electronic warfare specialist, magnetized their boots to the roof of the high-speed Maglev bullet train hurtling at three hundred miles per hour through the Swiss Alps.",
        "With the border checkpoint less than four minutes away, Agent Leo Sterling and Maya Ray breached the armored roof hatch of Car 4 as sixteen mercenary laser sights snapped directly onto their position."
      ],
      beats: [
        "High-altitude wind screamed past Leo's tactical visor as Maya connected an override clamp to the train's armored dorsal hatch.",
        "'Security feeds show sixteen armed mercenaries securing the central biometric vault in Car 4, Leo,' Maya warned through the comms.",
        "Leo primed his suppressed submachine gun, checking the chamber with fluid, practiced precision.",
        "Beneath their boots, the magnetic rails hummed with thousands of volts of raw electrical power as the train entered an unlit mountain tunnel.",
        "Maya bypassed the hydraulic lock in four seconds, sparks showering across the graphite roof as the hatch hissed open.",
        "'Drop in three... two... one... execute!' shouted Leo, dropping feet-first into the darkened maintenance corridor.",
        "Two syndicate guards spun around with automatic weapons, but Leo neutralized both with lightning-fast close-quarters strikes before they could raise an alarm.",
        "Red emergency strobes bathed the narrow passage in rhythmic crimson pulses as reinforcements converged from both ends of the train."
      ],
      expansions: [
        "Maya dropped down behind him, deploying a miniature acoustic drone that mapped enemy positions through the reinforced steel doors.",
        "'They have installed a seismic charge on the central coupling,' Maya whispered, tapping the holographic tactical display on her wrist.",
        "'If the mercenaries realize they are cornered, they will decouple the passenger cars into the canyon abyss.'",
        "Leo advanced with tactical discipline, slicing through the smoke-filled galley with his weapon held at high-ready.",
        "Through the panoramic passenger windows, snow-capped alpine peaks blurred past like jagged razor blades under the moonlight.",
        "Leo breached the double security blast doors of Car 4, where the syndicate commander stood with his finger resting over a remote detonator.",
        "'Step away from the console, Sterling,' Leo commanded, his laser sight locked dead center on the detonator's transceiver.",
        "A hail of automatic rifle fire from concealed side alcoves ricocheted off Leo's ballistic shield as reinforcements converged."
      ],
      cliffhanger: "Suddenly, heavy footsteps thundered on the exterior metal roof directly above their heads as thermal lances began slicing through the ceiling... Follow right now for Part 2 to see the explosive climax!"
    }
  ],
  "Interesting Facts": [
    {
      id: "facts_mariana_anomaly",
      title: "The Unexplained Mystery of Challenger Deep",
      char1: "Dr. Sylvia Earle, deep oceanographer",
      char2: "Commander James Reed, submersible pilot",
      enemy: "The Unmapped Abyssal Trench",
      setting: "the midnight depths of the Mariana Trench, 36,000 feet beneath the surface",
      visual_style: "cinematic National Geographic deep sea exploration, submersible headlights cutting into pitch black abyssal waters, bioluminescent creatures, ultra-detailed 8k, photorealistic oceanic depth",
      hooks: [
        "At thirty-six thousand feet beneath the Pacific Ocean inside the deep-sea submersible Triton-X, Dr. Sylvia Earle and Commander James Reed detected an acoustic pulse that defied every known law of marine biology.",
        "Thirty-six thousand feet below the surface in the freezing darkness of the Mariana Trench, Dr. Sylvia Earle and James Reed realized their sonar was bouncing off a geometric metallic structure three miles long."
      ],
      beats: [
        "The water pressure outside the titanium sphere reached eight tons per square inch—equivalent to balancing fifty jumbo jets on top of the hull.",
        "'Our hydrophones are picking up a synchronized, low-frequency acoustic oscillation repeating every 4.2 seconds,' Sylvia whispered, staring at the sonar console.",
        "James adjusted the forward halogen floodlights, cutting through the abyssal blackness to illuminate the ocean floor.",
        "Beneath the beam lay an expanse of white calcified rock carved with repeating parallel grooves that stretched into the darkness.",
        "No sunlight had penetrated these waters in over four billion years, yet biological sensors detected intense organic heat signatures emanating from the seabed.",
        "A school of transparent, bioluminescent siphonophores drifted past the viewing port, their glowing blue filaments pulsing in sync with the mysterious acoustic signal.",
        "'James, look at the depth gauge—we are two thousand feet deeper than the official geological charts indicate,' Sylvia warned.",
        "A massive shadow passed directly beneath their keel, larger than any blue whale on record, sending shockwaves through the submersible's hull."
      ],
      expansions: [
        "The temperature of the water outside should have been near freezing, but the external thermal probes read an astonishing eighty degrees Fahrenheit.",
        "Sylvia synchronized the digital recorder, mapping the acoustic waveform against historical Navy sonar archives dating back to 1960.",
        "'This signal matches the legendary Bloop recorded in 1997, but with fifteen times the harmonic complexity,' Sylvia explained with awe.",
        "James initiated the vertical thrusters, maneuvering the submersible toward a towering subterranean ridge that rose like an underwater mountain.",
        "Along the ridge wall, vents of mineral-rich water billowed into the black void, supporting bizarre colonies of giant hydrothermal tube worms.",
        "Every instrument on the navigation console began registering mild electromagnetic fluctuations that caused their compass to spin slowly.",
        "Through the panoramic acrylic viewport, the headlights caught the unmistakable reflection of a crystalline mineral unknown to terrestrial science.",
        "As the robotic manipulator arm extended to collect a core sample, a deafening acoustic chime vibrated through the titanium sphere."
      ],
      cliffhanger: "Then the seabed beneath them began to shift, revealing that what they believed was a geological ridge was slowly opening its immense bioluminescent eyes... Follow right now for Part 2 to uncover the truth!"
    }
  ],
  Motivational: [
    {
      id: "motivational_frost_track",
      title: "The Undefeated Champion's Return",
      char1: "Maya Lin, champion world-record marathon runner",
      char2: "Coach Thomas Vance, veteran athletic mentor",
      enemy: "The mental barrier of doubt and past defeat",
      setting: "an empty frozen athletic stadium track at 5:00 AM",
      visual_style: "cinematic inspirational sports documentary film still, cold breath in winter air, intense focused gaze, dramatic stadium spotlight, photorealistic 8k, heroic atmosphere",
      hooks: [
        "Maya Lin, an undeterred marathon runner returning to elite competition against all odds, stood on the frozen stadium track with Coach Thomas Vance at 5:00 AM as sub-zero wind whipped across the red lanes.",
        "Six months after critics claimed she would never run again, Maya Lin laced up her flats on an empty, snow-dusted track with Coach Thomas Vance standing by with a vintage stopwatch."
      ],
      beats: [
        "Her former sponsors had terminated every contract, yet here she stood in the silence before dawn, refusing to let circumstances define her fate.",
        "'Nobody expects you to run today, Maya,' Coach Thomas Vance said quietly. 'The only person you have to prove anything to is yourself.'",
        "She exhaled a plume of white steam into the freezing morning air, adjusting her shoes and locking her eyes on the first bend.",
        "Every stride during the first lap sent waves of burning ache through her conditioned muscles, tempting her mind to surrender to comfort.",
        "Her fingers trembled as she looked down at the empty lanes where she had once broken national records under the roar of thousands.",
        "'Discipline isn't built when everyone is cheering in the stands,' Thomas called out. 'It is forged in the silence when nobody believes you will make it.'",
        "With relentless grit clenched between her teeth, Maya dug her running flats into the rubber and launched into an explosive, commanding pace.",
        "One lap turned into five, then ten, through the biting wind as her stride lengthened with ferocious elegance."
      ],
      expansions: [
        "The stadium floodlights hummed softly above, illuminating a solitary warrior who refused to negotiate with weakness.",
        "Thomas watched with quiet pride, checking the split times on his chronometer as her pace steadily accelerated past her personal bests.",
        "The doubt that had weighed down her mind for months began to incinerate under the heat of pure, uncompromising determination.",
        "She realized that pain was temporary, but quitting would remain a permanent stain on her soul.",
        "When ordinary people would have thrown in the towel and walked away, she dug deeper into her spiritual reservoir.",
        "The sun began to peek over the stadium bleachers, casting a long golden shadow across the final hundred meters.",
        "Every breath burned in her chest, but it was the burn of life returning to a warrior who refused to surrender.",
        "Thomas paced along the infield grass, shouting: 'Feel the track beneath you, Maya! You are writing history with every single step!'"
      ],
      cliffhanger: "As she crossed the finish line in world-record pace under the golden sunrise, Thomas turned the stopwatch toward her with tears in his eyes... Save this video right now and follow for Part 2!"
    }
  ],
  Adventure: [
    {
      id: "adventure_mayan_cenote",
      title: "The Lost Cenote of the Sun God",
      char1: "Nathan Drake, seasoned expedition leader",
      char2: "Elena Cruz, archaeological cartographer",
      enemy: "The Subterranean Labyrinth",
      setting: "a deep limestone cenote buried beneath the Yucatan rainforest",
      visual_style: "cinematic Indiana Jones adventure movie still, sunbeams piercing through lush jungle canopy into turquoise underground water, ancient carved stone ruins, 8k masterpiece",
      hooks: [
        "Nathan Drake, a seasoned expedition leader, and Elena Cruz, an archaeological cartographer, rappelled two hundred feet down into the flooded limestone cenote deep within the uncharted Yucatan rainforest.",
        "Standing knee-deep in subterranean turquoise water beneath a ceiling of tangled jungle roots, Nathan Drake and Elena Cruz uncovered the sealed glyph doors of the lost Sun God temple."
      ],
      beats: [
        "Nathan clicked on his halogen lantern, illuminating colossal stone serpent statues guarding a submerged stone staircase that led into the darkness.",
        "'The Spanish conquistadors spent thirty years searching the coast for this temple, Nathan,' Elena whispered, checking her lidar scanner.",
        "The scanner screen flashed green, revealing a subterranean palace complex spanning three miles beneath the jungle floor.",
        "A sudden mechanical grinding sound echoed from within the carved stone pillars as centuries-old counterweights shifted.",
        "Water began cascading from hidden aqueducts along the walls, filling the basin with clear, mineral-rich mountain water.",
        "'Step on the carved sun stones only, Elena,' Nathan warned, testing each flagstone with his climbing pole before taking a stride.",
        "At the center of the subterranean courtyard stood a golden sundial illuminated by a single shaft of sunlight piercing the jungle canopy above.",
        "As Elena brushed moss from the dial's central prism, a hidden chamber opened in the bedrock, revealing the legendary Sun Mask gleaming in the torchlight."
      ],
      expansions: [
        "The air was fresh and cool, carrying the sweet scent of wild vanilla orchids growing on the damp limestone ledges.",
        "Elena documented the intricate calendar glyphs carved into the gold filigree, dating the craftsmanship to 800 BC.",
        "'This mask was designed to predict solar eclipses with mathematical precision,' Elena said with wonder.",
        "Nathan examined the perimeter walls, noting the ancient pressure plates that protected the inner sanctum from looters.",
        "In the crystal-clear pool below, schools of blind cave fish darted through submerged marble arches.",
        "A flock of emerald parrots screamed in the canopy high above, their calls echoing down into the cavern like celestial music.",
        "Every detail in the stone architecture pointed to a civilization with advanced knowledge of astronomy and hydraulics.",
        "Nathan secured the golden artifact into his padded expedition pack just as the shaft of sunlight began to shift across the dial."
      ],
      cliffhanger: "Suddenly, a series of heavy granite slabs began dropping from the ceiling, sealing the exit shaft above... Follow right now for Part 2 to see how they escape!"
    }
  ]
};

// Export for backwards compatibility with any component referencing it
export const CHARACTER_ENSEMBLES = Object.values(PROCEDURAL_STORIES).flat();

export function getDynamicDeepeningBeats(
  char1: string,
  char2: string,
  enemy: string,
  setting: string,
  genre: string,
  count = 40
): string[] {
  const c1Name = char1.split(",")[0].trim();
  const c2Name = char2.split(",")[0].trim();
  const isHorror = /horror|ghost|haunt|creepy|demon|spectral/i.test(genre);

  const horrorTemplates = [
    `${c1Name} held up the electromagnetic sensor, watching the needle peg into the red as a hollow voice whispered from the darkness.`,
    `A freezing draft swept through ${setting}, extinguishing the emergency lantern and leaving only the sickly amber glow of their flashlight.`,
    `${c2Name} traced the claw marks gouged deeply into the solid oak paneling, noting that each mark ended in a pool of frost.`,
    `From the shadows above their heads, the sound of rhythmic, deliberate crawling echoed across the ceiling beams.`,
    `${c1Name} stepped forward, his boots crunching over decayed glass as the faint outline of a pale spectral face watched from the doorway.`,
    `The reflection in the dark window did not move when ${c2Name} turned her head—instead, the ghostly apparition grinned with malevolent void eyes.`,
    `An ancient brass bell in the distance began to toll twelve times, though the rope had rotted away decades ago.`,
    `${c1Name} gripped ${c2Name}'s arm, pointing the beam toward a tall silhouette that detached itself from the wall and glided toward them.`,
    `Every electrical meter in their pack surged with unholy static feedback as the temperature plummeted forty degrees in seconds.`,
    `${c2Name} quickly drew a circle of protective salt across the threshold, chanting the binding verses as the walls began to groan.`,
    `The disembodied whispers inside the ventilation shaft grew so deafening that ${c1Name} had to shout over the supernatural noise.`,
    `A heavy oak door slammed shut with thunderous force behind them, the iron deadbolt sliding into place without human touch.`,
    `${c1Name} knew that whatever haunted ${setting} had no intention of allowing them to see the morning sun.`,
    `The air turned suffocatingly thick with the stench of ancient tomb dust, damp sulfur, and ozone as the entity closed in.`,
    `${c2Name} pulled an antique silver talisman from her pocket, its surface vibrating with intense harmonic resonance.`,
    `Two burning crimson pinpricks of light ignited in the center of the dark corridor, fixing their unblinking gaze directly on ${c1Name}.`,
    `${c1Name} raised his defensive ward, his breath catching in his throat as the pale ghostly apparition drifted through the solid iron gate.`
  ];

  const genericTemplates = [
    `${c1Name} adjusted their tactical communications link, verifying that the encrypted telemetry channel remained open.`,
    `${c2Name} monitored the fluctuating telemetry readings on the handheld console, signaling that the perimeter was secure for thirty seconds.`,
    `Every instinct honed over fifteen years of fieldwork told ${c1Name} that they were walking directly into an unexpected trap.`,
    `${c2Name} cross-referenced the coordinates with the primary grid map, finding a hidden access conduit beneath the granite foundations.`,
    `The high-altitude wind screamed past the observation platform, carrying the scent of ozone and impending storm clouds.`,
    `${c1Name} advanced with measured discipline, checking corners with fluid precision as ${c2Name} covered the rear approach.`,
    `A sudden chime on the biometric receiver indicated that someone had initiated an automated override sequence on the primary server.`,
    `${c2Name} bypassed the secondary hydraulic locking mechanism in less than six seconds, sparks illuminating the narrow corridor.`,
    `${c1Name} locked eyes with ${c2Name}, reading the mutual resolve that had pulled them through a dozen perilous operations before.`,
    `Beneath their boots, the structural framework vibrated with immense energy as the countdown inched closer to zero.`,
    `${c2Name} synchronized the cryptographic bypass key, halting the first phase of the automated defense protocol.`,
    `${c1Name} reloaded with practiced fluid speed, keeping his focus pinned on the illuminated doorway ahead.`,
    `Every second of delay increased the probability of their signal being triangulated by hostile countermeasures.`,
    `${c2Name} deployed a miniature reconnaissance drone that mapped the internal layout in real-time holographic detail.`
  ];

  const pool = isHorror ? horrorTemplates : genericTemplates;
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    const idx = (i * 7 + 3) % pool.length;
    result.push(pool[idx]);
  }
  return result;
}

export async function generateStoryParts(params: {
  category?: string;
  customTag?: string;
  prompt?: string;
  duration?: number;
  numImages?: number;
  numParts?: number;
  excludeId?: string;
  sceneStyle?: string;
}): Promise<StoryGenerationResult> {
  const {
    category = "Horror",
    prompt = "",
    duration = 60,
    numImages = 5,
    numParts = 1,
    sceneStyle = "Realism",
  } = params;

  const clampedDuration = Math.max(30, Math.min(600, duration));
  const clampedParts = Math.max(1, Math.min(5, numParts));
  const clampedImages = Math.max(1, Math.min(20, numImages));
  const targetWords = Math.max(60, Math.floor((clampedDuration * 140) / 60));

  const cleanCat = category.trim() || "Horror";
  let matchedCat = cleanCat;
  if (!PROCEDURAL_STORIES[matchedCat]) {
    matchedCat = cleanCat.toLowerCase().includes("horror") ? "Horror" :
                 cleanCat.toLowerCase().includes("fact") ? "Interesting Facts" :
                 cleanCat.toLowerCase().includes("motivat") ? "Motivational" :
                 cleanCat.toLowerCase().includes("advent") ? "Adventure" : "Action";
  }

  const pool = PROCEDURAL_STORIES[matchedCat] || PROCEDURAL_STORIES["Horror"];
  
  // Hash seed from prompt + timestamp so each call produces a unique story
  const promptSalt = (prompt || "").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const seed = (Date.now() + promptSalt + Math.floor(Math.random() * 99999)) % 1000000;
  const archetypeIdx = seed % pool.length;
  const chosen = pool[archetypeIdx];

  const baseTitle = (prompt.trim() && prompt.trim().length > 5 && prompt.trim().length < 80)
    ? prompt.trim()
    : chosen.title;

  const storyId = `${chosen.id}_${Date.now()}`;
  const usedGlobalSentences = new Set<string>();
  const partsData: StoryPart[] = [];

  for (let pIdx = 0; pIdx < clampedParts; pIdx++) {
    const pNum = pIdx + 1;
    const isLast = pNum === clampedParts;
    const pSentences: string[] = [];

    // 1. Hook
    const hookSent = pNum === 1
      ? (chosen.hooks[seed % chosen.hooks.length] || `${chosen.char1} and ${chosen.char2} arrived at ${chosen.setting}.`)
      : `Picking up right after the terrifying encounter, ${chosen.char1} and ${chosen.char2} pushed deeper into ${chosen.setting} as shadows swirled around them.`;
    
    if (!usedGlobalSentences.has(hookSent)) {
      pSentences.push(hookSent);
      usedGlobalSentences.add(hookSent);
    }

    // 2. Core Beats
    for (const beat of chosen.beats) {
      if (!usedGlobalSentences.has(beat)) {
        pSentences.push(beat);
        usedGlobalSentences.add(beat);
        if (pSentences.join(" ").split(/\s+/).length >= targetWords - 35) break;
      }
    }

    // 3. Expansions
    if (pSentences.join(" ").split(/\s+/).length < targetWords - 35) {
      for (const exp of chosen.expansions) {
        if (!usedGlobalSentences.has(exp)) {
          pSentences.push(exp);
          usedGlobalSentences.add(exp);
          if (pSentences.join(" ").split(/\s+/).length >= targetWords - 35) break;
        }
      }
    }

    // 4. Procedural Deepening
    if (pSentences.join(" ").split(/\s+/).length < targetWords - 35) {
      const deepBeats = getDynamicDeepeningBeats(
        chosen.char1,
        chosen.char2,
        chosen.enemy,
        chosen.setting,
        matchedCat,
        60
      );
      for (const deep of deepBeats) {
        if (!usedGlobalSentences.has(deep)) {
          pSentences.push(deep);
          usedGlobalSentences.add(deep);
          if (pSentences.join(" ").split(/\s+/).length >= targetWords - 35) break;
        }
      }
    }

    // 5. Ending & CTA
    if (!isLast && clampedParts > 1) {
      const cliff = (chosen.cliffhanger || "What happened next will shock you... Follow right now for Part " + (pNum + 1) + "!")
        .replace(/Part\s+\d+/gi, `Part ${pNum + 1}`);
      pSentences.push(cliff);
    } else {
      const resolution = `${chosen.char1} and ${chosen.char2} unraveled the dark secret of ${chosen.setting}, emerging into the dawn forever transformed by what they witnessed.`;
      pSentences.push(resolution);
      const ctaList = GENRE_CTA[matchedCat] || GENRE_CTA["Others"];
      const cta = ctaList[Math.floor(Math.random() * ctaList.length)];
      pSentences.push(cta);
    }

    const scriptText = pSentences.join(" ");

    // 6. Visual prompts
    const scenes: StoryScene[] = [];
    for (let sIdx = 0; sIdx < clampedImages; sIdx++) {
      const sentIndex = Math.min(pSentences.length - 1, Math.floor((sIdx * pSentences.length) / clampedImages));
      const sceneSentence = pSentences[sentIndex] || chosen.setting;
      const sceneText = pSentences.slice(sentIndex, Math.min(sentIndex + 2, pSentences.length)).join(" ");
      const vPrompt = buildCleanVisualPrompt(
        sceneSentence,
        `${chosen.char1} in ${chosen.setting}`,
        chosen.visual_style
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
    category: matchedCat,
    factId: storyId,
    overallTitle: baseTitle,
    numParts: clampedParts,
    durationPerPart: clampedDuration,
    parts: partsData,
    source: "generative_neural_story_engine",
  };
}
