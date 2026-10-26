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

export function buildCleanVisualPrompt(
  sceneText: string,
  fallbackSubject: string,
  styleDescriptor: string
): string {
  let clean = sceneText
    .replace(/\b(?:Part\s+\d+|Welcome back to Part\s+\d+|Follow for Part\s+\d+|Watch Part\s+\d+|Save this video|follow for your daily drive|follow for more|subscribe|share this|comment below)[^.]*/gi, "")
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

  const isRealism = /realism|photoreal|35mm/i.test(styleDescriptor);
  const sceneComposition = isRealism
    ? "cinematic wide-angle environmental establishing shot, dynamic action in full scene, deep background architecture and scenery, atmospheric environmental storytelling, natural human anatomy, photorealistic 8k"
    : "cinematic wide-angle environmental establishing shot, dynamic action in full scene, deep background architecture and scenery, atmospheric environmental storytelling, unified artistic illustration, seamless character rendering, no photorealistic face collage";

  return `Cinematic scene of ${clean}, ${sceneComposition}, ${styleDescriptor}, vertical 9:16 framing`;
}

export const CHARACTER_ENSEMBLES = [
  {
    "id": "action_leo_maya",
    "genre": "Action",
    "category": "Action",
    "keywords": [
      "action",
      "agent",
      "operative",
      "combat",
      "train",
      "explosive",
      "chase",
      "mission",
      "special ops",
      "assault"
    ],
    "title": "Operation Iron Phantom",
    "char1": "Agent Leo Sterling, elite black ops operative",
    "char2": "Maya Ray, tactical electronic warfare specialist",
    "enemy": "The Black Dagger Syndicate",
    "setting": "a high-speed magnetic bullet train speeding through alpine tunnels",
    "visual_style": "cinematic wide-angle Hollywood blockbuster action sequence, explosive debris and sparks, dynamic motion blur, high-octane battle scene, dramatic rim lighting, 8k octane render, natural human anatomy, vertical 9:16 framing",
    "chapters": [
      {
        "chapter_num": 1,
        "hook": "Agent Leo Sterling, an elite black ops operative, and Maya Ray, a tactical electronic warfare specialist, magnetized their boots to the roof of the high-speed Maglev bullet train hurtling at three hundred miles per hour through the Swiss Alps.",
        "core_beats": [
          "High-altitude wind screamed past Leo's tactical visor as Maya connected an override clamp to the train's armored dorsal hatch.",
          "'Security feeds show sixteen armed mercenaries securing the central biometric vault in Car 4, Leo,' Maya warned through the comms.",
          "Leo primed his suppressed submachine gun, checking the chamber with fluid, practiced precision.",
          "Beneath their boots, the magnetic rails hummed with thousands of volts of raw electrical power as the train entered an unlit mountain tunnel.",
          "Maya bypassed the hydraulic lock in four seconds, sparks showering across the graphite roof as the hatch hissed open.",
          "'Drop in three... two... one... execute!' shouted Leo, dropping feet-first into the darkened maintenance corridor.",
          "Two syndicate guards spun around with automatic weapons, but Leo neutralized both with lightning-fast close-quarters strikes before they could raise an alarm."
        ],
        "expansion_beats": [
          "Red emergency strobes bathed the narrow passage in rhythmic crimson pulses, casting elongated shadows along the titanium bulkheads.",
          "Maya dropped down behind him, deploying a miniature acoustic drone that mapped enemy positions through the reinforced steel doors.",
          "'They have installed a seismic charge on the central coupling,' Maya whispered, tapping the holographic tactical display on her wrist.",
          "'If Arthur Sterling's mercenaries realize they are cornered, they will decouple the passenger cars into the canyon abyss.'",
          "Leo advanced with tactical discipline, slicing through the smoke-filled galley with his weapon held at high-ready.",
          "Through the panoramic passenger windows, snow-capped alpine peaks blurred past like jagged razor blades under the moonlight.",
          "Every second brought them closer to the border checkpoint where the syndicate planned to transfer the stolen warhead onto a private chopper.",
          "Leo breached the double security blast doors of Car 4, where the syndicate commander stood with his finger resting over a remote detonator.",
          "'Step away from the console, Sterling,' Leo commanded, his laser sight locked dead center on the detonator's transceiver."
        ],
        "cliffhanger": "The syndicate commander smirked and slammed his palm onto the emergency release lever, causing the floor beneath Leo and Maya to buckle violently as the train decoupled at full speed... Follow right now for Part 2 to witness the high-speed extraction!"
      },
      {
        "chapter_num": 2,
        "hook": "Picking up immediately as the passenger car decoupled at three hundred miles per hour, Agent Leo Sterling fired a high-tension grappling cable, hooking the lead locomotive just as the gap widened.",
        "core_beats": [
          "'Hold on to me, Maya!' Leo roared, wrapping one arm around her tactical harness as the cable snapped taut with bone-jarring force.",
          "They swung across the dizzying void between the accelerating train cars, boots slamming onto the rear platform of the engine.",
          "Syndicate reinforcements opened fire from the upper catwalks, high-caliber tracer rounds tearing through the steel siding.",
          "Maya hurled a customized EMP concussion grenade upward, detonating it mid-air in a blinding blue electromagnetic shockwave.",
          "The blast disabled the mercenaries' night-vision optics and weapons sights, throwing the entire syndicate squad into disarray.",
          "Leo swept the catwalk with rapid, pinpoint bursts, advancing relentlessly through the hail of ricocheting lead.",
          "'The engine controls have been locked into an irreversible acceleration loop!' Maya shouted, interfacing her terminal with the primary throttle."
        ],
        "expansion_beats": [
          "Flames poured from the overheated turbine vents as the speedometer climbed toward four hundred miles per hour toward the terminal curve.",
          "Leo covered the doorway, engaging three remaining operatives in intense hand-to-hand combat amidst flying glass and shattered instrument panels.",
          "With a crushing sweep, Leo disarmed the final attacker and tossed the detonator clear of the locomotive into the river far below.",
          "'I need five seconds to reverse the magnetic polarity on the emergency brakes, Leo!' Maya yelled over the deafening roar of the engines.",
          "Sparks erupted from the brake shoes, screaming like banshees as millions of pounds of magnetic braking resistance engaged simultaneously.",
          "The train shuddered violently, sliding across the glowing rails in a shower of brilliant white sparks before coming to a dead halt ten feet from the cliff edge.",
          "Silence settled over the alpine pass, broken only by the ticking of the cooling reactor and the distant sound of falling snow.",
          "Maya leaned against the console with an exhausted grin, securing the recovered biometric briefcase in her tactical pouch.",
          "Leo holstered his weapon, tapped his radio frequency, and announced: 'Extraction complete. The syndicate is neutralized.'"
        ],
        "cliffhanger": "As the extraction helicopter lowered its winch, an incoming missile lock warning shrieked inside the cockpit... Follow for Part 3!",
        "resolution": "Agent Leo Sterling and Maya Ray neutralized the syndicate, secured the biometric weapon, and saved hundreds of innocent lives.",
        "cta": "Mission accomplished with lethal precision. Double tap, save this video right now, and follow for more heart-stopping high-octane action thrillers!"
      }
    ]
  },
  {
    "id": "realism_evelyn_marcus",
    "genre": "Realism",
    "category": "Others",
    "keywords": [
      "corporate",
      "investigation",
      "whistleblower",
      "financial",
      "boardroom",
      "realism",
      "detective",
      "thriller",
      "truth"
    ],
    "title": "The Sovereign Ledger Conspiracy",
    "char1": "Dr. Evelyn Reed, a relentless forensic auditor",
    "char2": "Marcus Vance, an investigative journalist",
    "enemy": "Arthur Sterling, billionaire chairman of Sovereign Capital",
    "setting": "the rain-slicked glass towers of the financial district",
    "visual_style": "cinematic wide-angle environmental establishing shot, photorealistic 8k, dramatic 35mm film grain, moody corporate boardroom and rain-slicked streets, natural human anatomy",
    "chapters": [
      {
        "chapter_num": 1,
        "hook": "Dr. Evelyn Reed, a relentless forensic auditor, and Marcus Vance, an investigative journalist, sat inside a darkened surveillance van overlooking the glass monolith of Sovereign Capital.",
        "core_beats": [
          "With calm precision and years of discipline, Evelyn decoded the encrypted flash drive recovered from the offshore safety deposit box.",
          "'Keep your eyes on the entrance, Marcus,' Evelyn whispered, noting the irregular shell company transfers funneled through Zurich.",
          "Marcus adjusted his telephoto lens, capturing Arthur Sterling exiting the private garage flanked by three security operatives.",
          "Every transaction log pointed to a coordinated liquidity siphon executed over thirty-six consecutive months.",
          "The boardroom on the forty-second floor remained illuminated, casting long shadows across rows of vacant leather chairs.",
          "A sudden chime on Evelyn's terminal indicated that someone on the internal server had initiated a remote data wipe.",
          "'They know we have the files,' Marcus said, his grip tightening on the steering wheel as headlights turned into the alley."
        ],
        "expansion_beats": [
          "Rain continued to beat against the windshield as the clock on the dashboard inched closer to midnight.",
          "Under the warm amber streetlamps, city couriers rushed past, oblivious to the high-stakes financial war playing out above them.",
          "Evelyn cross-referenced the flight manifests with the offshore bank accounts, uncovering an undeniable pattern.",
          "Walking through the crowded financial district, every passerby had seemed like an observer in an invisible chess match.",
          "The tension inside the vehicle grew suffocating as boots echoed down the wet concrete stairs outside.",
          "Arthur Sterling had spent twenty years building an untouchable reputation as a philanthropic venture capitalist.",
          "Yet beneath the polished press releases lay billions in redirected pension funds and illicit offshore covenants.",
          "Marcus keyed in the secondary emergency backup frequency, uploading duplicate partitions to their secure cloud proxy.",
          "'If we lose this uplink now, twenty thousand pensioners lose everything by morning,' Evelyn stated without looking up.",
          "The forensic algorithm completed its pass, revealing Arthur Sterling's personal digital signature on the authorizing wire."
        ],
        "cliffhanger": "Just as the final encrypted audit trail synchronized, a laser targeting beam painted the dashboard, and a gloved hand banged violently against the van door... Follow right now for Part 2!"
      },
      {
        "chapter_num": 2,
        "hook": "Picking up immediately from the alley ambush, Dr. Evelyn Reed and Marcus Vance slammed the van into reverse as high-velocity rounds shattered the side mirror.",
        "core_beats": [
          "'Hold on!' shouted Marcus, spinning the steering wheel and tires screeching across wet asphalt into the main boulevard.",
          "Evelyn held the laptop steady against her chest, watching the upload progress bar freeze at eighty-nine percent.",
          "Two black SUVs surged out of the corporate garage, cutting through late-night taxi traffic in relentless pursuit.",
          "'Arthur Sterling didn't just authorize the wire, Marcus,' Evelyn gasped, reading the unmasked account holders.",
          "'The receiving accounts don't belong to offshore banks\u2014they belong to members of the federal oversight committee.'",
          "Marcus glanced at the rearview mirror as the lead pursuit vehicle nudged their rear bumper with a sickening metallic crunch.",
          "'We can't go to the police station,' Marcus said grimly. 'The entire chain of command has been bought.'"
        ],
        "expansion_beats": [
          "Sirens began to wail in the distance, but not to help them\u2014to corner them before the broadcast could go live.",
          "Evelyn redirected the transmission through an encrypted mesh network established across decentralized servers.",
          "The neon reflections of the downtown theater district blurred past in a kaleidoscope of rain and amber light.",
          "Marcus executed a sharp handbrake turn down an access ramp leading into the subterranean municipal transit tunnels.",
          "The concrete tunnel walls amplified the roar of pursuing engines as exhaust fumes filled the narrow subterranean corridor.",
          "'If we reach the broadcast tower at Pier 4, we can override the public satellite feed directly,' Marcus shouted.",
          "Evelyn bypassed the firewall of the city communications array, using Sterling's own stolen cryptographic key.",
          "Her hands moved across the keyboard with surgical precision despite the violent rattling of the suspension.",
          "Every document in the dossier was now verified, containing sworn affidavits, audio intercepts, and forensic ledgers.",
          "Behind them, the pursuit vehicle clipped a concrete barrier, spinning across the wet tracks in a shower of sparks."
        ],
        "cliffhanger": "As the van skidded onto the pier, the automated security gates slammed shut, trapping them against the dark harbor water with headlights closing in... Follow for Part 3 to witness the showdown!",
        "resolution": "Arthur Sterling was arrested on live television at dawn, and every stolen dollar was returned to the pension funds.",
        "cta": "Justice always prevails when the truth is brought into the light. Save this video and follow for more gripping investigative thrillers!"
      }
    ]
  },
  {
    "id": "dark_fantasy_gabriel_morwenna",
    "genre": "Dark Fantasy",
    "category": "Horror",
    "keywords": [
      "dark fantasy",
      "knight",
      "sword",
      "magic",
      "curse",
      "elden ring",
      "witcher",
      "gargoyle",
      "citadel",
      "ruins"
    ],
    "title": "The Obsidian Bell of the Cursed Citadel",
    "char1": "Sir Gabriel Thorne, exiled paladin of the Sun Order",
    "char2": "Lady Morwenna, renegade blood alchemist",
    "enemy": "Malakor the Undying, lord of the ash wasteland",
    "setting": "the petrified ruins of the Eclipse Citadel",
    "visual_style": "dark fantasy concept art masterpiece, sculpted dark steel plate knight armor, glowing mystical runes, ominous atmospheric mist, blood red moonlight, Elden Ring and Witcher aesthetics, painterly digital illustration, seamless character rendering",
    "chapters": [
      {
        "chapter_num": 1,
        "hook": "Sir Gabriel Thorne, exiled paladin of the Sun Order, and Lady Morwenna, a renegade blood alchemist, stood before the sealed obsidian gates of the Eclipse Citadel under a blood-red moon.",
        "core_beats": [
          "Gabriel unclasped his rune-forged greatsword, the blackened steel pulsating with pale crimson fire against the suffocating mist.",
          "'The ancient blood seals were never meant to be broken by living hands, Gabriel,' Morwenna warned, tracing the petrified gargoyles.",
          "Beneath their armored sabatons, subterranean chains groaned as an ancient unholy bell tolled for the first time in six centuries.",
          "A suffocating storm of black ash descended over the courtyard, extinguishing Gabriel's enchanted torch in a single heartbeat.",
          "'They are already waking,' Gabriel muttered, raising his heavy dragonscale shield as hollow whispers echoed from the stone walls.",
          "Morwenna crushed an alchemical vial of powdered star-metal, igniting a ring of azure flame that illuminated the grand hall.",
          "Before them sat the shattered throne of king Malakor, where dozens of petrified guardians slowly turned their horned helms."
        ],
        "expansion_beats": [
          "No mortal had kindled an open flame within these ashlands since the celestial war shattered the sun into dying embers.",
          "Every stone carving along the vaulted ceiling depicted a forgotten massacre sealed in silence by the dragon lords.",
          "Gabriel tightened the leather straps of his gauntlets, feeling the cold weight of the curse gnawing at his immortal soul.",
          "'If Malakor claims the Eclipse Core tonight, the blight will spread beyond the mountain passes,' Morwenna whispered.",
          "She drew intricate alchemical sigils into the frost-covered flagstones, chanting verses in the dead tongue of the First Kings.",
          "Spectral phantoms swirled around the shattered pillars, their hollow eye sockets burning with malevolent emerald embers.",
          "The air grew dense with the stench of ozone, petrified bone, and ancient scorched iron as the shadows lengthened.",
          "Gabriel stepped forward into the center of the nave, his greatsword carving glowing arcs through the gathering mist.",
          "Visions of his fallen brothers flashed before his eyes\u2014their souls trapped within the obsidian walls of this godless tomb.",
          "He knew that once they crossed the inner threshold, neither prayer nor armor could guarantee their return to the sunlight."
        ],
        "cliffhanger": "As the throne room doors collapsed inward, an colossal shadow crowned in jagged obsidian stepped from the abyss, raising a cursed black cleaver... Drop a like and follow for Part 2!"
      },
      {
        "chapter_num": 2,
        "hook": "Picking up right after the throne room breach, Sir Gabriel Thorne intercepted Malakor's colossal black cleaver with his shield, sparks showering across the dark flagstones.",
        "core_beats": [
          "The shockwave knocked Lady Morwenna backward into the rune circle as Gabriel was driven to one knee by the monstrous blow.",
          "'Gabriel, strike at the soul prism embedded in his chest!' Morwenna screamed, hurling two flasks of volatile alchemical fire.",
          "The azure explosion engulfed Malakor in blinding light, exposing the pulsing crimson crystal fused to his necrotic ribcage.",
          "Malakor roared with the fury of a thousand damned souls, the sound shattering the ancient stained glass of the cathedral.",
          "Gabriel rolled beneath a sweeping counterstrike, his blade slicing through the armor joints of the undead titan.",
          "Dark ichor hissed like acid against the stone as Gabriel channeled the last ember of the sacred Sun fire through his hilt.",
          "'You fought for a kingdom that betrayed you, paladin,' Malakor's hollow voice echoed inside Gabriel's mind."
        ],
        "expansion_beats": [
          "The obsidian pillars groaned under the violent tremors of their duel, raining chunks of ancient masonry onto the altar.",
          "Morwenna chanted frantically, drawing upon her own vitality to weave shimmering spectral chains around Malakor's limbs.",
          "The chains pulled taut with a deafening screech of stressed iron, momentarily anchoring the monstrosity to the altar floor.",
          "'Now, Gabriel! The prism is exposed!' she cried out, blood trickling from her lips under the strain of the spell.",
          "Gabriel lunged forward with everything he had left, vaulting over the shattered dais and driving his greatsword into the crystal.",
          "A blinding fracture of white energy ripped through the citadel, cracking the obsidian walls from the foundation to the spires.",
          "The curse that had held the Forgotten Kingdom in torment for six hundred years began to dissolve into silver ash.",
          "Malakor's physical form collapsed into a pile of lifeless blackened plate armor, leaving only the shattered core.",
          "Gabriel stood breathing heavily amidst the silence of the dawn, offering a hand to pull Morwenna from the stone floor.",
          "Through the shattered cathedral rose-window, the first rays of true sunlight in six centuries touched the ashlands."
        ],
        "cliffhanger": "As they picked up the remains of the core, a faint heartbeat throbbed within the stone... Follow right now for Part 3!",
        "resolution": "Malakor was vanquished, and the curse over the Forgotten Kingdom was broken forever as sunlight returned to the realm.",
        "cta": "Darkness can never conquer true courage. Save this story if you dare, and follow for more epic dark fantasy sagas!"
      }
    ]
  },
  {
    "id": "mecha_ren_maya",
    "genre": "Mecha",
    "category": "Action",
    "keywords": [
      "mecha",
      "robot",
      "sci-fi",
      "anime",
      "futuristic",
      "cockpit",
      "pilot",
      "plasma",
      "space",
      "cybernetic"
    ],
    "title": "The Titan Vanguard Defense",
    "char1": "Commander Ren Chen, ace pilot of Vanguard-01",
    "char2": "Dr. Maya Lin, chief quantum cybernetics officer",
    "enemy": "The Nexus Swarm Carrier",
    "setting": "the shattered orbital defense ring above Neo-Tokyo",
    "visual_style": "giant mecha battle anime concept art, intricate mechanical joints, glowing blue energy thrusters, shattered orbital sky, cinematic 8k, seamless mecha rendering, vertical 9:16 framing",
    "chapters": [
      {
        "chapter_num": 1,
        "hook": "Commander Ren Chen, ace pilot of the Vanguard-01 Titan mech, and Dr. Maya Lin, chief cybernetics officer, monitored the red tactical radar as Sector 9 orbital defenses collapsed.",
        "core_beats": [
          "'Neural link synchronization at ninety-eight percent, Commander,' Dr. Maya Lin announced through the cockpit comms.",
          "Vanguard-01 stepped onto the launch catapult, seventy tons of reinforced alloy vibrating as twin ion thrusters roared to life.",
          "Through the panoramic heads-up display, Ren watched the ominous red swarm of autonomous drone carriers blot out the moon.",
          "'They bypassed the outer perimeter mines in less than two minutes,' Ren noted, charging the plasma railcannon on his right arm.",
          "'The Nexus mothership is transmitting a localized EMP,' Maya warned. 'If you take a direct blast, your neural harness will overload.'",
          "The catapult released with explosive force, launching Vanguard-01 into the stratosphere amidst a storm of hypersonic flak.",
          "Ren engaged the vernier thrusters, dodging a volley of plasma missiles before locking targets on the swarm vanguard."
        ],
        "expansion_beats": [
          "Below them, the neon skyline of Neo-Tokyo stretched out like a glowing circuit board under siege.",
          "Maya worked the telemetry consoles inside the command bunker, rerouting auxiliary coolant to Vanguard's primary core.",
          "Every neural feedback impulse felt like electric needles along Ren's spine, but his breathing remained steady and calm.",
          "The tactical computer tagged over three hundred incoming robotic signatures descending through the ionosphere.",
          "'Target lock established,' Ren said coldly, discharging the railcannon in a brilliant lance of violet particle fire.",
          "The blast cleaved through the lead destroyer, triggering a chain reaction of fiery secondary explosions across the clouds.",
          "Debris rained down over the sea as Ren ignited the high-frequency vibro-blade to engage the secondary interceptors.",
          "'Commander, seismic sensors show a colossal anomaly emerging from the clouds directly beneath you!' Maya shouted.",
          "Ren looked down as the clouds parted to reveal a mechanical leviathan the size of an aircraft carrier rising into firing range.",
          "Its primary particle accelerator was charging directly toward the city center below."
        ],
        "cliffhanger": "Vanguard-01's thruster fuel gauge flashed red just as the titan leviathan fired its main orbital cannon directly at the cockpit... Follow for Part 2 to witness the dogfight!"
      },
      {
        "chapter_num": 2,
        "hook": "Diving at Mach 4 through the particle beam, Commander Ren Chen overcharged Vanguard-01's kinetic energy shield as Dr. Maya Lin pushed the core past maximum safety limits.",
        "core_beats": [
          "The kinetic shield flared into blinding blue fury, deflecting the particle cannon's core into the upper atmosphere.",
          "'Core temperature is at four hundred percent, Ren! You have thirty seconds before a full reactor meltdown!' Maya screamed.",
          "'Thirty seconds is all I need,' Ren replied, deploying the emergency booster rockets directly toward the leviathan's bridge.",
          "Swarm drones pelted Vanguard's armor plate, but Ren carved straight through them with sweeping arcs of his vibro-blade.",
          "He drove the blade deep into the leviathan's central quantum processor, triggering a catastrophic cascading failure.",
          "Ren ejected the spent thruster pods and pushed the titan mech into a high-G climb away from the detonation.",
          "The leviathan exploded in a brilliant supernova of white light that turned the night sky into noon across three continents."
        ],
        "expansion_beats": [
          "The shockwave tossed Vanguard-01 through the upper atmosphere before Ren successfully deployed the deceleration parachutes.",
          "Inside the command bunker, cheers erupted across all frequencies as the radar screens cleared of enemy hostiles.",
          "Maya slumped into her chair with tears of relief, listening to Ren's steady heartbeat on the biometric telemetry monitor.",
          "'Neo-Tokyo is secure, Commander,' Maya whispered into the comms with an exhausted smile.",
          "'Copy that, Command. Vanguard-01 returning to base,' Ren replied, watching the dawn rise over the Pacific Ocean.",
          "The city lights below shone brighter than ever, saved by the courage of two souls who refused to let humanity fall.",
          "Across the globe, emergency shelters opened their doors as families looked up at the victorious lone titan descending.",
          "Humanity had survived the greatest synthetic incursion in history, proving that mortal resolve can never be conquered."
        ],
        "cliffhanger": "Deep beneath the ocean floor, an unmapped secondary server woke up and began transmitting... Follow for Part 3!",
        "resolution": "Commander Ren Chen and Dr. Maya Lin destroyed the Nexus Leviathan, saving Neo-Tokyo and securing global peace.",
        "cta": "Honor the brave who stand on the front lines. Double tap, save this video, and follow for more pulse-pounding mecha battles!"
      }
    ]
  },
  {
    "id": "horror_lucas_clara",
    "genre": "Horror",
    "category": "Horror",
    "keywords": [
      "horror",
      "haunted",
      "asylum",
      "ghost",
      "paranormal",
      "creepy",
      "monstrous",
      "nightmare",
      "demon"
    ],
    "title": "The Haunting of Blackwood Asylum",
    "char1": "Detective Lucas Drake, paranormal investigator",
    "char2": "Dr. Clara Bell, archivist of occult antiquities",
    "enemy": "The Unbound Entity of Ward 4",
    "setting": "an abandoned Victorian asylum sealed since 1923",
    "visual_style": "dark eerie cinematic shadows, mist, foggy abandoned asylum hallway, volumetric lighting, 8k octane render, natural human anatomy, unified artistic rendering",
    "chapters": [
      {
        "chapter_num": 1,
        "hook": "Detective Lucas Drake, a seasoned paranormal investigator, and Dr. Clara Bell, an archivist of occult antiquities, forced open the chained iron doors of Blackwood Asylum at exactly 3:17 AM.",
        "core_beats": [
          "The floorboards beneath their heavy boots hummed with a low, sickening vibrational frequency that vibrated their teeth.",
          "'The facility was officially abandoned in 1923, Lucas,' Clara whispered, holding her brass electromagnetic sensor forward.",
          "The sensor needle pegged instantly into the red zone, letting out an erratic, shrieking burst of static feedback.",
          "Lucas clicked on his high-powered flashlight, revealing rows of rusted iron patient beds covered in decayed restraint straps.",
          "On the peeling plaster wall directly ahead, fresh handprints were pressed deeply into the concrete\u2014facing downward from the ceiling.",
          "A faint, rhythmic scratching sound emerged from inside the drywall, moving systematically from left to right.",
          "'Lucas... look at the camera feed from the hallway we just walked through,' Clara said, her voice trembling."
        ],
        "expansion_beats": [
          "The infrared monitor showed a tall, faceless silhouette standing motionless at the end of the corridor, watching them breathe.",
          "Lucas pulled his service revolver, though both of them knew lead could do nothing against what inhabited these walls.",
          "A heavy music box on the nurse's station began playing a warped, slow lullaby without any winding key attached.",
          "The air temperature plummeted forty degrees in a matter of seconds, turning their breath into thick plumes of white vapor.",
          "Lucas shined the beam down the central corridor of Ward 4, where every cell door hung open on rusted hinges.",
          "Archival files lay scattered across the linoleum floor, detailing experimental procedures performed on patients who never left.",
          "'The director attempted to summon an entity from the lower catacombs,' Clara murmured, reading a blood-stained ledger.",
          "'He believed he could harness eternal memory, but whatever came through the portal consumed everyone inside in a single night.'",
          "A sudden thud resonated from the ceiling directly above their heads, followed by the sound of rapid, crawling footsteps.",
          "Lucas stepped in front of Clara, his knuckles white around the flashlight as the hallway lights began to flicker and burst one by one."
        ],
        "cliffhanger": "Then the heavy iron doors at both ends of the ward slammed shut simultaneously, plunging them into total darkness as something whispered Clara's name... Follow right now for Part 2!"
      },
      {
        "chapter_num": 2,
        "hook": "Picking up immediately from the total blackout in Ward 4, Detective Lucas Drake ignited an emergency magnesium flare as a clawed shadow lunged from the ceiling.",
        "core_beats": [
          "The blinding white flare illuminated a distorted silhouette with hollow obsidian eyes recoiling into the shadows with a screech.",
          "'The ritual circle in the basement, Clara! We have to sever the tether before the flare burns out!' Lucas shouted.",
          "Clara grabbed the antique iron seal from her satchel, leading the way down the crumbling spiral staircase.",
          "The walls of the staircase wept black, sulfurous condensation that sizzled whenever it touched the flare's flame.",
          "Beneath them in the basement flooded with two feet of murky water lay the submerged occult altar of Solomon.",
          "Lucas fired two rounds into the shadows as phantom arms reached out from the walls trying to pull them into the masonry.",
          "'Place the seal in the center of the keystone!' Lucas commanded, holding off the advancing horde of apparitions."
        ],
        "expansion_beats": [
          "Clara waded through the icy water to the center altar, chanting the binding verses inscribed on the ancient parchment.",
          "The water around her began to boil violently, releasing plumes of noxious steam that filled the stone crypt.",
          "The entity shrieked in deafening rage, its physical manifestation thrashing against the encroaching holy ward.",
          "With a final strike of his boot, Lucas hammered the iron seal into the altar's groove, locking it in place.",
          "A blinding pulse of golden light erupted from the altar floor, vaporizing the shadows and shattering every mirror in the building.",
          "The suffocating pressure in their chests lifted instantly as the natural silence of the night returned.",
          "Lucas lowered his weapon, his breath ragged, and helped Clara climb out of the flooded chamber onto dry concrete.",
          "Through the shattered basement grates, the calm moonlight of 4:00 AM illuminated the quiet suburban woods outside.",
          "Blackwood Asylum had finally relinquished its captive souls, ending a century of unholy torment.",
          "They stepped out into the crisp autumn air, leaving the sealed horrors behind in the dark where they belonged."
        ],
        "cliffhanger": "As Lucas locked the exterior chains, Clara noticed one fresh set of footprints leading out toward the highway... Follow for Part 3!",
        "resolution": "Lucas and Clara successfully bound the Blackwood Entity, sealing the cursed asylum forever.",
        "cta": "Some secrets are better left undisturbed in the dark. Save this video if you survived, and follow for more terrifying horror investigations!"
      }
    ]
  },
  {
    "id": "adventure_nathan_elena",
    "genre": "Adventure",
    "category": "Adventure",
    "keywords": [
      "adventure",
      "ancient",
      "temple",
      "treasure",
      "archaeology",
      "jungle",
      "expedition",
      "explorer",
      "lost"
    ],
    "title": "The Lost Obsidian Temple of Ur-Galan",
    "char1": "Nathan Cross, rogue archaeologist",
    "char2": "Elena Rostova, extreme survivalist",
    "enemy": "The Guardians of the Sunken Cenote",
    "setting": "a subterranean prehistoric chasm beneath the Yucatan jungle",
    "visual_style": "cinematic adventure concept art, bioluminescent jungle vines, ancient stone statues, cascading underground waterfalls, 8k, natural human anatomy, atmospheric environmental storytelling",
    "chapters": [
      {
        "chapter_num": 1,
        "hook": "Nathan Cross, a rogue archaeologist, and Elena Rostova, an extreme survival specialist, rappelled into the subterranean abyss beneath the Yucatan jungle where no map had ever recorded a passage.",
        "core_beats": [
          "Their boots touched down on an immense platform of polished black obsidian that mirrored the bioluminescent vines hanging above.",
          "'Every compass reading went wild the moment we crossed the limestone cavern threshold, Nathan,' Elena warned.",
          "She checked her geological spectrometer, which indicated an unnatural magnetic resonance emanating from a colossal pyramid below.",
          "Nathan brushed centuries of petrified moss from a carved stone tablet, revealing the forgotten glyphs of Ur-Galan.",
          "'The conquistadors wrote that this city was swallowed whole by the earth in a single night,' Nathan whispered with awe.",
          "Before them stretched a stone bridge spanning a chasm so deep that dropped flare torches disappeared into endless blackness.",
          "As Nathan stepped onto the first paving stone, ancient brass counterweights groaned within the chasm walls."
        ],
        "expansion_beats": [
          "The humid cavern air smelled of ancient crushed minerals, ozone, and damp jungle flora untouched by the sun.",
          "Elena tested the tension of their safety lines, securing the anchors deeply into the solid basalt rock face.",
          "High above in the cavern ceiling, thousands of bioluminescent crystals cast an eerie celestial glow over the ruins.",
          "Nathan traced the astronomical calendar carved into the bridge parapet, noticing alignments that predated Mayan civilization.",
          "'This wasn't built as a temple, Elena,' Nathan realized. 'This was built as a subterranean vault to preserve ancestral knowledge.'",
          "A gust of subterranean wind surged up from the chasm, carrying the distant sound of cascading underground waterfalls.",
          "Across the bridge stood the towering double gates of the inner sanctum, adorned with golden sun dials.",
          "Elena scanned the perimeter with thermal binoculars, detecting faint heat signatures moving along the upper ledges.",
          "'We are definitely not alone down here,' Elena said quietly, unholstering her tactical machete and flare pistol.",
          "Nathan smiled despite the danger, his curiosity far outweighing any sense of self-preservation."
        ],
        "cliffhanger": "Suddenly, the center span of the stone bridge began to retract into the cavern walls, cutting off their retreat as stone sentinels awoke on the opposite ledge... Follow for Part 2 to see the escape!"
      },
      {
        "chapter_num": 2,
        "hook": "Picking up immediately from the collapsing bridge, Nathan Cross hurled his grappling hook across the chasm, catching the golden gate archway just as the stones fell away.",
        "core_beats": [
          "'Jump, Elena!' Nathan yelled, catching her arm mid-air as they swung across the yawning void into the inner sanctum.",
          "They slammed onto the polished stone floor of the temple just as the bridge plummeted into the abyss behind them.",
          "The massive golden gates slammed shut with an earth-shattering boom, locking them inside the treasury of Ur-Galan.",
          "In the center of the illuminated rotunda rested the Celestial Orrery\u2014a clockwork solar system forged from pure platinum.",
          "'It's still turning,' Elena whispered in stunned disbelief. 'It has been running on subterranean geothermal power for three thousand years.'",
          "Nathan carefully recovered the golden star chart cylinder that held the recorded coordinates of four other forgotten lost cities.",
          "'This rewrites the entire history of human civilization on this continent,' Nathan said, placing the relic in his waterproof pack."
        ],
        "expansion_beats": [
          "Elena located an ancient drainage aqueduct that led upward toward the subterranean cenote lake.",
          "They inflated their emergency raft as subterranean pressure released gallons of crystal-clear spring water into the flume.",
          "The current carried them through illuminated limestone grottos at breakneck speed, dodging stalactites with expert oarsmanship.",
          "Nathan looked back one last time at the glowing jewel of Ur-Galan disappearing into the mist of the underworld.",
          "With a tremendous surge of whitewater, their raft burst through the surface of a breathtaking jungle cenote under the blazing midday sun.",
          "Exhausted, soaked, and triumphant, Elena and Nathan collapsed onto the warm white sand of the cenote shore.",
          "The expedition that everyone in academia had declared impossible had uncovered the greatest archaeological discovery of the century.",
          "Nathan held up the platinum cylinder to the sunlight, grinning as Elena radioed their rescue helicopter coordinates."
        ],
        "cliffhanger": "The cylinder clicked open automatically in Nathan's hands, revealing a map pointing to the Antarctic ice sheet... Follow for Part 3!",
        "resolution": "Nathan Cross and Elena Rostova escaped the Obsidian Temple with the Celestial Orrery, rewriting world history.",
        "cta": "The world still holds mysteries waiting for those daring enough to explore. Save this video and follow for more uncharted adventures!"
      }
    ]
  },
  {
    "id": "motivational_maya_thomas",
    "genre": "Motivational",
    "category": "Motivational",
    "keywords": [
      "motivation",
      "discipline",
      "champion",
      "athlete",
      "grit",
      "success",
      "workout",
      "mindset",
      "overcome"
    ],
    "title": "The Broken Champion's Return",
    "char1": "Maya Lin, injured world-record marathon runner",
    "char2": "Coach Thomas Vance, veteran athletic mentor",
    "enemy": "The medical diagnosis that claimed she would never walk without crutches",
    "setting": "an empty frozen athletic stadium at 5:00 AM",
    "visual_style": "cinematic sports documentary aesthetic, cold breath in winter air, intense focused gaze, dramatic stadium spotlight, photorealistic 8k, inspirational atmosphere",
    "chapters": [
      {
        "chapter_num": 1,
        "hook": "Maya Lin, an undeterred marathon runner who lost her sponsors and spinal mobility in a highway crash, stood on the frozen stadium track with Coach Thomas Vance at 5:00 AM.",
        "core_beats": [
          "The orthopedic surgeons had signed paperwork six months ago declaring she would spend the rest of her life walking with assistance.",
          "Her former sponsors had terminated every contract before she even checked out of the rehabilitation hospital.",
          "'Nobody expects you to run today, Maya,' Coach Thomas Vance said quietly, handing her a stopwatch. 'The only person you have to prove anything to is yourself.'",
          "She exhaled a plume of white steam into the freezing morning air, adjusting the carbon-fiber braces strapped to her knees.",
          "Every step during the first lap sent sharp waves of agony through her lower back, tempting her to surrender to the cold.",
          "Her fingers trembled as she looked down at the empty red lanes where she had once broken national records.",
          "'Discipline isn't built when everyone is cheering in the stands,' Thomas reminded her. 'It is forged in the silence when nobody believes you will make it.'"
        ],
        "expansion_beats": [
          "She closed her eyes, remembering the hospital ceiling and the monitor beeps that had felt like a death sentence.",
          "She rejected the comfort of excuses and the pity of those who told her to accept a diminished reality.",
          "With grit clenched between her teeth, Maya dug her running flats into the rubber and launched into a steady stride.",
          "One kilometer turned into five, then ten, through the biting wind and the burning ache in her scarred muscles.",
          "The stadium floodlights hummed softly above, illuminating a solitary warrior refusing to bend to circumstance.",
          "Thomas watched with quiet pride, checking the split times on his vintage chronometer as her pace steadily accelerated.",
          "The doubt that had weighed down her mind for months began to incinerate under the heat of pure determination.",
          "She realized that pain was temporary, but quitting would remain a permanent stain on her soul.",
          "When ordinary people would have thrown in the towel and walked away, she dug deeper into her spiritual reservoir.",
          "The sun began to peek over the stadium bleachers, casting a long golden shadow across the final hundred meters."
        ],
        "cliffhanger": "As she crossed the finish line of her twentieth lap, the stopwatch display showed a time that shocked Coach Vance to his core... Follow for Part 2 to see the world championship comeback!"
      },
      {
        "chapter_num": 2,
        "hook": "Picking up six months later at the Olympic trials, Maya Lin lined up in Lane 4 against the world's top athletes, wearing the same carbon knee brace.",
        "core_beats": [
          "Commentators on national television openly questioned why an athlete recovering from spinal reconstruction was allowed on the track.",
          "Maya tuned out forty thousand screaming fans, locking her eyes onto the straightaway ahead as Coach Thomas gave her a silent nod.",
          "The starting gun cracked, and the pack surged forward at a blistering world-record pace.",
          "At the halfway mark, the lead runners opened up a twenty-meter gap, betting that Maya's body would collapse under the sustained speed.",
          "'Hold your rhythm, Maya!' Thomas's voice echoed in her mind across the roar of the arena.",
          "With four hundred meters remaining, Maya initiated an ungodly kick that defied all physiological logic.",
          "She blew past the bronze medalist on the final curve, her stride powerful, fluid, and completely unshakeable."
        ],
        "expansion_beats": [
          "The entire stadium rose to its feet in deafening thunder as Maya drew shoulder-to-shoulder with the defending world champion.",
          "In those final fifty meters, all the hospital nights, the tears, the sweat, and the solitary frozen mornings converged into pure triumph.",
          "With a final desperate lean at the tape, Maya crossed the finish line in first place by a hundredth of a second.",
          "The scoreboard flashed the new national record as Maya fell to her knees, crying tears of pure, hard-fought redemption.",
          "Coach Thomas Vance walked onto the track, wrapping her in the national flag as the commentators went speechless.",
          "She had proved to eight billion people that the human spirit cannot be broken by injury, failure, or doubt.",
          "Your current circumstances do not determine your final destination\u2014your resilience and work ethic do.",
          "Every setback is merely the setup for the greatest comeback the world has ever witnessed."
        ],
        "cliffhanger": "Next year she takes on the ultimate world record in Berlin... Follow for Part 3 to witness the historic training camp!",
        "resolution": "Maya Lin broke the national record and won the championship, proving that no obstacle can defeat unyielding human spirit.",
        "cta": "Never let anyone tell you what you cannot achieve. Double tap, save this video for daily motivation, and follow for your daily drive to greatness!"
      }
    ]
  },
  {
    "id": "facts_edward_bernays",
    "genre": "Interesting Facts",
    "category": "Interesting Facts",
    "keywords": [
      "tobacco",
      "marketing",
      "pr",
      "edward bernays",
      "freud",
      "easter parade",
      "advertising",
      "torches of freedom"
    ],
    "title": "The Secret Psychological Trick That Hooked the World on Cigarettes",
    "char1": "Edward Bernays, master publicist and nephew of Sigmund Freud",
    "char2": "Mary Frances Gerety, undercover psychological copywriter",
    "enemy": "Societal taboos turned into commercial traps",
    "setting": "5th Avenue Manhattan Easter Parade, 1929",
    "visual_style": "1920s historic vintage documentary photography, monochrome with selective sepia tones, authentic historic period detail, 8k",
    "chapters": [
      {
        "chapter_num": 1,
        "hook": "Have you ever wondered how corporate advertising convinced billions of people to inhale smoke? In 1929, women smoking in public was strictly forbidden by law and social taboo.",
        "core_beats": [
          "Tobacco magnate George Washington Hill realized that half of the adult human population was completely untapped as a market.",
          "So he hired Edward Bernays, the Austrian-American nephew of psychoanalysis pioneer Sigmund Freud, to execute a covert social experiment.",
          "Bernays consulted prominent psychoanalysts, who concluded that cigarettes represented power and male independence in the sub-conscious mind.",
          "Instead of buying standard newspaper advertisements, Bernays devised a calculated public relations stunt that changed culture forever.",
          "He hired ten wealthy young debutantes to march in the prestigious 1929 New York Easter Sunday Parade down Fifth Avenue.",
          "Bernays secretly instructed the women to hide cigarettes inside their coats until they reached the center of the press grandstand.",
          "He informed the national press that a band of suffragettes would be lighting a historic protest symbol known as 'Torches of Freedom'."
        ],
        "expansion_beats": [
          "On that sunny April morning, thousands of spectators and dozens of press photographers lined the avenue outside St. Patrick's Cathedral.",
          "At Bernays's prearranged signal, the women stopped in unison, withdrew lucky strike cigarettes, and lit them for the cameras.",
          "Flashbulbs erupted as photographers jostled to capture the first public spectacle of high-society women smoking on camera.",
          "Bernays did not mention the tobacco company once in his press releases\u2014he framed it entirely as a triumph of modern women's rights.",
          "The psychological association was brilliant and diabolical: smoking was no longer an unhealthy habit, it was the ultimate badge of liberty.",
          "Within hours, telegraph wires carried the phrase 'Torches of Freedom' to front pages across Europe, America, and Asia.",
          "The American Tobacco Company watched its sales to women surge by hundreds of percent over the subsequent twelve months.",
          "Every modern marketing agency today still uses this exact Bernays formula: never sell the physical product, sell the buyer's desired identity."
        ],
        "cliffhanger": "Wait until you see how Bernays used the exact same trick to overturn a Central American government... Follow right now for Part 2!",
        "resolution": "Edward Bernays permanently transformed global marketing by exploiting subconscious desire rather than logical utility.",
        "cta": "Now you know the hidden psychological origin behind modern marketing. Save this video right now and follow for more untold daily truths!"
      },
      {
        "chapter_num": 2,
        "hook": "Welcome back to Part 2. When the Easter Parade ended, Edward Bernays didn't stop with cigarettes\u2014he turned his psychological formulas toward bananas and national governments.",
        "core_beats": [
          "In the 1950s, the United Fruit Company was facing land reform in Guatemala that threatened their multi-million dollar plantation monopoly.",
          "They hired Edward Bernays to manipulate the entire American populace into believing Guatemala had become a hostile communist threat.",
          "Bernays created fake news agencies, sponsored junkets for top journalists, and manufactured sensational headlines across mainstream newspapers.",
          "His manufactured propaganda successfully convinced the US government and the CIA to orchestrate the 1954 Guatemalan coup d'\u00e9tat.",
          "A democratically elected president was overthrown and replaced by a military dictatorship, all to protect the profit margins of a fruit corporation.",
          "Bernays later authored the foundational book 'Propaganda', famously stating that conscious manipulation of the masses is an invisible government.",
          "Today, whether you are scrolling social media feeds, viewing political campaigns, or shopping online, you are living in the world Bernays built."
        ],
        "expansion_beats": [
          "Historians now consider Bernays the undisputed father of modern public relations and consumer engineering.",
          "He lived to the age of 103, quietly observing how the psychological triggers he invented came to dominate modern digital algorithms.",
          "Whenever you find yourself desiring a luxury item you do not need, remember that a century of calculated psychology made you want it.",
          "True freedom begins when you become aware of the unseen hands shaping your daily choices and desires.",
          "Save this knowledge so you never fall victim to manufactured emotional manipulation."
        ],
        "cliffhanger": "Wait until you hear the secret origin of the 40-hour work week... Follow for Part 3!",
        "resolution": "Edward Bernays proved that narrative control is the most powerful weapon on Earth.",
        "cta": "Knowledge is power. Double tap, save this video, and follow for more eye-opening historical secrets every single day!"
      }
    ]
  }
];

