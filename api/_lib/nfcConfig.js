// NFC hunt configuration.
// The five tag destinations can be overridden in Vercel as NFC_TAG_1_URL ...
// NFC_TAG_5_URL. The completed route is the built-in Hades reveal.

export const NFC_TAGS = {
  1: {
    label: 'Tag 1 - Instagram',
    destinationUrl: process.env.NFC_TAG_1_URL || 'https://www.instagram.com/sisoprvttt?igsh=enhxMGFzZW10dmMy',
  },
  2: {
    label: 'Tag 2 - YouTube',
    destinationUrl: process.env.NFC_TAG_2_URL || 'https://youtu.be/bfodpBO4HU0',
  },
  3: {
    label: 'Tag 3 - YouTube',
    destinationUrl: process.env.NFC_TAG_3_URL || 'https://youtu.be/drF04InyDew',
  },
  4: {
    label: 'Tag 4 - Picture',
    destinationUrl: process.env.NFC_TAG_4_URL || '/nfc/picture-1.jpg',
  },
  5: {
    label: 'Tag 5 - Picture',
    destinationUrl: process.env.NFC_TAG_5_URL || '/nfc/picture-2.jpg',
  },
};

export const NFC_REQUIRED_TAG_COUNT = Object.keys(NFC_TAGS).length;

// A team that had already completed all 5 tags reaches the Hades reveal from
// its next scan. Set NFC_FINAL_TRIGGER_TAG=1 if only tag 1 should do it.
export const NFC_FINAL_URL = '/hades';
export const NFC_FINAL_TRIGGER_TAG = process.env.NFC_FINAL_TRIGGER_TAG || '';

export function normalizeNfcTeam(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

export function normalizeNfcTag(value) {
  return String(value || '').trim();
}
