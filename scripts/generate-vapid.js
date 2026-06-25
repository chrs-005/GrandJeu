import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();

console.log('\nVAPID keys generated successfully!\n');
console.log('Add these to your .env and Vercel environment variables:\n');
console.log(`VITE_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('\nNote: VITE_VAPID_PUBLIC_KEY goes in the frontend (Vite exposes it).');
console.log('      VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are backend-only secrets.\n');