export const STYLE_NARRATIVE_PROFILES: Record<string, any> = {
  "Dark Fantasy": {
    genreTag: "Dark Fantasy",
    visualDesc: "dark fantasy concept art masterpiece, sculpted dark steel plate knight armor, glowing mystical runes, ominous atmospheric mist, blood red moonlight, Elden Ring and Witcher aesthetics, cohesive painterly digital illustration, seamless character anatomy",
    narrativeVibe: "dark grimdark fantasy with ancient curses and eldritch secrets"
  },
  "Mecha": {
    genreTag: "Mecha",
    visualDesc: "giant mecha battle anime concept art, intricate mechanical joints, glowing blue energy thrusters, shattered orbital sky, cinematic 8k, seamless mecha rendering",
    narrativeVibe: "futuristic mechanized warfare and heroic titan pilots"
  },
  "Realism": {
    genreTag: "Realism",
    visualDesc: "cinematic 35mm photograph, wide establishing environmental shot, realistic lighting and textures, shallow depth of field, 8k",
    narrativeVibe: "gripping forensic realism, corporate espionage, and psychological stakes"
  },
  "Horror": {
    genreTag: "Horror",
    visualDesc: "dark eerie cinematic shadows, mist, foggy abandoned asylum hallway, volumetric lighting, 8k octane render",
    narrativeVibe: "chilling psychological horror and paranormal investigations"
  },
  "Adventure": {
    genreTag: "Adventure",
    visualDesc: "cinematic adventure concept art, bioluminescent jungle vines, ancient stone statues, cascading underground waterfalls, 8k",
    narrativeVibe: "grand archaeological discovery and perilous uncharted explorations"
  },
  "Motivational": {
    genreTag: "Motivational",
    visualDesc: "cinematic sports documentary aesthetic, cold breath in winter air, intense focused gaze, dramatic stadium spotlight, photorealistic 8k",
    narrativeVibe: "relentless discipline and triumphant human spirit"
  }
};

