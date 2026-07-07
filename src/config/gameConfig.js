// Central game configuration: team identities, challenge theming, defaults.

// Each scout team account is the champion of a Greek god.
export const TEAMS = {
  faucon: {
    god: 'Zeus',
    emblem: '🦅',
    title: 'Champions de Zeus',
    color: '#e2a83d',
    motto: 'La foudre frappe les plus rapides.',
  },
  leopard: {
    god: 'Artémis',
    emblem: '🐆',
    title: 'Chasseurs d’Artémis',
    color: '#94a860',
    motto: 'Aucune proie n’échappe à la meute.',
  },
  panda: {
    god: 'Athéna',
    emblem: '🐼',
    title: 'Sages d’Athéna',
    color: '#a887c9',
    motto: 'La ruse triomphe de la force.',
  },
  requin: {
    god: 'Poséidon',
    emblem: '🦈',
    title: 'Marée de Poséidon',
    color: '#6fa3c0',
    motto: 'Rien ne résiste à la vague.',
  },
  bison: {
    god: 'Arès',
    emblem: '🦬',
    title: 'Furie d’Arès',
    color: '#c05b41',
    motto: 'La charge ne s’arrête jamais.',
  },
};

export function teamInfo(username) {
  return (
    TEAMS[username] || {
      god: 'Olympe',
      emblem: '🏛️',
      title: username,
      color: '#e2a83d',
      motto: '',
    }
  );
}

export const CHALLENGE_META = {
  steps: {
    god: 'Hermès',
    icon: '🏃',
    title: 'La Course d’Hermès',
    tagline: 'Le messager des dieux vous met au défi.',
    playerIntro:
      'Hermès, aux sandales ailées, exige la vitesse. Faites le plus de pas possible avant la fin du temps ! Attention : dans la dernière ligne droite, les Moires voilent le classement…',
  },
  trivia: {
    god: 'La Pythie',
    icon: '🔮',
    title: 'L’Oracle de Delphes',
    tagline: 'La Pythie teste votre savoir.',
    playerIntro:
      'Les vapeurs sacrées de Delphes s’élèvent. Répondez aux questions de l’Oracle — plus vous êtes rapides, plus les dieux vous récompensent.',
  },
  bounty: {
    god: 'Méduse',
    icon: '🐍',
    title: 'Le Regard de Méduse',
    tagline: 'Pétrifiez avant d’être pétrifiés.',
    playerIntro:
      'Méduse a pris possession d’un mortel ! Photographiez-le comme Persée avec son bouclier-miroir : capturez son image pour le pétrifier avant qu’il ne vous transforme en statue.',
  },
  photo: {
    god: 'Héraclès',
    icon: '💪',
    title: 'Les Travaux d’Héraclès',
    tagline: 'Une épreuve digne des héros.',
    playerIntro:
      'Comme Héraclès et ses douze travaux, prouvez votre valeur : accomplissez la mission et rapportez-en la preuve en image.',
  },
  drawguess: {
    god: 'Les Muses',
    icon: '🎨',
    title: 'Le Défi des Muses',
    tagline: 'Créez, puis déchiffrez l’œuvre d’autrui.',
    playerIntro:
      'Les neuf Muses réclament une œuvre. Dessinez ce qu’elles vous inspirent — puis, telle une fresque antique, l’œuvre d’une autre équipe vous parviendra : saurez-vous la déchiffrer ?',
  },
  riddle: {
    god: 'Le Sphinx',
    icon: '🦁',
    title: 'L’Énigme du Sphinx',
    tagline: 'Répondez ou restez sur place.',
    playerIntro:
      'Le Sphinx bloque votre route, comme jadis celle d’Œdipe. Résolvez son énigme pour passer. Le premier à répondre gagne la faveur des dieux.',
  },
};

export function challengeMeta(type) {
  return (
    CHALLENGE_META[type] || {
      god: 'Olympe',
      icon: '⚡',
      title: 'Défi mystère',
      tagline: '',
      playerIntro: '',
    }
  );
}

export const RANK_POINTS = [100, 70, 50, 35, 20];

export const APP_NAME = 'L’Olympe';
export const APP_SUBTITLE = 'Le Grand Jeu des Dieux';
