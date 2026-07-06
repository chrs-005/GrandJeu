import { useRef, useState } from 'react';

const MAX_DIMENSION = 1000;
const JPEG_QUALITY = 0.65;
const MAX_BYTES = 880_000; // stay under the server/Firestore limit

// Opens the camera (or gallery), compresses the photo client-side and
// hands a JPEG data URL to onSubmit.
export default function PhotoCapture({ disabled, submitted, onSubmit, buttonLabel }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function compress(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

        let quality = JPEG_QUALITY;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > MAX_BYTES && quality > 0.25) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        if (dataUrl.length > MAX_BYTES) {
          reject(new Error('Photo trop lourde même compressée. Réessaie.'));
        } else {
          resolve(dataUrl);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Impossible de lire la photo.'));
      };
      img.src = url;
    });
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const dataUrl = await compress(file);
      setPreview(dataUrl);
    } catch (err) {
      setError(err.message || 'Erreur photo.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSend() {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(preview);
      setPreview(null);
    } catch (err) {
      setError(err.message || 'Envoi impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="photo-capture">
      <input
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleFile}
        ref={inputRef}
        type="file"
      />

      {preview ? (
        <>
          <img alt="Aperçu" className="photo-preview" src={preview} />
          <div className="btn-group">
            <button className="btn btn-primary" disabled={busy} onClick={handleSend} type="button">
              {busy ? 'Envoi…' : 'Envoyer cette photo'}
            </button>
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => setPreview(null)}
              type="button"
            >
              Reprendre
            </button>
          </div>
        </>
      ) : (
        <button
          className="btn btn-primary btn-camera"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          {busy
            ? 'Traitement…'
            : submitted
              ? '📷 Remplacer la photo'
              : buttonLabel || '📷 Prendre une photo'}
        </button>
      )}

      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