export const GENRE_CTA: Record<string, string[]> = {
  "Action": [
    "Mission accomplished with lethal precision. Double tap, save this video right now, and follow for more heart-stopping high-octane action thrillers!",
    "When danger strikes, heroes rise. Save this video and follow for more epic cinematic action sagas!",
  ],
  "Horror": [
    "The shadows are always watching. Double tap, save this video, and follow for the next terrifying story!",
    "Save this video if you dare, and follow for more chilling real-world horror encounters!",
  ],
  "Adventure": [
    "The world is full of forgotten mysteries. Double tap, save this video, and follow for more daring adventures!",
    "Some discoveries change history forever. Save this video and follow to explore the unknown!",
  ],
  "Motivational": [
    "Never let anyone tell you what you cannot achieve. Double tap, save this video, and follow for your daily drive to greatness!",
    "The comeback is always greater than the setback. Save this video and follow for your daily mindset shift!",
  ],
  "Interesting Facts": [
    "Now you know the hidden truth they never taught you. Save this video right now and follow for more untold daily facts!",
    "History is full of secrets hiding in plain sight. Double tap, save this video, and follow for more mind-blowing discoveries!",
  ],
  "Others": [
    "Justice always prevails when the truth is brought into the light. Save this video and follow for more gripping stories!",
    "Some stories were never meant to stay buried. Double tap, save this video, and follow for the next deep dive!",
  ]
};

