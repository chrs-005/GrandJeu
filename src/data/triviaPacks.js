// Question packs for L'Oracle de Delphes.
// type: choice = auto-corrected, text/list = reviewed by admins.
// correct = index of the right option for choice questions.

export const TRIVIA_PACKS = [
  {
    id: 'scout-mix',
    name: 'Scout trivia',
    questions: [
      {
        q: 'Ade oomro père Malkoun?',
        options: ['48', '59', '60', '52'],
        correct: 3,
        timeLimitSec: 15,
      },
      {
        q: 'Bi addeh chtara Homse ticket Kin x Pop up?',
        options: ['40$', '25$', '110$', '15$'],
        correct: 3,
        timeLimitSec: 15,
      },
      {
        type: 'list',
        q: 'Name 4 chefs Centaure.',
        slots: 4,
        timeLimitSec: 15,
      },
      {
        q: 'Kam pull up byaamoul act Sarrouh?',
        options: ['5', '6', '8', '10'],
        correct: 3,
        timeLimitSec: 15,
      },
      {
        type: 'list',
        q: "Name 5 emplacements camp d'ete/paques.",
        slots: 5,
        timeLimitSec: 15,
      },
      {
        q: 'Bi ayya state ken act Chebab wa2ta sefar?',
        options: ['New York', 'Florida', 'Kentucky', 'Massachusets'],
        correct: 3,
        timeLimitSec: 15,
      },
      {
        type: 'list',
        q: "Name 2 mots de passe men last camp d'ete.",
        slots: 2,
        timeLimitSec: 15,
      },
      {
        q: 'Kam haye etil chef Jad bil scout?',
        options: ['Insa ha kelo kezeb', '85', '12', 'Hue ma byaarif'],
        correct: 3,
        timeLimitSec: 15,
      },
      {
        type: 'list',
        q: 'Name 2 keno maitrise kel el groupe w batalo hal sene.',
        slots: 2,
        timeLimitSec: 15,
      },
    ],
  },
  {
    id: 'scout-free-field',
    name: 'Scout free field',
    questions: [
      {
        type: 'text',
        q: 'Kam nain aayzin la yerbaho chef Jad b fight?',
        timeLimitSec: 15,
      },
      {
        type: 'text',
        q: 'Eza leebna rugby dod cie 2 ade byekhlas l score w min MVP?',
        timeLimitSec: 15,
      },
      {
        type: 'text',
        q: 'Troupe edition: who would be the funniest/worst roommate on camp, and why?',
        timeLimitSec: 15,
      },
      {
        type: 'text',
        q: 'Cheftaines edition: give a funny award title for each cheftaine.',
        timeLimitSec: 15,
      },
      {
        type: 'text',
        q: 'What would Homse do if he won the loto?',
        timeLimitSec: 15,
      },
      {
        type: 'text',
        q: 'Chu byaamoul père Malkoun bas lkel bel der b nem?',
        timeLimitSec: 15,
      },
      {
        type: 'text',
        q: 'Jeu de mot creative la mot de passe el layle.',
        timeLimitSec: 15,
      },
      {
        type: 'text',
        q: 'Wein ken 3emlna el camp iza kenit cheftaine Lea Hajj chef troupe?',
        timeLimitSec: 15,
      },
      {
        type: 'text',
        q: 'Min tene aewa patrouille bil troupe w leh?',
        timeLimitSec: 15,
      },
    ],
  },
  {
    id: 'trivia-general',
    name: 'Trivia generale',
    questions: [
      {
        q: 'What was the last FIBA World Cup final?',
        options: ['USA vs Germany', 'USA vs Serbia', 'France vs Germany', 'Serbia vs Germany'],
        correct: 3,
        timeLimitSec: 25,
      },
      {
        q: 'In how many movies did Zendaya appear in 2026?',
        options: ['2', '3', '5', '4'],
        correct: 3,
        timeLimitSec: 22,
      },
      {
        q: 'Which is not a Kanye West song?',
        options: ['Ghost Town', 'Famous', 'Runaway', 'The Hills'],
        correct: 3,
        timeLimitSec: 19,
      },
      {
        q: 'Where would you be if you were standing on the Spanish Steps?',
        options: ['Paris', 'Madrid', 'Andalousia', 'Rome'],
        correct: 3,
        timeLimitSec: 16,
      },
      {
        q: "How many times did Messi come 2nd in the Ballon d'Or?",
        options: ['4', '3', '7', '5'],
        correct: 3,
        timeLimitSec: 13,
      },
      {
        q: 'Which planet has the shortest day?',
        options: ['Mars', 'Earth', 'Venus', 'Jupiter'],
        correct: 3,
        timeLimitSec: 10,
      },
      {
        q: "Where was BP's first camp?",
        options: ['SeaBrown', 'BlackSea', 'BrownBlack', 'BrownSea'],
        correct: 3,
        timeLimitSec: 7,
      },
      {
        q: "What is Mr. Beast's real name?",
        options: ['Jimmy Peters', 'Jim Easterwood', 'Jimmy Donalds', 'Jimmy Donaldson'],
        correct: 3,
        timeLimitSec: 5,
      },
      {
        q: 'What is the chemical symbol for gold?',
        options: ['Ag', 'Gd', 'Go', 'Au'],
        correct: 3,
        timeLimitSec: 4,
      },
      {
        q: 'Which country won the 2022 FIFA World Cup?',
        options: ['France', 'Brazil', 'Germany', 'Argentina'],
        correct: 3,
        timeLimitSec: 3,
      },
    ],
  },
];
