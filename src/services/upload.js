import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/client';

// Submissions go straight from the phone to Firebase Storage: videos are far
// too big to pass through a serverless function, and this also gives us a
// progress bar on a shaky camp-day connection.

export const MAX_UPLOAD_BYTES = 60 * 1024 * 1024; // matches storage.rules

// Big photos are pointless to ship at full resolution; videos are left alone
// (re-encoding in the browser is slow and unreliable on iOS).
async function compressImage(file, maxDimension = 1600, quality = 0.82) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 2 * 1024 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    );
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // any decoding hiccup → send the original
  }
}

/**
 * Upload one submission. Returns { mediaUrl, mediaType, storagePath }.
 * `onProgress` receives 0–100.
 */
export async function uploadSubmission(user, challengeId, file, onProgress) {
  const isVideo = file.type.startsWith('video/');
  const payload = isVideo ? file : await compressImage(file);

  if (payload.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Fichier trop lourd (${Math.round(payload.size / 1024 / 1024)} Mo). Filme plus court !`
    );
  }

  const extension = isVideo ? (file.name?.split('.').pop() || 'mp4').slice(0, 5) : 'jpg';
  const safeId = String(challengeId).replace(/[^a-zA-Z0-9_-]/g, '');
  const path = `submissions/${user.uid}/${safeId}-${Date.now()}.${extension}`;
  const task = uploadBytesResumable(ref(storage, path), payload, {
    contentType: payload.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
  });

  await new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      resolve
    );
  });

  return {
    mediaUrl: await getDownloadURL(task.snapshot.ref),
    mediaType: isVideo ? 'video' : 'photo',
    storagePath: path,
  };
}
