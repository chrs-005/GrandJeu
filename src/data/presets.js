// Ready-to-use content for the admin console.

// Drawing prompts for Le Défi des Muses (need at least one per team).
export const DRAWING_PROMPTS = [
  'Le cheval de Troie',
  'Zeus qui lance un éclair',
  'Méduse et ses cheveux-serpents',
  'Cerbère, le chien à trois têtes',
  'Poséidon et son trident',
  'Le Minotaure dans son labyrinthe',
  'Icare qui vole trop près du soleil',
  'Un cyclope qui fait un barbecue',
  'Hermès et ses sandales ailées',
  'La boîte de Pandore',
  'Une sirène qui chante',
  'Atlas qui porte le monde',
];

// Photo mission presets for Les Travaux d'Héraclès.
export const PHOTO_MISSIONS = [
  'Toute l’équipe en pyramide humaine devant un monument',
  'Recréez une statue grecque : toute l’équipe figée en pose héroïque',
  'Photo de l’équipe entière en plein saut',
  'Trouvez quelque chose de doré et prenez-le en photo avec toute l’équipe',
  'Imitez la fontaine la plus proche',
  'Photo avec un inconnu qui fait le salut scout',
  'Recréez la scène : Zeus foudroie un membre de l’équipe',
  'Toute l’équipe cachée derrière un seul arbre / poteau',
];

// Riddle presets for L'Énigme du Sphinx (answers = accepted variants).
export const RIDDLE_PRESETS = [
  {
    label: 'L’énigme classique du Sphinx',
    text: 'Quel être marche à quatre pattes le matin, à deux pattes le midi et à trois pattes le soir ?',
    answers: ['l’homme', 'homme', 'l’humain', 'humain', 'l’être humain'],
  },
  {
    label: 'Écho',
    text: 'Je vis dans les montagnes et les grottes. Je parle toutes les langues mais je n’ai rien à dire : je ne fais que répéter. Qui suis-je ?',
    answers: ['écho', 'l’écho', 'un écho'],
  },
  {
    label: 'L’ombre',
    text: 'Je te suis toute la journée sous Hélios, mais je disparais quand la nuit tombe. Qui suis-je ?',
    answers: ['ombre', 'l’ombre', 'mon ombre', 'une ombre'],
  },
  {
    label: 'Le feu de Prométhée',
    text: 'Prométhée m’a volé aux dieux. Je meurs si je bois, je vis si je mange. Qui suis-je ?',
    answers: ['feu', 'le feu'],
  },
];
