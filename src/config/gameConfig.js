// Central game configuration: team identities, challenge theming, defaults.
import bisonLogo from '../assets/bison.png';
import fauconLogo from '../assets/faucon.png';
import leopardLogo from '../assets/leopard.png';
import pandaLogo from '../assets/panda.png';
import requinLogo from '../assets/requin.png';

// Each scout team account is the champion of a Greek god.
export const TEAMS = {
  faucon: {
    god: 'Zeus',
    emblem: '🦅',
    title: 'Champions de Zeus',
    color: '#e2a83d',
    neon: '#ffcf3f', // vivid variant for map overlays (dark basemap)
    motto: 'La foudre frappe les plus rapides.',
    logo: fauconLogo,
  },
  leopard: {
    god: 'Artémis',
    emblem: '🐆',
    title: 'Chasseurs d’Artémis',
    color: '#94a860',
    neon: '#a4e05a',
    motto: 'Aucune proie n’échappe à la meute.',
    logo: leopardLogo,
  },
  panda: {
    god: 'Athéna',
    emblem: '🐼',
    title: 'Sages d’Athéna',
    color: '#a887c9',
    neon: '#c98aff',
    motto: 'La ruse triomphe de la force.',
    logo: pandaLogo,
  },
  requin: {
    god: 'Poséidon',
    emblem: '🦈',
    title: 'Marée de Poséidon',
    color: '#6fa3c0',
    neon: '#48d3ff',
    motto: 'Rien ne résiste à la vague.',
    logo: requinLogo,
  },
  bison: {
    god: 'Arès',
    emblem: '🦬',
    title: 'Furie d’Arès',
    color: '#c05b41',
    neon: '#ff6a52',
    motto: 'La charge ne s’arrête jamais.',
    logo: bisonLogo,
  },
};

export function teamInfo(username) {
  return (
    TEAMS[username] || {
      god: 'Olympe',
      emblem: '🏛️',
      title: username,
      color: '#e2a83d',
      neon: '#ffcf3f',
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
      'Les vapeurs sacrées de Delphes s’élèvent. Répondez aux questions de l’Oracle : les bonnes réponses et la rapidité détermineront le classement final.',
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
  guide: {
    god: 'Ariane',
    icon: '🧭',
    title: 'Le Fil d’Ariane',
    tagline: 'Suivez le fil jusqu’au bout du labyrinthe.',
    playerIntro:
      'Ariane a tendu son fil à travers le labyrinthe du monde. Suivez la flèche et sentez le fil chauffer à mesure que vous approchez.',
  },
  territory: {
    god: 'Arès',
    icon: '⚔️',
    title: 'La Conquête d’Arès',
    tagline: 'Marchez, encerclez, conquérez.',
    playerIntro:
      'Arès offre le monde à qui saura le prendre ! Marchez pour tracer votre sillage, puis revenez sur vos terres pour capturer toute la zone encerclée. Volez les terres des autres — le plus grand empire l’emporte.',
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

export const APP_NAME = 'L’Olympe';
export const APP_SUBTITLE = 'Le Grand Jeu des Dieux';