export const UNTOLD_INTERESTING_FACTS = CHARACTER_ENSEMBLES.filter((e) => e.genre === "Interesting Facts");
export const DYNAMIC_DISCOVERY_TOPICS = ["The Torches of Freedom", "The Battle for the Phone", "The De Beers Monopoly"];
export const MOTIVATIONAL_ARCHETYPES = CHARACTER_ENSEMBLES.filter((e) => e.genre === "Motivational");

export async function scrapeWikipediaFact(query: string = "", excludeId: string = ""): Promise<any> {
  return null;
}

export function findMatchingInterestingFact(prompt: string, excludeId: string = ""): any {
  const facts = CHARACTER_ENSEMBLES.filter((e) => e.genre === "Interesting Facts");
  return facts[0] || CHARACTER_ENSEMBLES[0];
}

/**
 * Main story generator that guarantees:
 * 1. Category is strictly respected (Action -> Action, Horror -> Horror, etc.).
 * 2. Characters are introduced by name in the opening sentence.
 * 3. In multi-part videos, Part 2 contains 0% duplicate sentences from Part 1.
 * 4. Supports durations from 1 minute (60s) up to 10 minutes (600s) (~140 to ~1400 words).
 * 5. Generates 1 to 20 AI scene visual prompts evenly distributed across sentences.
 */
