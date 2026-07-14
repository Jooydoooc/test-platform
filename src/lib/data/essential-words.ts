// 4000 Essential English Words · Book 1 — Units 1–5.
//
// Single source of truth for the built-in vocabulary. Each word carries the
// full data every drill needs: the English word, part of speech, an English
// definition, an Uzbek translation, and two example sentences that contain the
// word (used by the gap-fill, sentence-builder and matching exercises).
//
// Consumed by:
//   • src/lib/vocab-store.ts  → the read/collect + drill sources (eew1-u1..u5)
//   • src/lib/store.ts        → the Books "choose the meaning" quiz tests
//
// NOTE: the Uzbek translations were machine-drafted and should be reviewed by a
// native speaker before this ships to students.

export type EssentialWord = {
  word: string;
  part_of_speech: string;
  definition_en: string;
  translation_uz: string;
  examples: string[];
};

export type EssentialUnit = {
  /** 1-based unit number within the book. */
  unit: number;
  words: EssentialWord[];
};

export const ESSENTIAL_WORDS_BOOK1: EssentialUnit[] = [
  {
    unit: 1,
    words: [
      { word: "agree", part_of_speech: "v.", definition_en: "to have the same opinion or belief as another person", translation_uz: "rozi bo‘lmoq", examples: ["I agree with your plan.", "They did not agree on a price."] },
      { word: "alcohol", part_of_speech: "n.", definition_en: "a type of drink that can make people drunk", translation_uz: "alkogol, spirtli ichimlik", examples: ["He never drinks alcohol.", "This drink contains no alcohol."] },
      { word: "arrive", part_of_speech: "v.", definition_en: "to get somewhere", translation_uz: "yetib kelmoq", examples: ["We arrive at school by eight.", "What time does the train arrive?"] },
      { word: "August", part_of_speech: "n.", definition_en: "the eighth month of the year", translation_uz: "avgust", examples: ["My birthday is in August.", "We travel every August."] },
      { word: "boat", part_of_speech: "n.", definition_en: "a vehicle that moves across water", translation_uz: "qayiq", examples: ["They crossed the lake by boat.", "The boat is very small."] },
      { word: "breakfast", part_of_speech: "n.", definition_en: "the morning meal", translation_uz: "nonushta", examples: ["I eat breakfast at seven.", "She made a big breakfast."] },
      { word: "camera", part_of_speech: "n.", definition_en: "a piece of equipment that takes pictures", translation_uz: "kamera, fotoapparat", examples: ["He bought a new camera.", "Please bring your camera."] },
      { word: "capital", part_of_speech: "n.", definition_en: "a city where a country’s government is based", translation_uz: "poytaxt", examples: ["Paris is the capital of France.", "Tokyo is a large capital."] },
      { word: "catch", part_of_speech: "v.", definition_en: "to grab or get something", translation_uz: "ushlamoq, ilib olmoq", examples: ["Try to catch the ball.", "The cat likes to catch mice."] },
      { word: "duck", part_of_speech: "n.", definition_en: "a small water bird", translation_uz: "o‘rdak", examples: ["A duck swam across the pond.", "The children fed the duck."] },
      { word: "enjoy", part_of_speech: "v.", definition_en: "to like something", translation_uz: "zavqlanmoq, yoqmoq", examples: ["I enjoy playing football.", "They enjoy the warm weather."] },
      { word: "invite", part_of_speech: "v.", definition_en: "to ask someone to come to a place or event", translation_uz: "taklif qilmoq", examples: ["Let’s invite them to dinner.", "She will invite all her friends."] },
      { word: "love", part_of_speech: "v.", definition_en: "to like something or someone a lot", translation_uz: "sevmoq, yaxshi ko‘rmoq", examples: ["I love this song.", "They love their new house."] },
      { word: "month", part_of_speech: "n.", definition_en: "one of 12 periods of time in one year", translation_uz: "oy", examples: ["We meet once a month.", "This month has been busy."] },
      { word: "travel", part_of_speech: "v.", definition_en: "to go to a faraway place on vacation or business", translation_uz: "sayohat qilmoq", examples: ["I love to travel abroad.", "They travel by train."] },
      { word: "typical", part_of_speech: "adj.", definition_en: "normal, or something that usually happens", translation_uz: "odatiy, tipik", examples: ["It was a typical winter day.", "That is typical of him."] },
      { word: "visit", part_of_speech: "v.", definition_en: "to go and spend time in another place or see another person", translation_uz: "tashrif buyurmoq", examples: ["We visit our grandparents often.", "I want to visit Rome."] },
      { word: "weather", part_of_speech: "n.", definition_en: "the temperature and the state of the outdoors", translation_uz: "ob-havo", examples: ["The weather is nice today.", "Bad weather stopped the game."] },
      { word: "week", part_of_speech: "n.", definition_en: "a period of time that is seven days long", translation_uz: "hafta", examples: ["See you next week.", "The course lasts one week."] },
      { word: "wine", part_of_speech: "n.", definition_en: "an alcoholic drink made from grapes", translation_uz: "vino, uzum sharobi", examples: ["He poured a glass of wine.", "This wine is from Italy."] },
    ],
  },
  {
    unit: 2,
    words: [
      { word: "adventure", part_of_speech: "n.", definition_en: "a fun or exciting thing that you do", translation_uz: "sarguzasht", examples: ["Our trip was a great adventure.", "She loves an adventure in the mountains."] },
      { word: "approach", part_of_speech: "v.", definition_en: "to move close to something", translation_uz: "yaqinlashmoq", examples: ["The dog began to approach the door.", "We slowly approach the top of the hill."] },
      { word: "carefully", part_of_speech: "adv.", definition_en: "with great attention, especially to detail or safety", translation_uz: "ehtiyotkorlik bilan, diqqat bilan", examples: ["He carefully carried the glass.", "Please read the question carefully."] },
      { word: "chemical", part_of_speech: "n.", definition_en: "something that scientists use in chemistry", translation_uz: "kimyoviy modda", examples: ["The chemical turned the water blue.", "Never taste an unknown chemical."] },
      { word: "create", part_of_speech: "v.", definition_en: "to make something new", translation_uz: "yaratmoq", examples: ["Artists create beautiful things.", "We will create a new plan."] },
      { word: "evil", part_of_speech: "adj.", definition_en: "very bad or cruel, not good", translation_uz: "yovuz, qabih", examples: ["The story has an evil king.", "That was an evil thing to do."] },
      { word: "experiment", part_of_speech: "n.", definition_en: "a test that you do to see what will happen", translation_uz: "tajriba", examples: ["We did an experiment in class.", "The experiment was a success."] },
      { word: "kill", part_of_speech: "v.", definition_en: "to make a living thing die", translation_uz: "o‘ldirmoq", examples: ["Frost can kill young plants.", "The hero tried to kill the dragon."] },
      { word: "laboratory", part_of_speech: "n.", definition_en: "a room where a scientist works", translation_uz: "laboratoriya", examples: ["The scientist works in a laboratory.", "The laboratory is very clean."] },
      { word: "laugh", part_of_speech: "v.", definition_en: "to make sounds because something is funny", translation_uz: "kulmoq", examples: ["The joke made us laugh.", "Don’t laugh at other people."] },
      { word: "loud", part_of_speech: "adj.", definition_en: "strong and very easy to hear", translation_uz: "baland (ovoz), shovqinli", examples: ["The music is too loud.", "He has a loud voice."] },
      { word: "nervous", part_of_speech: "adj.", definition_en: "worried that something bad will happen", translation_uz: "asabiy, hayajonli", examples: ["I feel nervous before a test.", "She was nervous on the stage."] },
      { word: "noise", part_of_speech: "n.", definition_en: "an unpleasant or loud sound", translation_uz: "shovqin", examples: ["The noise woke the baby.", "Cars make a lot of noise."] },
      { word: "project", part_of_speech: "n.", definition_en: "a type of work that you do for school or a job", translation_uz: "loyiha", examples: ["Our science project is due Friday.", "The team finished the project."] },
      { word: "scare", part_of_speech: "v.", definition_en: "to make someone feel afraid", translation_uz: "qo‘rqitmoq", examples: ["Loud sounds scare the dog.", "The mask can scare small children."] },
      { word: "secret", part_of_speech: "n.", definition_en: "something that you do not tell other people", translation_uz: "sir", examples: ["Can you keep a secret?", "She told me her secret."] },
      { word: "shout", part_of_speech: "v.", definition_en: "to say something very loudly", translation_uz: "qichqirmoq, baqirmoq", examples: ["Don’t shout in the library.", "He had to shout over the noise."] },
      { word: "smell", part_of_speech: "v.", definition_en: "to use your nose to sense something", translation_uz: "hidlamoq, hid sezmoq", examples: ["I can smell fresh bread.", "The flowers smell sweet."] },
      { word: "terrible", part_of_speech: "adj.", definition_en: "very bad", translation_uz: "dahshatli, juda yomon", examples: ["The weather was terrible.", "I had a terrible day."] },
      { word: "worse", part_of_speech: "adj.", definition_en: "of poorer quality than another thing", translation_uz: "battar, yomonroq", examples: ["My cold is getting worse.", "This road is worse than that one."] },
    ],
  },
  {
    unit: 3,
    words: [
      { word: "alien", part_of_speech: "n.", definition_en: "a creature from a different world", translation_uz: "o‘zga sayyoralik", examples: ["The film is about an alien.", "He drew a green alien."] },
      { word: "among", part_of_speech: "prep.", definition_en: "in the middle of or surrounded by others", translation_uz: "orasida", examples: ["She sat among her friends.", "The house is hidden among the trees."] },
      { word: "chart", part_of_speech: "n.", definition_en: "a drawing that shows information", translation_uz: "jadval, diagramma", examples: ["The chart shows our sales.", "Look at the chart on the wall."] },
      { word: "cloud", part_of_speech: "n.", definition_en: "a group of water drops in the sky", translation_uz: "bulut", examples: ["A dark cloud covered the sun.", "There is not a single cloud today."] },
      { word: "describe", part_of_speech: "v.", definition_en: "to say or write what someone or something is like", translation_uz: "tasvirlamoq, ta’riflamoq", examples: ["Can you describe the man?", "Please describe your hometown."] },
      { word: "ever", part_of_speech: "adv.", definition_en: "at any time", translation_uz: "hech qachon, biror marta", examples: ["Have you ever been to Rome?", "It is the best film I have ever seen."] },
      { word: "fail", part_of_speech: "v.", definition_en: "to not succeed in what you try to do", translation_uz: "muvaffaqiyatsizlikka uchramoq, yiqilmoq", examples: ["He was afraid to fail the exam.", "The plan did not fail."] },
      { word: "grade", part_of_speech: "n.", definition_en: "a score or mark given to someone’s work", translation_uz: "baho, ball", examples: ["She got a good grade.", "My grade in math improved."] },
      { word: "instead", part_of_speech: "adv.", definition_en: "in place of something else", translation_uz: "o‘rniga", examples: ["Let’s walk instead of driving.", "I chose tea instead."] },
      { word: "library", part_of_speech: "n.", definition_en: "a place where you go to read or borrow books", translation_uz: "kutubxona", examples: ["I study at the library.", "The library is open late."] },
      { word: "photograph", part_of_speech: "n.", definition_en: "a picture made with a camera", translation_uz: "surat, fotosurat", examples: ["She took a photograph of the sunset.", "This photograph is very old."] },
      { word: "planet", part_of_speech: "n.", definition_en: "a large round thing in space", translation_uz: "sayyora", examples: ["Earth is our planet.", "Mars is a red planet."] },
      { word: "report", part_of_speech: "n.", definition_en: "something someone writes for school or work", translation_uz: "hisobot, ma’ruza", examples: ["I wrote a report about birds.", "The report is due tomorrow."] },
      { word: "several", part_of_speech: "adj.", definition_en: "more than two but not many", translation_uz: "bir nechta", examples: ["I called you several times.", "Several people were waiting."] },
      { word: "shape", part_of_speech: "n.", definition_en: "the form of something, made by its sides and surfaces", translation_uz: "shakl", examples: ["A ball has a round shape.", "Cut the paper into a star shape."] },
      { word: "solve", part_of_speech: "v.", definition_en: "to find an answer to a problem", translation_uz: "yechmoq, hal qilmoq", examples: ["Can you solve this problem?", "We must solve it together."] },
      { word: "suddenly", part_of_speech: "adv.", definition_en: "quickly and unexpectedly", translation_uz: "birdan, to‘satdan", examples: ["Suddenly, the lights went out.", "The car stopped suddenly."] },
      { word: "suppose", part_of_speech: "v.", definition_en: "to think something is probably true; to guess", translation_uz: "taxmin qilmoq, deb o‘ylamoq", examples: ["I suppose you are right.", "Do you suppose it will rain?"] },
      { word: "understand", part_of_speech: "v.", definition_en: "to know what something means", translation_uz: "tushunmoq", examples: ["I understand the lesson now.", "Do you understand my question?"] },
      { word: "view", part_of_speech: "n.", definition_en: "what you can see from a place", translation_uz: "manzara, ko‘rinish", examples: ["The room has a nice view.", "We enjoyed the view from the hill."] },
    ],
  },
  {
    unit: 4,
    words: [
      { word: "appropriate", part_of_speech: "adj.", definition_en: "right or suitable for a situation", translation_uz: "mos, o‘rinli", examples: ["Wear appropriate clothes for the interview.", "That was not an appropriate joke."] },
      { word: "avoid", part_of_speech: "v.", definition_en: "to stay away from something", translation_uz: "qochmoq, chetlab o‘tmoq", examples: ["Try to avoid the busy road.", "She wanted to avoid the crowd."] },
      { word: "behave", part_of_speech: "v.", definition_en: "to act in a particular way, especially to be good", translation_uz: "o‘zini tutmoq", examples: ["The children behave well at school.", "Please behave during the meeting."] },
      { word: "calm", part_of_speech: "adj.", definition_en: "not excited or upset; peaceful", translation_uz: "xotirjam, tinch", examples: ["Stay calm and breathe slowly.", "The sea was calm today."] },
      { word: "concern", part_of_speech: "n.", definition_en: "a feeling of worry", translation_uz: "tashvish, xavotir", examples: ["Her main concern is safety.", "There is no cause for concern."] },
      { word: "content", part_of_speech: "adj.", definition_en: "happy and not wanting more", translation_uz: "mamnun, qanoat qilgan", examples: ["She felt content with her life.", "He is content to stay home."] },
      { word: "expect", part_of_speech: "v.", definition_en: "to believe that something will happen", translation_uz: "kutmoq, umid qilmoq", examples: ["We expect rain tonight.", "I expect you to be on time."] },
      { word: "frequently", part_of_speech: "adv.", definition_en: "often", translation_uz: "tez-tez", examples: ["He frequently visits his aunt.", "This bus comes frequently."] },
      { word: "habit", part_of_speech: "n.", definition_en: "a thing that you do often", translation_uz: "odat", examples: ["Reading is a good habit.", "He has a habit of being late."] },
      { word: "instruct", part_of_speech: "v.", definition_en: "to teach or tell someone how to do something", translation_uz: "o‘rgatmoq, ko‘rsatma bermoq", examples: ["The coach will instruct the team.", "She instructed us to wait."] },
      { word: "issue", part_of_speech: "n.", definition_en: "an important topic or problem", translation_uz: "masala, muammo", examples: ["We discussed the issue in class.", "Money is not the main issue."] },
      { word: "none", part_of_speech: "pron.", definition_en: "not any of something", translation_uz: "hech biri, hech qancha", examples: ["None of the answers were correct.", "I wanted milk, but there was none."] },
      { word: "patient", part_of_speech: "adj.", definition_en: "able to wait without becoming angry or upset", translation_uz: "sabrli", examples: ["A good teacher is patient.", "Please be patient with the child."] },
      { word: "positive", part_of_speech: "adj.", definition_en: "good or hopeful", translation_uz: "ijobiy", examples: ["Keep a positive attitude.", "The news was very positive."] },
      { word: "punish", part_of_speech: "v.", definition_en: "to make someone suffer for breaking a rule", translation_uz: "jazolamoq", examples: ["Do not punish him for a small mistake.", "The rules punish cheating."] },
      { word: "represent", part_of_speech: "v.", definition_en: "to speak or act for a person or group", translation_uz: "vakillik qilmoq, ifodalamoq", examples: ["She will represent our school.", "This flag represents peace."] },
      { word: "shake", part_of_speech: "v.", definition_en: "to move back and forth or up and down quickly", translation_uz: "silkitmoq, qaltiramoq", examples: ["Shake the bottle before you open it.", "His hands began to shake."] },
      { word: "spread", part_of_speech: "v.", definition_en: "to move out to cover a larger area", translation_uz: "yoymoq, tarqalmoq", examples: ["The fire began to spread.", "Spread the map on the table."] },
      { word: "stroll", part_of_speech: "v.", definition_en: "to walk slowly and calmly", translation_uz: "sayr qilmoq, sekin yurmoq", examples: ["We stroll in the park after dinner.", "They stroll along the beach."] },
      { word: "village", part_of_speech: "n.", definition_en: "a very small town", translation_uz: "qishloq", examples: ["My grandmother lives in a village.", "The village has one small shop."] },
    ],
  },
  {
    unit: 5,
    words: [
      { word: "active", part_of_speech: "adj.", definition_en: "moving a lot or having a lot to do", translation_uz: "faol, harakatchan", examples: ["She stays active by running.", "He is an active member of the club."] },
      { word: "adult", part_of_speech: "n.", definition_en: "a person who is more than 18 years old", translation_uz: "kattalar, voyaga yetgan kishi", examples: ["Every adult must buy a ticket.", "He behaves like an adult."] },
      { word: "age", part_of_speech: "n.", definition_en: "how many years someone has lived", translation_uz: "yosh", examples: ["What is your age?", "Children of the same age play together."] },
      { word: "bad", part_of_speech: "adj.", definition_en: "not good", translation_uz: "yomon", examples: ["That was a bad idea.", "The milk smells bad."] },
      { word: "balance", part_of_speech: "n.", definition_en: "when two or more things are equal", translation_uz: "muvozanat", examples: ["She lost her balance and fell.", "Try to find a balance between work and rest."] },
      { word: "bike", part_of_speech: "n.", definition_en: "a vehicle with two wheels that you power with your legs", translation_uz: "velosiped", examples: ["I ride my bike to school.", "His bike has a flat tire."] },
      { word: "choose", part_of_speech: "v.", definition_en: "to pick something or make a decision", translation_uz: "tanlamoq", examples: ["You can choose any color.", "It is hard to choose a gift."] },
      { word: "doctor", part_of_speech: "n.", definition_en: "a person who helps sick people get well", translation_uz: "shifokor, doktor", examples: ["The doctor gave me medicine.", "You should see a doctor."] },
      { word: "during", part_of_speech: "prep.", definition_en: "at some point in a period of time", translation_uz: "davomida, vaqtida", examples: ["We were quiet during the film.", "He slept during the trip."] },
      { word: "football", part_of_speech: "n.", definition_en: "a sport played by two teams with a ball", translation_uz: "futbol", examples: ["They play football on Sundays.", "Football is his favorite sport."] },
      { word: "fun", part_of_speech: "adj.", definition_en: "enjoyable", translation_uz: "qiziqarli, zavqli", examples: ["The party was a lot of fun.", "We had a fun day at the lake."] },
      { word: "game", part_of_speech: "n.", definition_en: "an activity where people compete against each other", translation_uz: "o‘yin", examples: ["Let’s play a board game.", "Our team won the game."] },
      { word: "heart", part_of_speech: "n.", definition_en: "the organ that pumps blood and keeps the body alive", translation_uz: "yurak", examples: ["Running is good for your heart.", "I could feel my heart beating."] },
      { word: "golf", part_of_speech: "n.", definition_en: "a sport played with clubs and a small white ball", translation_uz: "golf", examples: ["My uncle plays golf on weekends.", "Golf needs a large green field."] },
      { word: "increase", part_of_speech: "v.", definition_en: "to make something larger or greater", translation_uz: "oshirmoq, ko‘paytirmoq", examples: ["The shop will increase its prices.", "Exercise can increase your energy."] },
      { word: "life", part_of_speech: "n.", definition_en: "the time when a person is alive", translation_uz: "hayot", examples: ["She has a happy life.", "City life is very busy."] },
      { word: "kilometer", part_of_speech: "n.", definition_en: "a unit of measurement that is 1,000 meters", translation_uz: "kilometr", examples: ["The school is one kilometer away.", "We ran five kilometers today."] },
      { word: "often", part_of_speech: "adv.", definition_en: "many times; frequently", translation_uz: "ko‘pincha, tez-tez", examples: ["We often eat dinner together.", "How often do you exercise?"] },
      { word: "plenty", part_of_speech: "pron.", definition_en: "more than enough of something", translation_uz: "yetarlicha, ko‘p", examples: ["There is plenty of food for everyone.", "We have plenty of time."] },
      { word: "weight", part_of_speech: "n.", definition_en: "how heavy something or someone is", translation_uz: "og‘irlik, vazn", examples: ["The doctor checked my weight.", "This box is too much weight to lift."] },
    ],
  },
];
