// utilitaires.js (à inclure avant script.js)
async function loadAlignment(reciterFile) {
    const res = await fetch(`align/${reciterFile}`);
    if (!res.ok) throw new Error(`Cannot load align/${reciterFile}`);
    return await res.json();
  }