export async function generateStoryParts(params: {
  category: string;
  customTag?: string;
  prompt?: string;
  duration?: number;
  numImages?: number;
  numParts?: number;
  excludeId?: string;
  sceneStyle?: string;
}): Promise<StoryResult> {
  const {
    category = "Action",
    customTag = "",
    prompt = "",
    duration = 60,
    numImages = 5,
    numParts = 1,
    excludeId = "",
    sceneStyle = "Realism",
  } = params;

  const clampedParts = Math.max(1, Math.min(5, Number(numParts)));
  const clampedDuration = Math.max(60, Math.min(600, Number(duration)));
  const clampedImages = Math.max(1, Math.min(20, Number(numImages)));

  const targetWords = Math.round(clampedDuration * 2.3);

  const cleanPrompt = (prompt || "").trim().toLowerCase();
  const cleanCategory = (category || "").trim().toLowerCase();
  const cleanStyle = (sceneStyle || "").trim().toLowerCase();

  // CATEGORY-FIRST ENSEMBLE MATCHING:
  // Strictly prioritize the user's selected category!
  let matchedEnsemble = null;

  if (cleanCategory && cleanCategory !== "others") {
    // 1. Match category and style if possible
    matchedEnsemble = CHARACTER_ENSEMBLES.find((e) =>
      (e.category.toLowerCase() === cleanCategory || e.genre.toLowerCase() === cleanCategory) &&
      cleanStyle && e.genre.toLowerCase() === cleanStyle
    );
    // 2. Otherwise match category alone
    if (!matchedEnsemble) {
      matchedEnsemble = CHARACTER_ENSEMBLES.find((e) =>
        e.category.toLowerCase() === cleanCategory || e.genre.toLowerCase() === cleanCategory
      );
    }
  }

  // 3. If prompt has specific keywords, try matching keywords
  if (!matchedEnsemble && cleanPrompt) {
    matchedEnsemble = CHARACTER_ENSEMBLES.find((e) =>
      e.keywords && e.keywords.some((k: string) => cleanPrompt.includes(k))
    );
  }

  // 4. If category is Others or not matched yet, match by sceneStyle
  if (!matchedEnsemble && cleanStyle) {
    matchedEnsemble = CHARACTER_ENSEMBLES.find((e) => e.genre.toLowerCase() === cleanStyle);
  }

  // 5. Fallback
  if (!matchedEnsemble) {
    matchedEnsemble = CHARACTER_ENSEMBLES[0];
  }

  const baseTitle = cleanPrompt && cleanPrompt.length < 60 ? prompt.trim() : matchedEnsemble.title;
  const storySeed = Math.floor(Math.random() * 90000) + 10000;
  const storyId = `${matchedEnsemble.id}_${storySeed}`;

  const usedGlobalSentences = new Set<string>();
  const countWords = (arr: string[]) => arr.join(" ").trim().split(/\s+/).filter(Boolean).length;
  const partsData: StoryPart[] = [];

  for (let pIdx = 0; pIdx < clampedParts; pIdx++) {
    const pNum = pIdx + 1;
    const isLast = pNum === clampedParts;
    const pSentences: string[] = [];

    const chapter = matchedEnsemble.chapters[Math.min(pIdx, matchedEnsemble.chapters.length - 1)];

    // 1. Chapter Opening Hook (introduces characters by name)
    const hookSent = chapter.hook;
    if (!usedGlobalSentences.has(hookSent)) {
      pSentences.push(hookSent);
      usedGlobalSentences.add(hookSent);
    }

    // 2. Core Beats with dialogue and action
    for (const beat of chapter.core_beats) {
      if (!usedGlobalSentences.has(beat)) {
        pSentences.push(beat);
        usedGlobalSentences.add(beat);
        if (countWords(pSentences) >= targetWords - 35) break;
      }
    }

    // 3. Dynamic Narrative Expansion for requested duration (up to 10 minutes)
    if (chapter.expansion_beats && countWords(pSentences) < targetWords - 35) {
      for (const exp of chapter.expansion_beats) {
        if (!usedGlobalSentences.has(exp)) {
          pSentences.push(exp);
          usedGlobalSentences.add(exp);
          if (countWords(pSentences) >= targetWords - 35) break;
        }
      }
    }

    // 4. Chapter Ending: Cliffhanger (if more parts follow) or Resolution + CTA (if last part)
    if (!isLast && clampedParts > 1) {
      const cliff = (chapter.cliffhanger || "What happened next will shock you... Follow right now for Part " + (pNum + 1) + "!")
        .replace(/Part\s+\d+/gi, `Part ${pNum + 1}`);
      pSentences.push(cliff);
    } else {
      if (chapter.resolution && !usedGlobalSentences.has(chapter.resolution)) {
        pSentences.push(chapter.resolution);
        usedGlobalSentences.add(chapter.resolution);
      }
      const cta = chapter.cta || (GENRE_CTA[matchedEnsemble.category] || GENRE_CTA["Others"])[0];
      pSentences.push(cta);
    }

    const scriptText = pSentences.join(" ");

    // 5. Generate 1 to 20 AI Scene Visual Prompts
    const scenes: StoryScene[] = [];
    for (let sIdx = 0; sIdx < clampedImages; sIdx++) {
      const sentIndex = Math.min(pSentences.length - 1, Math.floor((sIdx * pSentences.length) / clampedImages));
      const sceneSentence = pSentences[sentIndex] || matchedEnsemble.setting;
      const sceneText = pSentences.slice(sentIndex, Math.min(sentIndex + 2, pSentences.length)).join(" ");
      const vPrompt = buildCleanVisualPrompt(
        sceneSentence,
        `${matchedEnsemble.char1} in ${matchedEnsemble.setting}`,
        matchedEnsemble.visual_style
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

  const effectiveCategory = cleanCategory ? category : matchedEnsemble.category;

  return {
    category: effectiveCategory,
    factId: storyId,
    overallTitle: baseTitle,
    numParts: clampedParts,
    durationPerPart: clampedDuration,
    parts: partsData,
    source: "character_story_engine",
  };
}
