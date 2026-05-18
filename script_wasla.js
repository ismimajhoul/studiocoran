let shouldSpeakCount = false;
// 1) Chargement unique des données d'alignement
let alignmentData = null;
loadAlignment('Alafasy_128kbps.json')
  .then(data => alignmentData = data)
  .catch(err => console.error('Align load error:', err));

// 2) Option A: obtenir l'URL MP3 via l'API AlQuran Cloud
async function getVerseAudioUrl(sura, aya) {
  const res  = await fetch(`https://api.alquran.cloud/v1/ayah/${sura}:${aya}/ar.alafasy`);
  if (!res.ok) throw new Error(`API AlQuran Cloud HTTP ${res.status}`);
  const json = await res.json();
  return json.data.audio;  // URL du MP3 retourné
}

// 3) Option B: construire l'URL via le CDN islamic.network
function buildVerseAudioCdnUrl(sura, aya) {
  const s3 = String(sura).padStart(3, '0');
  const a3 = String(aya).padStart(3, '0');
  return `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${s3}${a3}.mp3`;
}


/**
 * Charge la page, applique la règle, injecte le rendu et active l’audio.
 * @param {string} ruleId      Identifiant de la règle
 * @param {boolean} useOptionA true = AlQuran Cloud, false = CDN islamic.network
 */
async function loadPageWithButton(ruleId, useOptionA = true) {
  const pageNumber = Number(document.getElementById('pageNumberInput').value);
  if (!pageNumber) { alert('Veuillez entrer un numéro de page'); return; }

  const ruleDetails = buttonRuleFunctions[ruleId];
  if (!ruleDetails) { console.error(`Pas de règle pour ${ruleId}`); return; }

  try {
    const verses = await getPageVerses(pageNumber);
    resetDisplay();              // vide #quranContent et compteurs
    renderPageTitle(pageNumber); // injecte “Page : X”

    let totalHits = 0;
    const container = document.getElementById('quranContent');

    for (const verse of verses) {
      const hits = ruleDetails.function(verse.text);
      totalHits += hits.length;
      const vDiv = renderVerseWithHighlight(verse, hits);
      container.appendChild(vDiv);
    }

    updateCounters(ruleDetails, totalHits);
    bindAudioOnOverlay(useOptionA);
    bindSpeechOnOverlay();

    // Une seule prise de parole : annonce + résultat dans la même phrase.
    // (Pas de chevauchement possible puisqu'on n'a qu'un seul speakText.)
    const phrase =
      `البحث عن ${ruleDetails.arabicName} صفحة ${toArabicDigits(pageNumber)}. ` +
      formatCountSpeech(ruleDetails.arabicName, totalHits);
    speakText(phrase);
  }
  catch (err) {
    console.error('Erreur loadPageWithButton :', err);
  }
}

/**
 * 1) Découpe le texte en « mots » et renvoie
 *    un tableau d’offsets { start, length }.
 */
function computeOffsets(text) {
  const words = text.trim().split(/\s+/);
  let cursor = 0;
  return words.map(w => {
    const start = text.indexOf(w, cursor);
    cursor = start + w.length;
    return { start, length: w.length };
  });
}

/**
 * 2) À partir des hits bruts [{index,length,style},…]
 *    calcule pour chacun son mot de début (ws) et de fin (we).
 */
function enrichHits(hits, offsets) {
  return hits.map(h => {
    const ws = offsets.findIndex(o =>
      h.index >= o.start && h.index < o.start + o.length
    );
    const lastChar = h.index + h.length - 1;
    const we = offsets.findIndex(o =>
      lastChar >= o.start && lastChar < o.start + o.length
    );
    return { ...h, ws, we };
  });
}

/**
 * 3) Regroupe les hits qui tombent sur le même mot
 *    ou deux mots consécutifs.
 */
function groupHitInfos(hitInfos) {
  const groups = [];
  for (const h of hitInfos) {
    const prev = groups[groups.length - 1];
    if (!prev || h.ws > prev.endWordIdx + 1) {
      groups.push({ startWordIdx: h.ws, endWordIdx: h.we, hits: [h] });
    } else {
      prev.endWordIdx = Math.max(prev.endWordIdx, h.we);
      prev.hits.push(h);
    }
  }
  return groups;
}

/**
 * 4) Dans un « chunk » (séquence de caractères déjà extraits),
 *    injecte de droite à gauche les <span class="tajweed-letter">
 *    uniquement autour des index/length fournis.
 *
 *    baseIndex = position de début du chunk dans le verset complet.
 */
function wrapTajweedLetters(chunk, hits, baseIndex) {
  let s = chunk;
  // tri descendant pour ne pas casser les offsets
  hits
    .sort((a, b) => (b.index - baseIndex) - (a.index - baseIndex))
    .forEach(h => {
      const localI = h.index - baseIndex;
      const localJ = localI + h.length;
      const speechAttr = h.speech ? ` data-speech="${h.speech}"` : '';
      s = s.slice(0, localI)
        + `<span class="tajweed-letter"${speechAttr} style="color:${h.style.color};">`
        + s.slice(localI, localJ)
        + `</span>`
        + s.slice(localJ);
    });
  return s;
}

/**
 * 5) Plaque le voile+loupe (.tajweed-overlay) autour
 *    de tout le(s) mot(s) du groupe, en réinjectant
 *    d’abord wrapTajweedLetters() dans chaque « chunk ».
 */
function applyOverlay(text, verse, groups, offsets) {
  let result = text;

  // ordre descendant pour ne pas invalider les indexes
  groups
    .sort((a, b) => b.startWordIdx - a.startWordIdx)
    .forEach(grp => {
      const startChar = offsets[grp.startWordIdx].start;
      const endChar   = offsets[grp.endWordIdx].start
                      + offsets[grp.endWordIdx].length;

      const before = result.slice(0, startChar);
      const chunk  = result.slice(startChar, endChar);
      const after  = result.slice(endChar);

      // on colorie d’abord uniquement les lettres « tajweed »
      const inner = wrapTajweedLetters(chunk, grp.hits, startChar);

      // puis on plaque le voile+loupe sur tout le(s) mot(s)
      const overlayed =
        `<span class="tajweed-overlay"`
      + ` data-sura="${verse.sura}"`
      + ` data-aya="${verse.aya}"`
      + ` data-word-start="${grp.startWordIdx}"`
      + ` data-word-end="${grp.endWordIdx}">`
      +   inner
      + `</span>`;

      result = before + overlayed + after;
    });

  return result;
}

/**
 * 6) Refonte de renderVerseWithHighlight en 6 lignes claires.
 *
 * @param {{sura:number, aya:number, text:string}} verse
 * @param {{index:number,length:number,style:{color:string}}[]} hits
 * @returns {HTMLDivElement}
 */
function renderVerseWithHighlight(verse, hits) {
  const text    = verse.text;
  const offsets = computeOffsets(text);
  const hitInfos= enrichHits(hits, offsets);
  const groups  = groupHitInfos(hitInfos);
  const html    = applyOverlay(text, verse, groups, offsets);

  const vDiv = document.createElement('div');
  vDiv.className = 'verse';
  vDiv.appendChild(
    document.createTextNode(`Sura : ${verse.sura}, Aya : ${verse.aya}, `)
  );
  vDiv.innerHTML += html;
  return vDiv;
}

/**
 * Lie le click sur chaque .tajweed-overlay pour jouer
 * soit le segment audio mot-à-mot, soit tout le verset en fallback.
 */
function bindAudioOnOverlay(useOptionA = true) {
  document.querySelectorAll('.tajweed-overlay').forEach(span => {
    span.onclick = async () => {
      if (window._currentQuranAudio) {
        clearTimeout(window._currentQuranAudio._pauseTimer);
        window._currentQuranAudio.pause();
        window._currentQuranAudio = null;
      }
      const sura = +span.dataset.sura;
      const aya  = +span.dataset.aya;
      const ws   = +span.dataset.wordStart;
      const we   = +span.dataset.wordEnd;

      if (!alignmentData) { console.warn('Alignment non chargé'); return; }
      const va = alignmentData.find(v => v.surah===sura && v.ayah===aya);
      if (!va) { console.warn('Pas d’alignement pour',sura,aya); return; }

      const segStart = va.segments.find(s => ws >= s[0] && ws < s[1]);
      const segEnd   = va.segments.find(s => we >= s[0] && we < s[1]);
      const audioUrl = useOptionA
        ? await getVerseAudioUrl(sura, aya)
        : buildVerseAudioCdnUrl(sura, aya);

      // fallback : tout le verset
      if (!segStart || !segEnd) {
        const a = new Audio(audioUrl);
        window._currentQuranAudio = a;
        a.play().catch(console.error);
        return;
      }

      const startMs = segStart[2], endMs = segEnd[3];
      const a = new Audio(audioUrl);
      window._currentQuranAudio = a;
      a.currentTime = startMs/1000;
      a.play().catch(console.error);
      a._pauseTimer = setTimeout(() => {
        a.pause();
        window._currentQuranAudio = null;
      }, endMs - startMs);
    };
  });
}


// — Énoncé arabe des lettres de l'occurrence (clic droit sur .tajweed-overlay) —

const TANWIN_NAMES = {
  'ً': 'تنوين بالفتح',  // ً Fathatan
  'ٌ': 'تنوين بالضم',   // ٌ Dammatan
  'ٍ': 'تنوين بالكسر',  // ٍ Kasratan
};

// Noms complets des lettres : la TTS arabe avale les lettres isolées,
// il faut donc lui donner le nom prononçable.
const LETTER_NAMES = {
  'ا': 'ألف', 'ب': 'باء', 'ت': 'تاء', 'ث': 'ثاء', 'ج': 'جيم',
  'ح': 'حاء', 'خ': 'خاء', 'د': 'دال', 'ذ': 'ذال', 'ر': 'راء',
  'ز': 'زاي', 'س': 'سين', 'ش': 'شين', 'ص': 'صاد', 'ض': 'ضاد',
  'ط': 'طاء', 'ظ': 'ظاء', 'ع': 'عين', 'غ': 'غين', 'ف': 'فاء',
  'ق': 'قاف', 'ك': 'كاف', 'ل': 'لام', 'م': 'ميم', 'ن': 'نون',
  'ه': 'هاء', 'و': 'واو', 'ي': 'ياء',
  'ء': 'همزة', 'أ': 'همزة', 'إ': 'همزة', 'ؤ': 'همزة', 'ئ': 'همزة',
  'ى': 'ألف مقصورة', 'ة': 'تاء مربوطة', 'ٱ': 'ألف الوصل',
};
const letterName = (ch) => LETTER_NAMES[ch] || ch;

function isArabicLetter(ch) {
  const c = ch.charCodeAt(0);
  return (c >= 0x0621 && c <= 0x064A) || c === 0x0671;
}
function isDiacritic(ch) {
  const c = ch.charCodeAt(0);
  return (c >= 0x064B && c <= 0x065F) || c === 0x0670 || (c >= 0x06D6 && c <= 0x06ED);
}
function isTanwin(ch) { return /[ً-ٍ]/.test(ch); }
function isSukun(ch)  { return ch === 'ْ'; }
function isShadda(ch) { return ch === 'ّ'; }
function isMadda(ch)  { return ch === 'ٓ'; }

/**
 * Découpe la chaîne coloriée en jetons :
 *  - { kind:'letter', letter, marks:[diacritiques] }
 *  - { kind:'tanwin', mark }  (tanwin isolé, ex. après élision)
 */
function tokenizeChunk(chunk) {
  const tokens = [];
  let i = 0;
  while (i < chunk.length) {
    const ch = chunk[i];
    if (isArabicLetter(ch)) {
      const marks = [];
      let j = i + 1;
      while (j < chunk.length && isDiacritic(chunk[j])) { marks.push(chunk[j]); j++; }
      tokens.push({ kind: 'letter', letter: ch, marks });
      i = j;
    } else if (isTanwin(ch)) {
      tokens.push({ kind: 'tanwin', mark: ch });
      i++;
    } else {
      i++;
    }
  }
  return tokens;
}

function describeToken(tok, isFirst) {
  if (tok.kind === 'tanwin') return TANWIN_NAMES[tok.mark] || 'تنوين';
  const L = letterName(tok.letter);
  const prefix = isFirst ? '' : 'حرف ';
  if (tok.marks.some(isShadda)) return `${prefix}${L} مشددة`;
  if (tok.marks.some(isSukun))  return `${prefix}${L} ساكنة`;
  if (tok.marks.some(isMadda))  return `${prefix}${L} ممدودة`;
  const tn = tok.marks.find(isTanwin);
  if (tn) return `${prefix}${L} ${TANWIN_NAMES[tn]}`;
  return `${prefix}${L}`;
}

function describeOccurrence(chunk) {
  const tokens = tokenizeChunk(chunk);
  if (!tokens.length) return '';
  return tokens.map((t, idx) => describeToken(t, idx === 0)).join(' و بعده ');
}

function bindSpeechOnOverlay() {
  document.querySelectorAll('.tajweed-overlay').forEach(span => {
    span.oncontextmenu = (e) => {
      e.preventDefault();
      // stoppe audio en cours
      if (window._currentQuranAudio) {
        clearTimeout(window._currentQuranAudio._pauseTimer);
        window._currentQuranAudio.pause();
        window._currentQuranAudio = null;
      }
      // stoppe énoncé précédent
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();

      // Si le clic vise une lettre coloriée précise, décrire UNIQUEMENT celle-ci.
      // Si la règle a fourni une phrase spécifique (data-speech), on l'utilise ;
      // sinon, on tombe sur le descripteur générique.
      const targetLetter = e.target.closest('.tajweed-letter');
      let phrase;
      if (targetLetter && targetLetter.dataset.speech) {
        phrase = targetLetter.dataset.speech;
      } else if (targetLetter) {
        phrase = describeOccurrence(targetLetter.textContent);
      } else {
        const chunk = [...span.querySelectorAll('.tajweed-letter')]
                        .map(s => s.textContent).join('');
        phrase = describeOccurrence(chunk);
      }
      if (phrase) speakText(phrase);
    };
  });
}


/**
 * Met à jour les compteurs et, si demandé, joue en audio
 * le nombre d’occurrences pour la règle en arabe (une seule fois).
 *
 * @param {{ frenchName:string, arabicName:string }} ruleDetails
 * @param {number} totalHits
 */
// Formule l'annonce des résultats avec les formes arabes correctes de comptage.
//   0       → لم نجد [règle] في هذه الصفحة
//   1       → وجدنا [règle] مرة واحدة
//   2       → وجدنا [règle] مرتين
//   3 à 10  → وجدنا [règle] N مرات   (pluriel court)
//   11+     → وجدنا [règle] N مرة    (pluriel long, singulier)
function formatCountSpeech(arabicName, n) {
  if (n === 0)              return `لم نجد ${arabicName} في هذه الصفحة`;
  if (n === 1)              return `وجدنا ${arabicName} مرة واحدة`;
  if (n === 2)              return `وجدنا ${arabicName} مرتين`;
  if (n >= 3 && n <= 10)    return `وجدنا ${arabicName} ${toArabicDigits(n)} مرات`;
  return                         `وجدنا ${arabicName} ${toArabicDigits(n)} مرة`;
}

function updateCounters(ruleDetails, totalHits) {
  // Affichage des compteurs uniquement. La voix est désormais centralisée
  // dans loadPageWithButton qui fait une seule prise de parole combinant
  // « annonce de recherche » + « résultat ».
  document.getElementById('frenchCount').textContent = `${ruleDetails.frenchName}: ${totalHits}`;
  document.getElementById('arabicCount').textContent = ruleDetails.arabicName;
}


// — Helpers —

function resetDisplay() {
  document.getElementById('quranContent').innerHTML    = '';
  document.getElementById('frenchCount').textContent   = '';
  document.getElementById('arabicCount').textContent   = '';
}

function renderPageTitle(pageNumber) {
  const hdr = document.createElement('div');
  hdr.textContent = `Page : ${pageNumber}`;
  document.getElementById('quranContent').appendChild(hdr);
}





async function playOverlayAudio(el, useOptionA) {
  // stoppe ancien
  if (window._currentQuranAudio) {
    clearTimeout(window._currentQuranAudio._pauseTimer);
    window._currentQuranAudio.pause();
    window._currentQuranAudio = null;
  }

  const sura = +el.dataset.sura;
  const aya  = +el.dataset.aya;
  const wi   = +el.dataset.wordStart; // on lit début du groupe

  // récupère URL
  const audioUrl = useOptionA
    ? await getVerseAudioUrl(sura, aya)
    : buildVerseAudioCdnUrl(sura, aya);

  // play
  const audio = new Audio(audioUrl);
  window._currentQuranAudio = audio;

  // si alignment dispo, joue segment
  const va = alignmentData.find(v=>v.surah===sura&&v.ayah===aya);
  if (va) {
    const seg = va.segments.find(s => wi>=s[0]&&wi<s[1]);
    if (seg) {
      const [ , , startMs, endMs ] = seg;
      audio.currentTime = startMs/1000;
      await audio.play().catch(()=>{/* ignorer AbortError */});
      audio._pauseTimer = setTimeout(()=>{
        audio.pause();
        window._currentQuranAudio = null;
      }, endMs - startMs);
      return;
    }
  }

  // fallback : joue tout
  await audio.play().catch(()=>{});
}

// Exemples d’appel restés inchangés :
// loadPageWithButton('kalkala', true);
// loadPageWithButton('kalkala', false);




const buttonRuleFunctions = {
  'silatuKubra': {
    function: applySilatuKubraRule,
    frenchName: 'Al-mad aç-çila koubrâ',
    arabicName: 'الصلة الكبرى'
  },
  'waqfSoukoun': {
    function: applyWaqfSoukounRule,
    frenchName: 'Al-mad al-aridou as-soukoûn',
    arabicName: 'العارض للسكون'
  },
  // Ajoutez d'autres correspondances si nécessaire
  'silatuSura': {
    function: applySilatuSuraRule,
    frenchName: 'Al-mad aç-çila çoughrâ',
    arabicName: 'الصلة الصغرى'
  },
  'iwad': {
    function: applyMadIwadRule,
    frenchName: 'Al-mad al-iwad',
    arabicName: 'ٱلْمَدُّ ٱلْعِوَض'
  },
  'badal': {
    function: applyMadBadalRule,
    frenchName: 'Al-mad al-badal',
    arabicName: 'المد البدل'
  },
  'asli': {
    function: applyMadAsliRule,
    frenchName: 'Al-mad at-taby’y',
    arabicName: 'المدالطبيعي'
  },
  'kalkala': {
    function: findKalkalaInVerse,
    frenchName: 'Al-qalqala',
    arabicName: 'القلقلة'
  },
  'ikhfa': {
    function: applyIkhfaRule,
    frenchName: 'Ikhfa',
    arabicName: 'إخفاء'
  },
  'idghamGhouna': {
    function: applyIdghamGhounaRule,
    frenchName: 'Idgham ghouna',
    arabicName: 'الادغام بغنة'
  },
  'idghamNoGhouna': {
    function: applyIdghamNoGhounaRule,
    frenchName: 'Idgham sans ghouna',
    arabicName: 'الإدغام بغير غنة'
  },
  'izhar': {
    function: applyIzharRule,
    frenchName: 'Izhar',
    arabicName: 'إظهار'
  },
  'iqlab': {
    function: applyIqlabRule,
    frenchName: 'Iqlab',
    arabicName: 'الاقلب'
  },
  'nounshedda': {
    function: applyNounSheddaRule,
    frenchName: 'Noun mousheddada',
    arabicName: 'النون المشددة'
  },
  'idghamShafawi': {
    function: applyIdghamShafawiRule,
    frenchName: 'Idgham shafawi',
    arabicName: 'إِدْغام شَفَوِيّ'
  },
  'izharShafawi': {
    function: applyIzharShafawiRule,
    frenchName: 'Izhar shafawi',
    arabicName: 'إِظْهار شَفَوِيّ'
  },
  'ikhfaShafawi': {
    function: applyIkhfaShafawiRule,
    frenchName: 'Ikhfa shafawi',
    arabicName: 'إِخْفاء شَفَوِيّ'
  },
  'mimshedda': {
    function: applyMimSheddaRule,
    frenchName: 'mim mousheddada',
    arabicName: 'المَّ المشددة'
  },
  'lamshamsi': {
    function: applyLamShamsiRule,
    frenchName: 'lam solaires',
    arabicName: 'اللام الشمسية'
  },
  'lamqamari': {
    function: applyLamQamariRule,
    frenchName: 'lam lunaires',
    arabicName: 'اللام القمرية'
  },
  'mouttasil': {
    function: applyMouttasil,
    frenchName: 'mad mouttasil',
    arabicName: 'المد المتصل'
  },
  'mounfasil': {
    function: applyMounfasil,
    frenchName: 'mad mounfasil',
    arabicName: 'المد المنفصل'
  },
  'liin': {
    function: applyLiin,
    frenchName: 'mad liin à compléter',
    arabicName: 'المد اللين لاستكمال'
  },
  'laazim_k_tha': {
    function: applyLaazim_K_Thaqqal,
    frenchName: 'mad laazim kalami mouthaqqal',
    arabicName: 'المد اللازم الكلمي المثقل'
  },
  'laazim_k_kha': {
    function: applyLaazim_K_Khaffaf,
    frenchName: 'mad laazim kalami moukhaffaf',
    arabicName: 'المد اللازم الكلمي المخفف'
  },
  'laazim_h_tha': {
    function: applyLaazim_H_Thaqqal,
    frenchName: 'mad laazim harfi mouthaqqal',
    arabicName: 'المد اللازم الحرفي المثقل'
  },
  'laazim_h_kha': {
    function: applyLaazim_H_Khaffaf,
    frenchName: 'mad laazim harfi moukhaffaf',
    arabicName: 'المد اللازم الحرفي المخفف'
  },
};

// ————————————————————————————————————————————————————————————
//  Sélection de la meilleure voix arabe (auto + override manuel)
// ————————————————————————————————————————————————————————————

let _autoArabicVoice = null;

function _scoreArabicVoice(v) {
  const n = (v.name || '').toLowerCase();
  const lang = (v.lang || '').toLowerCase();
  let s = 0;
  // Qualité de synthèse
  if (n.includes('natural') || n.includes('neural')) s += 100;
  if (n.includes('online'))                          s += 30;
  if (n.includes('desktop'))                         s -= 10;
  if (n.includes('espeak'))                          s -= 50;
  // Voix féminines connues (Salma, Zariyah, Hoda, Amina, Laila, Noura…)
  const female = ['female','hoda','salma','zariyah','amina','noura','laila','nadia','rana','sara'];
  if (female.some(k => n.includes(k))) s += 25;
  // Préférence légère ar-SA puis ar-EG
  if (lang === 'ar-sa') s += 5;
  if (lang === 'ar-eg') s += 3;
  return s;
}

function _refreshArabicVoiceList() {
  if (!('speechSynthesis' in window)) return;
  const arVoices = window.speechSynthesis.getVoices()
                    .filter(v => v.lang && v.lang.toLowerCase().startsWith('ar'))
                    .sort((a, b) => _scoreArabicVoice(b) - _scoreArabicVoice(a));
  _autoArabicVoice = arVoices[0] || null;

  if (arVoices.length) {
    console.log('Voix arabe locale auto :', _autoArabicVoice.name, `(${_autoArabicVoice.lang})`);
    console.log('Voix arabes locales :', arVoices.map(v => `${v.name} (${v.lang})`));
  } else {
    console.warn('Aucune voix arabe locale installée. Google TTS sera utilisé par défaut.');
  }

  // (Re)peuple le <select> avec :
  //   1. Google TTS (en ligne, qualité Android)  — sélectionné par défaut
  //   2. Voix locale auto
  //   3. Toutes les voix locales arabes
  const sel = document.getElementById('voiceSelect');
  if (sel) {
    const previous = sel.value || '__google__';
    sel.innerHTML = '';
    sel.appendChild(new Option('🌐 Google TTS (en ligne, féminine)', '__google__'));
    sel.appendChild(new Option('— Voix locale auto —', '__local_auto__'));
    arVoices.forEach(v => sel.appendChild(new Option(`${v.name} (${v.lang})`, v.name)));
    sel.value = previous;
    if (!sel.value) sel.value = '__google__';
  }
}

function pickLocalArabicVoice(nameOrEmpty) {
  if (!('speechSynthesis' in window)) return null;
  if (nameOrEmpty && nameOrEmpty !== '__local_auto__') {
    const v = window.speechSynthesis.getVoices().find(x => x.name === nameOrEmpty);
    if (v) return v;
  }
  if (!_autoArabicVoice) _refreshArabicVoiceList();
  return _autoArabicVoice;
}

if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = _refreshArabicVoiceList;
  _refreshArabicVoiceList();
}

// ————————————————————————————————————————————————————————————
//  Énoncé : Google TTS (en ligne) avec repli sur voix locale
// ————————————————————————————————————————————————————————————

function _stopAllSpeech() {
  if (window._currentTTSAudio) {
    try { window._currentTTSAudio.pause(); } catch (_) {}
    window._currentTTSAudio = null;
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

function _splitForTTS(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const words = text.split(/\s+/);
  const segs = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxLen) { if (cur) segs.push(cur); cur = w; }
    else cur = next;
  }
  if (cur) segs.push(cur);
  return segs;
}

function _speakWithGoogle(text, onFail, onDone) {
  const segments = _splitForTTS(text, 180);
  let i = 0;
  let failed = false;       // si la séquence a échoué → repli local
  let alreadyPlaying = false; // si au moins un segment a effectivement commencé
  const playNext = () => {
    if (failed) return;
    if (i >= segments.length) { window._currentTTSAudio = null; onDone && onDone(); return; }
    // Proxy local PHP : récupère le MP3 chez Google avec les bons headers
    // et nous le renvoie en audio/mpeg (même origine, pas de CORS, pas de blocage).
    const url = `tts.php?lang=ar&text=${encodeURIComponent(segments[i])}`;
    const a = new Audio(url);
    window._currentTTSAudio = a;

    a.addEventListener('playing', () => {
      // Dès qu'un segment démarre vraiment, on considère que Google fonctionne.
      // Toute erreur ultérieure (qui pourrait à tort déclencher Naayf en parallèle)
      // est ignorée — on traite la fin comme une fin normale.
      alreadyPlaying = true;
      a.onerror = () => {
        if (failed) return;
        failed = true;
        window._currentTTSAudio = null;
        onDone && onDone();
      };
    }, { once: true });

    a.onended = () => { i++; playNext(); };

    a.onerror = () => {
      if (failed) return;
      failed = true;
      // Si Google jouait déjà, on n'enclenche PAS le repli (sinon double voix).
      if (alreadyPlaying) {
        window._currentTTSAudio = null;
        onDone && onDone();
        return;
      }
      console.warn('Google TTS échec → repli voix locale');
      try { a.pause(); a.src = ''; } catch (_) {}
      window._currentTTSAudio = null;
      onFail && onFail();
    };

    a.play().catch(() => {
      if (failed) return;
      failed = true;
      if (alreadyPlaying) {
        window._currentTTSAudio = null;
        onDone && onDone();
        return;
      }
      console.warn('Google TTS lecture impossible → repli voix locale');
      try { a.pause(); a.src = ''; } catch (_) {}
      window._currentTTSAudio = null;
      onFail && onFail();
    });
  };
  playNext();
}

function _speakLocal(text, voiceName, onDone) {
  if (!('speechSynthesis' in window)) { onDone && onDone(); return; }
  const utter = new SpeechSynthesisUtterance(text);
  const voice = pickLocalArabicVoice(voiceName);
  if (voice) { utter.voice = voice; utter.lang = voice.lang; }
  else { utter.lang = 'ar'; }
  utter.volume = 1;
  utter.rate   = 1;
  utter.pitch  = 1;
  utter.onend  = () => onDone && onDone();
  utter.onerror = () => onDone && onDone();
  window.speechSynthesis.speak(utter);
}

// Convertit un nombre (ex: 20) en chiffres arabo-indiens (٢٠) pour que la TTS
// arabe le prononce naturellement comme un nombre arabe.
function toArabicDigits(n) {
  const a = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  return String(n).replace(/\d/g, d => a[+d]);
}

// speakText renvoie une Promise qui se résout quand la lecture est terminée.
// On utilise Google TTS via le proxy tts.php (voix féminine, qualité Android).
// PAS de repli automatique sur Web Speech : si Google plante, on ne dit rien
// plutôt que de risquer une double voix avec Naayf. La Promise se résout quand
// même pour ne pas bloquer le await dans loadPageWithButton.
function speakText(arabicText) {
  console.log('speakText :', arabicText);

  return new Promise((resolve) => {
    // Stop tout audio TTS en cours
    if (window._currentTTSAudio) {
      try { window._currentTTSAudio.pause(); } catch (_) {}
      window._currentTTSAudio = null;
    }
    // Stop aussi Web Speech au cas où (résidu, autre extension…)
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

    // Découpe en segments si > 180 caractères (limite Google translate_tts)
    const segments = _splitForTTS(arabicText, 180);
    let i = 0;
    let aborted = false;
    const playNext = () => {
      if (aborted) return;
      if (i >= segments.length) {
        window._currentTTSAudio = null;
        resolve();
        return;
      }
      const url = `tts.php?lang=ar&text=${encodeURIComponent(segments[i])}`;
      const a = new Audio(url);
      window._currentTTSAudio = a;
      // Tue de force l'audio pour qu'il ne puisse plus jouer plus tard
      // (Chrome peut décider de relancer un play après un échec apparent).
      const kill = () => {
        try { a.pause(); a.src = ''; a.removeAttribute('src'); a.load(); } catch (_) {}
      };
      a.onended = () => { if (!aborted) { i++; playNext(); } };
      a.onerror = () => {
        if (aborted) return;
        aborted = true;
        kill();
        console.warn('Google TTS onerror — annonce coupée');
        window._currentTTSAudio = null;
        resolve();
      };
      a.play().catch(() => {
        if (aborted) return;
        aborted = true;
        kill();
        console.warn('Google TTS play().catch — annonce coupée');
        window._currentTTSAudio = null;
        resolve();
      });
    };
    playNext();
  });
}

function search() {
  const searchValue = document.getElementById('searchInput').value;
  const tajweedContent = document.getElementById('quranContent');
  const frenchOccurrences = document.getElementById('frenchCount');
  const arabicOccurrences = document.getElementById('arabicCount');

  if (!searchValue) {
      alert('Veuillez entrer un mot à rechercher');
      return;
  }

  fetch(`https://bahi99.alwaysdata.net/search.php?word=${encodeURIComponent(searchValue)}`)
      .then(response => response.json())
      .then(data => {
          const results = data.verses;
          const regex = new RegExp(searchValue, 'gi');
          
          // Clear the previous count
          frenchOccurrences.innerHTML = '';
          arabicOccurrences.innerHTML = '';

          tajweedContent.innerHTML = '';

          let count = 0;
          results.forEach((result) => {
              for(let i = 0; i < result.text.length; i++) {
                console.log('Current letter: ', result.text[i], ', Unicode: ', result.text[i].charCodeAt(0).toString(16));
              }
              const verseDiv = document.createElement('div');
              // Highlight the search term in the result text
              const highlightedText = result.text.replace(regex, (match) => {
                count++;
                return `<span class="highlight">${match}</span>`;
              });
              verseDiv.innerHTML = `Sura : ${result.sura}, Aya : ${result.aya}, ${highlightedText}`;
              tajweedContent.appendChild(verseDiv);
          });

          frenchOccurrences.innerHTML = `occurrence(s): ${count}`;
          arabicOccurrences.innerHTML = `عدد: ${count}`;

      })
      .catch((error) => {
          console.error('Une erreur s\'est produite lors de la récupération des données:', error);
      });
}

function highlightBasmala(sura, aya, text) {
  if (sura !== 9 && aya === 1) {
    const basmalaPattern = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"; // Basmala en arabe
    const highlightedBasmala = `<span style="color:red; font-weight:bold; font-size:60px;">${basmalaPattern}</span>`;
    return text.replace(basmalaPattern, highlightedBasmala);
  }
  return text;
}


function applyLaazim_H_Thaqqal(verse) {
  const result = [];
  const laazimColor = { color: '#FF5733', weight: 'bold', size: '50px' };

  // Le seul cas dans le Coran : ل (des fawātiḥ الٓم / الٓمٓر / الٓمٓص) suivi de م,
  // car la dernière lettre de "لام" (= م) s'assimile (إدغام) à la première de "ميم".
  // Pattern : ل + ٓ + م + ٓ
  for (let i = 0; i < verse.length - 3; i++) {
    if (verse.charCodeAt(i)     === 0x644   // ل
     && verse.charCodeAt(i + 1) === 0x653   // ٓ
     && verse.charCodeAt(i + 2) === 0x645   // م
     && verse.charCodeAt(i + 3) === 0x653)  // ٓ
    {
      result.push({
        index: i,
        length: 2,
        style: laazimColor,
        speech: 'إدغام ميم اللام في ميم الميم'
      });
    }
  }
  return result;
}

function applyLaazim_H_Khaffaf(verse) {
  const result = [];
  const laazimColor = { color: '#FF5733', weight: 'bold', size: '50px' };

  // Lettres de نقص عسلكم : ces 8 lettres reçoivent un mad lazim harfi (6 temps)
  // lorsqu'elles portent un maddah (ٓ) dans les fawātiḥ.
  // ن=0x646, ق=0x642, ص=0x635, ع=0x639, س=0x633, ل=0x644, ك=0x643, م=0x645
  const specialLetters = [0x646, 0x642, 0x635, 0x639, 0x633, 0x644, 0x643, 0x645];

  for (let i = 0; i < verse.length - 1; i++) {
    const c = verse.charCodeAt(i);
    const n = verse.charCodeAt(i + 1);
    if (!specialLetters.includes(c)) continue;
    if (n !== 0x653) continue;                  // pas de maddah → rien à faire

    // Exclure le cas مثقل (ل + ٓ + م + ٓ) qui est traité par applyLaazim_H_Thaqqal
    if (c === 0x644
     && verse.charCodeAt(i + 2) === 0x645
     && verse.charCodeAt(i + 3) === 0x653) {
      continue;
    }

    const name = LETTER_NAMES[verse[i]] || verse[i];
    result.push({
      index: i,
      length: 2,
      style: laazimColor,
      speech: `مد لازم حرفي مخفف على ال${name}`
    });
  }
  return result;
}


function applyLaazim_K_Thaqqal(verse) {
  const result = [];
  const laazimColor = { color: '#FF5733', weight: 'bold', size: '50px' };
  const words = verse.split(' ');

  const checkSequence = (word, wordIndex) => {
    const sequences = [
      [0x64e, 0x627, 0x653], // Fatha + Alif
      [0x650, 0x64a, 0x653], // Kasra + Ya
      [0x64f, 0x648, 0x653]  // Damma + Waw
    ];

    for (let index = 0; index <= word.length - sequences[0].length; index++) {
      console.log(`Vérification de l'index ${index} dans le mot "${word}" (0x${word.charCodeAt(index).toString(16)})`);

      for (const sequence of sequences) {
        if (sequence.every((charCode, seqIndex) => {
            return word.charCodeAt(index + seqIndex) === charCode;
          })) {

          const nextChar = word.charCodeAt(index + sequence.length);
          const nextNextChar = word.charCodeAt(index + sequence.length + 1);

          console.log(`Séquence trouvée à l'index ${index} dans le mot "${word}" :`, sequence.map(c => `0x${c.toString(16)}`).join(', '));
          console.log(`4ème caractère : ${String.fromCharCode(nextChar)} (code: 0x${nextChar.toString(16)})`);
          console.log(`5ème caractère : ${String.fromCharCode(nextNextChar)} (code: 0x${nextNextChar.toString(16)})`);

          if ((nextChar >= 0x621 && nextChar <= 0x64A) && (nextNextChar === 0x651)) {
            console.log(`Match complet trouvé à l'index ${index} dans le mot "${word}"`);
            const absoluteIndex = wordIndex + index;
            result.push({ index: absoluteIndex, length: sequence.length + 2, style: laazimColor });
          }
        }
      }
    }
  };

  let currentIndex = 0;
  for (const word of words) {
    checkSequence(word, currentIndex);
    currentIndex += word.length + 1; // +1 pour l'espace entre les mots
  }

  return result;
}

function applyLaazim_K_Khaffaf(verse) {
  const result = [];
  const laazimColor = { color: '#FF5733', weight: 'bold', size: '50px' };
  const words = verse.split(' ');

  const checkSequence = (word, wordIndex) => {
    const sequences = [
      [0x64e, 0x627, 0x653], // Fatha + Alif
      [0x650, 0x64a, 0x653], // Kasra + Ya
      [0x64f, 0x648, 0x653]  // Damma + Waw
    ];

    for (let index = 0; index <= word.length - sequences[0].length; index++) {
      console.log(`Vérification de l'index ${index} dans le mot "${word}" (0x${word.charCodeAt(index).toString(16)})`);

      for (const sequence of sequences) {
        if (sequence.every((charCode, seqIndex) => {
            return word.charCodeAt(index + seqIndex) === charCode;
          })) {

          const nextChar = word.charCodeAt(index + sequence.length);
          const nextNextChar = word.charCodeAt(index + sequence.length + 1);

          console.log(`Séquence trouvée à l'index ${index} dans le mot "${word}" :`, sequence.map(c => `0x${c.toString(16)}`).join(', '));
          console.log(`4ème caractère : ${String.fromCharCode(nextChar)} (code: 0x${nextChar.toString(16)})`);
          console.log(`5ème caractère : ${String.fromCharCode(nextNextChar)} (code: 0x${nextNextChar.toString(16)})`);

          if ((nextChar >= 0x621 && nextChar <= 0x64A) && (nextNextChar === 0x652)) {
            console.log(`Match complet trouvé à l'index ${index} dans le mot "${word}"`);
            const absoluteIndex = wordIndex + index;
            result.push({ index: absoluteIndex, length: sequence.length + 2, style: laazimColor });
          }
        }
      }
    }
  };

  let currentIndex = 0;
  for (const word of words) {
    checkSequence(word, currentIndex);
    currentIndex += word.length + 1; // +1 pour l'espace entre les mots
  }

  return result;
}



function applyLiin(verse) {
  const result = [];
  const liinColor = { color: '#3ADF00', weight: 'bold', size: '50px' };

  const words = verse.split(' ');

  let currentWordIndex = 0;

  for (let wordIndex = 0; wordIndex < words.length; wordIndex++) 
  {
    const word = words[wordIndex];
    
    // Chercher la dernière voyelle, en ignorant les caractères spéciaux à la fin du mot
    let lastVowelIndex = word.length - 1;
    while (lastVowelIndex >= 0 && ![0x64e, 0x650, 0x64f, 0x64C, 0x64d].includes(word.charCodeAt(lastVowelIndex))) {
      lastVowelIndex--;
    }

    if (lastVowelIndex < 0) {
      currentWordIndex += word.length + 1;
      continue;
    }

    for (let i = word.length - 1; i >= 5; i--) {
      if ([0x6ED, 0x6E6, 0x6E5].includes(word.charCodeAt(i))) continue;

      // Remplacer la condition par celle basée sur lastVowelIndex
      if (i === lastVowelIndex) {
        if (word.charCodeAt(i - 1) >= 0x621 && word.charCodeAt(i - 1) <= 0x64A) {
          if (word.charCodeAt(i - 2) === 0x652) {
            if ([0x648, 0x64A, 0x649].includes(word.charCodeAt(i - 3))) {
              if (word.charCodeAt(i - 4) === 0x64e) {
                if (wordIndex === words.length - 1 || word.charCodeAt(i - 3) === 0x649) {
                  result.push(
                    { index: currentWordIndex + i - 3, length: 1, style: liinColor }, // "ya" ou "waw" ou "alif maksura"
                    { index: currentWordIndex + i - 2, length: 1, style: liinColor }  // "soukoun"
                  );
                }
              }
            }
          }
        }
      }
    }

    currentWordIndex += word.length + 1;
  }
  result.length = result.length / 2;
  return result;
}



function applyMounfasil(verse) {
  const result = [];
  const mounfasilColor = { color: '#642EFE', weight: 'bold', size: '50px' }; // Vous pouvez modifier ces styles comme vous le souhaitez.

  // La fonction qui vérifie les caractères donnés en séquence
  const checkSequence = (index) => {
    const sequences = [
  [0x64e, 0x627, 0x653, 0x20, 0x621],
  [0x64e, 0x627, 0x653, 0x20, 0x623],
  [0x64e, 0x627, 0x653, 0x20, 0x625],
  [0x650, 0x649, 0x653, 0x20, 0x621],
  [0x650, 0x649, 0x653, 0x20, 0x623],
  [0x650, 0x649, 0x653, 0x20, 0x625],
  [0x64f, 0x648, 0x653, 0x627, 0x6df, 0x20, 0x621],
  [0x64f, 0x648, 0x653, 0x627, 0x6df, 0x20, 0x623],
  [0x64f, 0x648, 0x653, 0x627, 0x6df, 0x20, 0x625],
  [0x64f, 0x648, 0x653, 0x627, 0x6df, 0x20, 0x621],
  [0x64f, 0x648, 0x653, 0x627, 0x6df, 0x20, 0x623],
  [0x64f, 0x648, 0x653, 0x627, 0x6df, 0x20, 0x625],
  [0x64E, 0x640, 0x670, 0x653, 0x623],
  [0x64E, 0x649, 0x670, 0x653, 0x20,0x623],
  [0x64E, 0x649, 0x670, 0x653, 0x20,0x625],
  [0x64E, 0x640, 0x670, 0x653, 0x624],
  [0x64A, 0x64E, 0x640, 0x670, 0x653,0x640,0x654],
     ];

    for (const sequence of sequences) {
      if (sequence.every((charCode, seqIndex) => {
        return verse.charCodeAt(index - (sequence.length - 1) + seqIndex) === charCode;
      })) {
        return sequence.length; // Retourne la longueur de la séquence correspondante
      }
    }
    return 0; // Retourne 0 si aucune correspondance n'est trouvée
  };

  for (let i = verse.length - 1; i >= 0; i--) 
  {
    const length = checkSequence(i);
    if (length > 0) 
    {
      result.push({ index: i - (length - 1), length: length, style: mounfasilColor });
    }
  }
  return result;
}


function applyMouttasil(verse) {
  const result = [];
  const mouttasilColor = { color: '#DF3A01', weight: 'bold', size: '50px' };

// La fonction qui vérifie les caractères de fatha, damma, kasra, tanwin in, tanwin oun, soukoun
const checkFathaDammaKasra = charCode =>
charCode === 0x64E || charCode === 0x64F || charCode === 0x650 || charCode === 0x652 || charCode === 0x64D || charCode === 0x64C;

  for (let i = 4; i < verse.length; i++) 
  {
    const charCode = verse.charCodeAt(i);

    // Scénario 1
    if (charCode === 0x621 &&
      (checkFathaDammaKasra(verse.charCodeAt(i + 1)) || verse.charCodeAt(i + 1) === 0x64B) &&
      verse.charCodeAt(i - 1) === 0x653 &&
      (verse.charCodeAt(i - 2) === 0x627 || verse.charCodeAt(i - 2) === 0x648 || verse.charCodeAt(i - 2) === 0x64A || verse.charCodeAt(i - 2) === 0x670) &&
      checkFathaDammaKasra(verse.charCodeAt(i - 3))) {
    result.push({ index: i - 3, length: 4, style: mouttasilColor });
    }
    else if // Scénario 2
    (charCode === 0x654 && checkFathaDammaKasra(verse.charCodeAt(i + 1)) &&
        verse.charCodeAt(i - 1) === 0x640 && verse.charCodeAt(i - 2) === 0x653 &&
        (verse.charCodeAt(i - 3) === 0x627 || verse.charCodeAt(i - 3) === 0x648 || verse.charCodeAt(i - 3) === 0x64A) &&
        checkFathaDammaKasra(verse.charCodeAt(i - 4))) {
      result.push({ index: i - 4, length: 5, style: mouttasilColor });
    }
    // Scénario 3
    else if (charCode === 0x626 && checkFathaDammaKasra(verse.charCodeAt(i + 1)) &&
        verse.charCodeAt(i - 1) === 0x653 && verse.charCodeAt(i - 2) === 0x670 && verse.charCodeAt(i - 3) === 0x640 &&
        checkFathaDammaKasra(verse.charCodeAt(i - 4))) {
      result.push({ index: i - 4, length: 5, style: mouttasilColor });
    }
    // Scénario 4
    else if (charCode === 0x654 && checkFathaDammaKasra(verse.charCodeAt(i + 1)) &&
        verse.charCodeAt(i - 1) === 0x640 && verse.charCodeAt(i - 2) === 0x653 && verse.charCodeAt(i - 3) === 0x6E5 &&
        (verse.charCodeAt(i - 4) === 0x627 || verse.charCodeAt(i - 4) === 0x648 || verse.charCodeAt(i - 4) === 0x64A) &&
        checkFathaDammaKasra(verse.charCodeAt(i - 5))) {
      result.push({ index: i - 5, length: 6, style: mouttasilColor });
    }
    // Scénario 5
    else if (charCode === 0x654 && checkFathaDammaKasra(verse.charCodeAt(i + 1)) &&
        verse.charCodeAt(i - 1) === 0x640 && verse.charCodeAt(i - 2) === 0x653 && verse.charCodeAt(i - 3) === 0x6E6 &&
        (verse.charCodeAt(i - 4) === 0x627 || verse.charCodeAt(i - 4) === 0x648 || verse.charCodeAt(i - 4) === 0x64A) &&
        checkFathaDammaKasra(verse.charCodeAt(i - 5))) {
      result.push({ index: i - 5, length: 6, style: mouttasilColor });
    }
    // Scénario 6
    else if (charCode === 0x626 && verse.charCodeAt(i - 1) === 0x653 && verse.charCodeAt(i - 2) === 0x627) {
      result.push({ index: i - 2, length: 3, style: mouttasilColor });
    }
    // Scénario 7
    else if (charCode === 0x654 && verse.charCodeAt(i - 1) === 0x640 && verse.charCodeAt(i - 2) === 0x653 && verse.charCodeAt(i - 3) === 0x64a && verse.charCodeAt(i - 4) === 0x650) {
      result.push({ index: i - 4, length: 5, style: mouttasilColor });
    }
  }

  return result;
}



function applyWaqfSoukounRule(verse) {
  const result = [];
  const waqfColor = { color: '#DF3A01', weight: 'bold', size: '50px' };

  // Dernière position dans le verset
  let pos = verse.length - 1;

  // Cas des caractères spéciaux à la fin du mot
  if (verse.charCodeAt(pos) === 0x6E5 || verse.charCodeAt(pos) === 0x6E6 || verse.charCodeAt(pos) === 0x6ED || verse.charCodeAt(pos) === 0x6E2) {
    pos--;
  } else if (pos > 0 && verse.charCodeAt(pos) === 0x653 && (verse.charCodeAt(pos - 1) === 0x6E5 || verse.charCodeAt(pos - 1) === 0x6E6)) {
    pos -= 2;
  }

  // Maintenant, vérifiez les conditions de la règle waqf soukoun
  if (pos >= 4 && 
      (verse.charCodeAt(pos) === 0x64E || verse.charCodeAt(pos) === 0x64F || verse.charCodeAt(pos) === 0x650 || verse.charCodeAt(pos) === 0x64C || verse.charCodeAt(pos) === 0x64D) &&
      (verse.charCodeAt(pos - 1) >= 0x622 && verse.charCodeAt(pos - 1) <= 0x64A) &&
      (verse.charCodeAt(pos - 2) === 0x627 || verse.charCodeAt(pos - 2) === 0x648 || verse.charCodeAt(pos - 2) === 0x64A) &&
      ((verse.charCodeAt(pos - 2) === 0x627 && verse.charCodeAt(pos - 3) === 0x64E) || 
       (verse.charCodeAt(pos - 2) === 0x648 && verse.charCodeAt(pos - 3) === 0x64F) || 
       (verse.charCodeAt(pos - 2) === 0x64A && verse.charCodeAt(pos - 3) === 0x650))) 
  {
    // Ajouter le résultat
    result.push({ index: pos - 4, length:3 , style: waqfColor });
  }

  return result;
}

function applySilatuKubraRule(verse) {
  const result = [];
  const normalColor = { color: '#04B404', weight: 'bold', size: '50px' };
  const specialColor = { color: '#FFA500', weight: 'bold', size: '50px' }; // Couleur orange pour la séquence spéciale

  for (let i = 0; i < verse.length - 1; i++) {
    if ((verse.charCodeAt(i) === 0x6E5 || verse.charCodeAt(i) === 0x6E6) && verse.charCodeAt(i + 1) === 0x653) {
      let start = Math.max(i - 2, 0);
      let end = Math.min(i + 4, verse.length);

      // Vérifier si c'est le dernier caractère du verset
      if (i === verse.length - 2) { // On vérifie -2 parce qu'on a maintenant deux caractères dans la séquence
        // Utiliser la couleur spéciale
        result.push({ index: start, length: end - start, style: specialColor });
      } else {
        // Utiliser la couleur normale
        result.push({ index: start, length: end - start, style: normalColor });
      }
    }
  }

  return result;
}

function applySilatuSuraRule(verse) {
  const result = [];
  const normalColor = { color: '#8A0886', weight: 'bold', size: '50px' };
  const specialColor = { color: '#FFA500', weight: 'bold', size: '50px' }; // Couleur orange pour la séquence spéciale

  for (let i = 0; i < verse.length; i++) {
    if ((verse.charCodeAt(i) === 0x6E6 || verse.charCodeAt(i) === 0x6E5) && verse.charCodeAt(i + 1) !== 0x653) {
      // Vérifiez si le caractère précédant est 'ه'
      if (i > 0 && verse.charCodeAt(i - 2) !== 0x647) {
        continue;  // Si ce n'est pas le cas, passez à la prochaine itération
      }
      
      let start = Math.max(i - 2, 0);
      let end = Math.min(i + 4, verse.length);

      // Vérifier si c'est le dernier caractère du verset
      if (i === verse.length - 1) {
        // Utiliser la couleur spéciale
        result.push({ index: start, length: end - start, style: specialColor });
      } else {
        // Utiliser la couleur normale
        result.push({ index: start, length: end - start, style: normalColor });
      }
    }
  }

  return result;
}

function applyMadBadalRule(verseText) {
  // Chaque entrée : pattern + speech.
  // Pour les séquences qui commencent par U+0654 (hamza combinante), on étend
  // le span coloré pour inclure la lettre porteuse (i-1) afin que la hamza
  // et sa voyelle s'affichent bien en rouge (sinon, en tant que diacritiques
  // combinants, ils héritent de la couleur de leur base hors span = noir).
  const sequences = [
    { pattern: 'إِي', speech: 'همزة و بعدها ياء' },
    { pattern: 'إِۦ', speech: 'همزة و بعدها ياء' },
    { pattern: 'ءَا', speech: 'همزة و بعدها ألف' },
    { pattern: 'أُو', speech: 'همزة و بعدها واو' },
    { pattern: 'َٔا', speech: 'همزة و بعدها ألف' },
    { pattern: 'ؤَا', speech: 'همزة و بعدها ألف' },
    { pattern: 'ُٔو', speech: 'همزة و بعدها واو' },
    { pattern: 'ءُو', speech: 'همزة و بعدها واو' },
    { pattern: 'ءِي', speech: 'همزة و بعدها ياء' },
    { pattern: 'ءُۥ', speech: 'همزة و بعدها واو' },
    { pattern: 'َٔـٰ', speech: 'همزة و بعدها ألف' },
    { pattern: 'ـِٔي', speech: 'همزة و بعدها ياء' }
  ];

  const diacritics = ['ً', 'ٌ', 'ٍ', 'َ', 'ُ', 'ِ', 'ّ', 'ْ', 'ۦ', '۟'];
  const matches = [];

  sequences.forEach(({ pattern, speech }) => {
    const startsWithCombiningHamza = pattern.startsWith('ٔ');
    const sequenceRegEx = new RegExp(pattern, 'g');
    let match;
    while ((match = sequenceRegEx.exec(verseText)) !== null) {
      // valider qu'il n'y a pas un diacritique/madda derrière (sinon ce n'est pas un mad badal pur)
      let isValid = true;
      if (match.index + pattern.length < verseText.length) {
        const nextChar = verseText[match.index + pattern.length];
        isValid = !(diacritics.includes(nextChar) || nextChar === 'ٓ');
      }
      if (!isValid) continue;

      // Si la séquence commence par une hamza combinante, on inclut la lettre
      // porteuse (i-1) pour que la hamza+voyelle apparaissent rouges.
      let hitIndex = match.index;
      let hitLength = match[0].length;
      if (startsWithCombiningHamza && match.index > 0) {
        hitIndex = match.index - 1;
        hitLength = match[0].length + 1;
      }

      matches.push({
        index: hitIndex,
        length: hitLength,
        speech,
        style: { color: 'red', weight: 'bold', size: '50px' }
      });
    }
  });

  return matches;
}

function applyMadIwadRule(verseText) {
  const shedda = "\u0651";
  const tanweenAn = "\u064B";
  const alif = "\u0627";

  // Extraire le dernier mot
  const words = verseText.split(' ');
  const lastWord = words[words.length - 1];

  let foundMadIwad = [];

  // Recherche de la séquence dans le dernier mot
  for (let i = 0; i < lastWord.length; i++) {
    if (/[\u0621-\u064A]/.test(lastWord[i]) && lastWord[i + 1] === shedda && lastWord[i + 2] === tanweenAn && lastWord[i + 3] === alif) {
      const indexInVerse = words.slice(0, -1).reduce((sum, word) => sum + word.length + 1, 0) + i;
      foundMadIwad.push({
        index: indexInVerse,
        length: 4, // Longueur de la séquence
        style: {
          color: 'red',
          weight: 'bold',
          size: '50px'
        }
      });
    }
  }

  // Recherche de la séquence à la fin du dernier mot
  const sequenceRegEx = /([\u0621-\u064A])\u064B[\u064B\u06E2]*[\u0627\u0649]$/;

  const match = sequenceRegEx.exec(lastWord);

  if (match) {
    // Calculer l'index correct dans verseText
    const indexInVerse = words.slice(0, -1).reduce((sum, word) => sum + word.length + 1, 0) + match.index;
    foundMadIwad.push({
      index: indexInVerse,
      length: match[0].length,
      style: {
        color: 'red', // remplacer par la couleur souhaitée
        weight: 'bold', // remplacer par le poids souhaité
        size: '50px' // remplacer par la taille souhaitée
      }
    });
  }

  return foundMadIwad;
}


function excludeSequence(word) {
  const fatha = '\u064E';
  const kasra = '\u0650';
  const damma = '\u064F';
  const alif = '\u0627';
  const ya = '\u064A';
  const waw = '\u0648';
  const shedda = '\u0651';
  const tanwin_fath = '\u064B';
  const tanwin_damm = '\u064C';
  const tanwin_kasr = '\u064D';
  const alifMaksura = '\u0649';
  const ta_marbouta = '\u0629';
  const madAbove = '\u0653';
  const alifSuperior = '\u0670';
  const mimsila      = '\u06E2';

  const arabicLetters = [
    '\u0622', '\u0628', '\u062A', '\u062B', '\u062C', '\u062D', '\u062E', '\u062D', '\u062E', '\u062F', '\u0630', '\u0631', '\u0632', '\u0633', '\u0634', '\u0635', '\u0636', '\u0637', '\u0638', '\u0639', '\u063A', '\u0641', '\u0642', '\u0643', '\u0644', '\u0645', '\u0646', '\u0647', '\u0648', '\u064A'
  ];

  const specialLetters = [ya, waw, alif, alifMaksura,mimsila];
  let containsSpecialLetter = false;

  //let start = word.length - 4 > 0 ? word.length - 4 : 0;
  console.log(word);
  console.log(word.length);

  for (let k = word.length -1; k > word.length - 4; k--) 
  {
    console.log(word[k]);
    if((word[k] === ta_marbouta) || (word[k] === madAbove)|| (word[k] === alifSuperior)|| (word[k] === alifMaksura))
    {
      console.log("out: ta_marbouta or madAbove or alifSuperior or alifMaksura");
      break;
    }
    if (specialLetters.includes(word[k])) 
    {
      console.log("found: specialLetters");
      // vérifie si le caractère suivant n'est pas une lettre
      if (!arabicLetters.includes(word[k - 1])) 
      {
        console.log("out: specialLetters");
        console.log(word[k-1]);
        containsSpecialLetter = true;
        break;
      }
      else
      {
        console.log("!arabicLetters.includes(word[k - 1])");
      }
    }
  }

  if (!containsSpecialLetter) 
  {
    console.log("return: !specialLetters");
    return 0;
  }

  // Check for the specific ending sequence 
  let i = word.length - 1;
  let j = 0;
  for( j=0 ; j < word.length; j++) 
  {
    console.log("word[" + j + "]: ", word[j], ', Unicode: ', word[j].charCodeAt(0).toString(16));
  }

  if (arabicLetters.includes(word[i - 2]) && ((word[i - 1] === fatha && word[i] === alif) || (word[i - 1] === damma && word[i] === waw) || (word[i - 1] === kasra && word[i] === ya))) {
    return 0;
  }

  
  while (i >= 0) 
  {
    if (arabicLetters.includes(word[i - 4]) && (word[i - 3] === fatha || word[i - 3] === kasra || word[i - 3] === damma) && (word[i - 2] === alif || word[i - 2] === ya || word[i - 2] === waw) && arabicLetters.includes(word[i - 1]) && (word[i] === fatha || word[i] === kasra || word[i] === damma || word[i] === tanwin_fath || word[i] === tanwin_damm || word[i] === tanwin_kasr)) {
      console.log(word[i - 4]);
      console.log("i-4+1");
      return i - 4 + 1;
    }
    else if (arabicLetters.includes(word[i - 5]) && word[i - 4] === kasra && word[i - 3] === ya && arabicLetters.includes(word[i - 2]) && word[i - 1] === tanwin_damm && word[i] === '\u06e2') {
      console.log(word[i - 5]);
      console.log("i-5");
      return i - 5;
    }
    else if (arabicLetters.includes(word[i - 5]) && word[i - 4] === shedda && (word[i - 3] === fatha || word[i - 3] === kasra || word[i - 3] === damma) && (word[i - 2] === alif || word[i - 2] === ya || word[i - 2] === waw) && arabicLetters.includes(word[i - 1]) && (word[i] === fatha || word[i] === kasra || word[i] === damma || word[i] === tanwin_fath || word[i] === tanwin_damm || word[i] === tanwin_kasr)) {
      console.log(word[i - 5]);
      console.log("i-5");
      return i - 5;
    } else if (arabicLetters.includes(word[i - 3]) && (word[i - 2] === fatha || word[i - 2] === kasra || word[i - 2] === damma) && (word[i - 1] === alif || word[i - 1] === ya || word[i - 1] === waw) && arabicLetters.includes(word[i]) && (word[i] === fatha || word[i] === kasra || word[i] === damma || word[i] === tanwin_fath || word[i] === tanwin_damm || word[i] === tanwin_kasr)) {
      console.log(word[i - 3]);
      console.log("i-3");
      return i - 3;
    }
    i--;
    j++;
    if(j >= 4 )
    {
      return 0;
    }
  }
  return 0;
}

function applyMadAsliRule(verseText) {
  const fatha = '\u064E';
  const kasra = '\u0650';
  const damma = '\u064F';
  const alif = '\u0627';
  const alifMaksura = '\u0649';
  const alifSuperior = '\u0670';
  const ya = '\u064A';
  const waw = '\u0648';
  const hamza = '\u0621';
  const hamza_625 = '\u0625';
  const hamza_623 = '\u0623';
  const hamza_626 = '\u0626';
  const hamza_654 = '\u0654';
  const sukun = '\u0652';
  const tatweel = '\u0640';
  const alifWasla = '\u0671';
  const shedda = '\u0651';
  const madAbove = '\u0653';

  let foundMadAsli = [];

  const arabicLetters = [
    '\u0622', '\u0628', '\u062A', '\u062B', '\u062C', '\u062D', '\u062E', '\u062D', '\u062E', '\u062F', '\u0630', '\u0631', '\u0632', '\u0633', '\u0634', '\u0635', '\u0636', '\u0637', '\u0638', '\u0639', '\u063A', '\u0641', '\u0642', '\u0643', '\u0644', '\u0645', '\u0646', '\u0647', '\u0648', '\u064A'
  ];

  console.log(verseText);
  const words = verseText.split(' ');
  const lastWord = words[words.length - 1];

  for (let i = 0; i < verseText.length; i++) 
  {
    console.log('Current letter: ', verseText[i], ', Unicode: ', verseText[i].charCodeAt(0).toString(16));
    // Add two new checks for exceptions, if these are true, we skip this iteration
    if (verseText[i + 1] === fatha && verseText[i + 2] === tatweel && verseText[i + 3] === alifSuperior && verseText[i + 4] === madAbove) {
      console.log("Condition 1 met");
      i += 4;
      continue;
    }
    else if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === fatha && verseText[i + 2] === alif && verseText[i + 3] === madAbove) {
      console.log("Condition no kalami mouthaqqal met");
      i += 3;
      continue;
    } 
    else if (verseText[i + 2] === fatha && verseText[i + 3] === alif && verseText[i + 4] === madAbove) {
      console.log("Condition 2 met");
      i += 4;
      continue;
    }
    else if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === fatha && verseText[i + 2] === alif && (verseText[i + 3] === madAbove && i === (verseText.length-1)))
    {
      console.log("Condition 2 bis met");
      i += 3; // Incrémente i de 3
      continue;
    }
    else if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === shedda && verseText[i + 2] === fatha && verseText[i + 3] === alif && verseText[i + 4] === '\u0020' && verseText[i + 5] === alifWasla)
    {
      console.log("Condition 2 ter met");
      i += 5; // Incrémente i de 5 
      continue;
    }
    else if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === fatha && verseText[i + 2] === alif && verseText[i + 3] === madAbove && verseText[i + 4] === '\u0020' && verseText[i + 5] === hamza_625)
    {
      console.log("Condition 2 quar met");
      i += 5; // Incrémente i de 5 
      continue;
    }

    else if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === fatha && verseText[i + 2] === alifMaksura && verseText[i + 3] === alifSuperior && verseText[i + 4] === madAbove && verseText[i + 5] === '\u0020' && (verseText[i + 6] === hamza_623 || verseText[i + 6] === hamza_625))
    {
      console.log("Condition 2 cinqo met");
      i += 6; // Incrémente i de 6 
      continue;
    }


    // Check for the exception sequence: Letter + Alif + 0x653
    if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === fatha && verseText[i + 2] === alif && verseText[i + 3] === madAbove 
        && ((verseText[i + 4] === hamza || verseText[i + 4] === hamza_626) || (verseText[i + 4] === '\u0020' &&  verseText[i + 5] === '\u0623'))) {
      i += 5; // Incrémente i de 5
      console.log("Condition 3 met");
      continue;
    }

    // Si la séquence actuelle est : lettre + kasra + alifMaksura + madAbove, on passe à l'itération suivante
    if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === kasra && verseText[i + 2] === alifMaksura && verseText[i + 3] === madAbove) {
      console.log("Condition 4 met");
      continue;
    }

    if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === damma && verseText[i + 2] === waw && verseText[i + 3] === madAbove) {
      console.log("Condition 5 met");
      continue;
    }
    if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === kasra && verseText[i + 2] === ya && verseText[i + 3] === shedda) {
      console.log("Condition 6 met");
      continue;
    }
    if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === shedda && verseText[i + 2] === kasra && verseText[i + 3] === ya && !arabicLetters.includes(verseText[i + 4])) {
      console.log("Condition 7 met");
      continue;
    }

    if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === kasra && verseText[i + 2] === alifMaksura && verseText[i + 3] === '\u0020' && verseText[i + 4] === alifWasla) {
      console.log("Condition met 8");
      i += 5; // Incrémente i de 5
      continue;
    }
 
    if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === damma && verseText[i + 2] === waw && verseText[i + 3] === '\u0020' && verseText[i + 4] === alifWasla) {
      console.log("Condition met 9");
      i += 5; // Incrémente i de 5
      continue;
    }

    if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === damma && verseText[i + 2] === waw  && verseText[i + 3] === alif  && verseText[i + 4] === '\u06df' &&
    verseText[i + 5] === '\u0020' && verseText[i + 6] === alifWasla) 
    {
      console.log("Condition met 10");
      i += 6; // Incrémente i de 6
      continue;
    }

    if (verseText[i] === '\u0621' && verseText[i + 1] === '\u064f' && verseText[i + 2] === '\u06e5') {
      console.log("Condition met 11");
      i += 2; // Met à jour i avec la valeur i+2
      continue;
    }
    
    
    if ( arabicLetters.includes(verseText[i]) && 
         verseText[i + 1] === damma && 
         verseText[i + 2] === waw && 
         verseText[i + 3] === shedda
    ) 
    {
      console.log("Condition 12 met");
      continue;
    }
    

    // Ajout des nouvelles propriétés aux pushs dans le code
    // définir le style une seule fois et l'utiliser à chaque fois pour gagner du temps
    const styleObject = {color: 'blue', weight: 'bold', size: '50px'};
    if(i===0)
    {
      const hexCode = verseText[i].charCodeAt(0).toString(16).padStart(4, '0');
      console.log("i =", i, "Letter:", verseText[i], "Unicode:", "\\u" + hexCode);
    }

    if(arabicLetters.includes(verseText[i]))
    {
      const hexCode = verseText[i].charCodeAt(0).toString(16).padStart(4, '0');
      console.log("i =", i, "Letter:", verseText[i], "Unicode:", "\\u" + hexCode);
    }

    if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === fatha && verseText[i + 2] === alifMaksura && i + 2 === verseText.length - 1) {
      foundMadAsli.push({ word: verseText, chars: verseText[i] + verseText[i + 1] + verseText[i + 2], index: i, nextChar: null, length: 3, style: styleObject });
    }
    if(arabicLetters.includes(verseText[i]) && verseText[i + 1] === shedda && verseText[i + 2] === kasra && verseText[i + 3] === ya && arabicLetters.includes(verseText[i+4])) 
    {
      foundMadAsli.push({ word: verseText, chars: verseText[i] + verseText[i + 1] + verseText[i + 2] + verseText[i + 3], index: i, nextChar: verseText[i + 4], length: 4, style: styleObject });
    }
    else if(arabicLetters.includes(verseText[i]) && verseText[i + 1] === shedda && verseText[i + 2] === kasra && verseText[i + 3] === alifMaksura) 
    {
      foundMadAsli.push({ word: verseText, chars: verseText[i] + verseText[i + 1] + verseText[i + 2] + verseText[i + 3], index: i, nextChar: verseText[i + 4], length: 4, style: styleObject });
    }
    else if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === fatha && verseText[i + 2] === alif && verseText[i + 3] === madAbove ) 
    {
      foundMadAsli.push({ word: verseText, chars: verseText[i] + fatha + alif , index: i, nextChar: verseText[i + 4], length: 3, style: styleObject });
    }
    else if(arabicLetters.includes(verseText[i]) && verseText[i + 1] === fatha && verseText[i + 2] === alif && verseText[i + 3] === '\u0020' && verseText[i + 4] !== alifWasla) 
    {
      foundMadAsli.push({ word: verseText, chars: verseText[i] + verseText[i + 1] + verseText[i + 2], index: i, nextChar: verseText[i + 3], length: 3, style: styleObject });
    }
    else if(arabicLetters.includes(verseText[i]) && verseText[i + 1] === shedda && verseText[i + 2] === fatha && verseText[i + 3] === alif && arabicLetters.includes(verseText[i+4])) {
      foundMadAsli.push({ word: verseText, chars: verseText[i] + verseText[i + 1] + verseText[i + 2] + verseText[i + 3], index: i, nextChar: verseText[i + 4], length: 4, style: styleObject });
    }
    else if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === shedda && verseText[i + 2] === fatha && verseText[i + 3] === alifSuperior ) {
      foundMadAsli.push({ word: verseText, chars: verseText[i] + shedda + fatha + alifSuperior , index: i, nextChar: verseText[i + 4], length: 4, style: styleObject });
    }
    else if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === fatha && verseText[i + 2] === tatweel && verseText[i + 3] === alifSuperior ) {
      foundMadAsli.push({ word: verseText, chars: verseText[i] + fatha + tatweel + alifSuperior , index: i, nextChar: verseText[i + 4], length: 4, style: styleObject });
    }
    else if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === fatha && verseText[i + 2] === alifMaksura && verseText[i + 3] === alifSuperior ) 
    {
      foundMadAsli.push({ word: verseText, chars: verseText[i] + fatha + alifMaksura + alifSuperior , index: i, nextChar: verseText[i + 4], length: 4, style: styleObject });
    }
    else if (verseText[i] === ya  && verseText[i + 1] === shedda && verseText[i + 2] === kasra && verseText[i + 3] === tatweel && verseText[i + 4] === '\u06E7' ) {
      foundMadAsli.push({ word: verseText, chars: verseText[i] + fatha + tatweel + alifSuperior , index: i, nextChar: verseText[i + 5], length: 5, style: styleObject });
    }
    else if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === kasra && verseText[i + 2] === tatweel && verseText[i + 3] === '\u06E7' ) {
      foundMadAsli.push({ word: verseText, chars: verseText[i] + fatha + tatweel + '\u06E7' , index: i, nextChar: verseText[i + 4], length: 4, style: styleObject });
    }
    else if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === shedda && verseText[i + 2] === fatha && verseText[i + 3] === tatweel && verseText[i + 4] === alifSuperior) {
      foundMadAsli.push({ word: verseText, chars: verseText[i] + shedda + fatha + tatweel + alifSuperior, index: i, nextChar: verseText[i + 5], length: 5, style: styleObject });
    }
    else if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === fatha && verseText[i + 2] === alifMaksura && verseText[i + 3] === alifSuperior && (verseText[i+4] === '\u0020')) {
      foundMadAsli.push({ word: verseText, chars: verseText[i] + fatha + verseText[i + 2], index: i, nextChar: verseText[i + 4], length: 4, style: styleObject });
    }
    else if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === fatha && verseText[i + 2] === alifMaksura && verseText[i + 3] === alifSuperior && arabicLetters.includes(verseText[i+4])) {
      foundMadAsli.push({ word: verseText, chars: verseText[i] + fatha + verseText[i + 2], index: i, nextChar: verseText[i + 4], length: 4, style: styleObject });
    }
    else if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === fatha && verseText[i + 2] === alifMaksura && verseText[i + 3] === alifSuperior && verseText[i + 4] === madAbove) {
      foundMadAsli.push({ word: verseText, chars: verseText[i] + fatha + alifMaksura + alifSuperior + madAbove, index: i, nextChar: verseText[i + 5], length: 5, style: styleObject });
    }
    else if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === fatha && (verseText[i + 2] === alif || verseText[i + 2] === alifSuperior || 
      (verseText[i + 2] === waw && verseText[i + 3] === alifSuperior)) && verseText[i + 3] !== '\u0020' && verseText[i + 3] !== sukun && (!verseText[i + 3] || (verseText[i + 3] !== madAbove || verseText[i + 4] !== hamza))) {
      foundMadAsli.push({ word: verseText, chars: verseText[i] + fatha + verseText[i + 2], index: i, nextChar: verseText[i + 3], length: 3, style: styleObject });
    }
    else if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === kasra && (verseText[i + 2] === ya || verseText[i + 2] === alifMaksura) && (!verseText[i + 3] || verseText[i + 3] === ' ' || (verseText[i + 3] !== fatha && verseText[i + 3] !== kasra && verseText[i + 3] !== damma))) {
      foundMadAsli.push({ word: verseText, chars: verseText[i] + kasra + verseText[i + 2], index: i, nextChar: verseText[i + 2], length: 3, style: styleObject });
    }
    else if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === damma && verseText[i + 2] === waw && (!verseText[i + 3] || (verseText[i + 3] !== madAbove || verseText[i + 4] !== hamza)) && verseText[i + 3] !== fatha && verseText[i + 3] !== '\u064B') {
      foundMadAsli.push({ word: verseText, chars: verseText[i] + damma + waw, index: i, nextChar: verseText[i + 2], length: 3, style: styleObject });
    }
    else if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === shedda && verseText[i + 2] === kasra && verseText[i + 3] === ya && (verseText[i + 4] !== shedda) && (!verseText[i + 4] || (verseText[i + 4] !== madAbove || verseText[i + 5] !== hamza))) {
      foundMadAsli.push({ word: verseText, chars: verseText[i] + shedda + kasra + ya, index: i, nextChar: verseText[i + 3], length: 4, style: styleObject });
    }
    else if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === shedda && verseText[i + 2] === fatha && verseText[i + 3] === alif && (!verseText[i + 4] || (verseText[i + 4] !== madAbove || verseText[i + 5] !== hamza))) {
      foundMadAsli.push({ word: verseText, chars: verseText[i] + shedda + fatha + alif, index: i, nextChar: verseText[i + 3], length: 4, style: styleObject });
    }
    else if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === shedda && verseText[i + 2] === damma && verseText[i + 3] === waw && (!verseText[i + 4] || (verseText[i + 4] !== madAbove || verseText[i + 5] !== hamza))) {
      foundMadAsli.push({ word: verseText, chars: verseText[i] + shedda + damma + waw, index: i, nextChar: verseText[i + 3], length: 4, style: styleObject });
    }
    else if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === fatha && verseText[i + 2] === tatweel && verseText[i + 3] === alifSuperior) {
      foundMadAsli.push({ word: verseText, chars: verseText[i] + fatha + tatweel + alifSuperior, index: i, nextChar: verseText[i + 3], length: 4, style: styleObject });
    }
    else if (arabicLetters.includes(verseText[i]) && verseText[i + 1] === shedda && verseText[i + 2] === fatha && verseText[i + 3] === alifMaksura && verseText[i + 4] === alifSuperior) {
      foundMadAsli.push({ word: verseText, chars: verseText[i] + shedda + fatha + alifMaksura + alifSuperior, index: i, nextChar: verseText[i + 4], length: 5, style: styleObject });
    }
    else if (verseText[i] === '\u0621' && verseText[i + 1] === '\u064f' && verseText[i + 2] === '\u06e5' && arabicLetters.includes(verseText[i + 3])) {
      foundMadAsli.push({ word: verseText, chars: verseText[i] + '\u064f' + '\u06e5' + verseText[i + 3], index: i, nextChar: verseText[i + 3], length: 3, style: styleObject });
    }  
  }

  const excludedSequenceStartIndex = excludeSequence(lastWord);
  console.log(excludedSequenceStartIndex);
  if (excludedSequenceStartIndex > 0 && foundMadAsli.length > 0) 
  {
    //console.log(foundMadAsli.pop()); // remove the last Mad
    foundMadAsli.pop();
  }

  return foundMadAsli;
}

function applyNounSheddaRule(verseText) {
  const noun = 'ن';
  const shedda = 'ّ';
  const diacriticalMarks = ['َ', 'ِ', 'ُ'];
  let foundNounShedda = [];

  for (let i = 0; i < verseText.length; i++) {
    if (verseText[i] === noun && verseText[i + 1] === shedda && diacriticalMarks.includes(verseText[i + 2])) {
      foundNounShedda.push({ word: verseText, chars: noun + shedda + verseText[i + 2], index: i, nextChar: verseText[i + 1], length: 3 });
    }
  }

  const results = foundNounShedda.map((found) => {
    return {
      index: found.index,
      length: found.length,
      style: {
        color: '#B45F04', // Remplacez par la couleur désirée pour cette règle
        weight: 'bold', // Remplacez par le poids de la police désiré pour cette règle
        size: '50px' // Remplacez par la taille de la police désirée pour cette règle
      }
    };
  });

  return results;
}

function applyMimSheddaRule(verseText) {
  const mim = 'م';
  const shedda = 'ّ';
  const diacriticalMarks = ['َ', 'ِ', 'ُ'];
  let foundMimShedda = [];

  for (let i = 0; i < verseText.length; i++) {
    if (verseText[i] === mim && verseText[i + 1] === shedda && diacriticalMarks.includes(verseText[i + 2])) {
      foundMimShedda.push({ index: i, length: 3 });
    }
  }

  return foundMimShedda.map((found) => ({
    index: found.index,
    length: found.length,
    style: {
      color: '#0000FF', // Remplacez par la couleur désirée
      weight: 'bold', // Remplacez par le poids désiré
      size: '50px' // Remplacez par la taille désirée
    }
  }));
}

function applyLamShamsiRule(verseText) {
  const alifWasla = '\u0671'; // Alif Wasla
  const lam = 'ل';
  const shamsiLetters = ['ت', 'ث', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ن', 'ل'];
  const shedda = 'ّ';
  const diacriticalMarks = ['َ', 'ِ', 'ُ'];
  let foundLamShamsi = [];

  for (let i = 0; i < verseText.length; i++) {
    if (verseText[i] === alifWasla && verseText[i + 1] === lam && shamsiLetters.includes(verseText[i + 2]) && verseText[i + 3] === shedda && diacriticalMarks.includes(verseText[i + 4])) {
      foundLamShamsi.push({ index: i, length: 2 });
    }
  }
  return foundLamShamsi.map((found) => ({
    index: found.index,
    length: found.length,
    style: {
      color: '#0080FF', // Remplacez par la couleur désirée
      weight: 'bold', // Remplacez par le poids désiré
      size: '50px' // Remplacez par la taille désirée
    }
  }));
}

function applyLamQamariRule(verseText) {
  const alifWasla = '\u0671'; // Alif Wasla
  const lam = 'ل';
  const sukun = 'ْ';
  const qamariLetters = ['أ', 'ب', 'ج', 'ح', 'خ', 'ع', 'غ', 'ف', 'ق', 'ك', 'م', 'ه', 'و', 'ى'];
  let foundLamQamari = [];

  for (let i = 0; i < verseText.length; i++) {
    if (verseText[i] === alifWasla && verseText[i + 1] === lam && verseText[i + 2] === sukun && qamariLetters.includes(verseText[i + 3])) {
      foundLamQamari.push({ index: i, length: 3 });
    }
  }

  return foundLamQamari.map((found) => ({
    index: found.index,
    length: found.length,
    style: {
      color: '#FF00FF', // Remplacez par la couleur désirée
      weight: 'bold', // Remplacez par le poids désiré
      size: '50px' // Remplacez par la taille désirée
    }
  }));
}

function applyIzharShafawiRule(verseText) {
  const mimSukun = 'مْ';
  const allLettersExceptMimAndBa = ['ا', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'ن', 'ه', 'و', 'ي'];
  let foundIzhar = [];

  for (let i = 0; i < verseText.length - 2; i++) {
    if (verseText.substring(i, i + 2) === mimSukun) {
      let length = 3;
      if (verseText[i + 2] === ' ' && allLettersExceptMimAndBa.includes(verseText[i + 3])) {
        length = 4;
      } else if (!allLettersExceptMimAndBa.includes(verseText[i + 2])) {
        continue;
      }
      foundIzhar.push({ index: i, length });
    }
  }
  return foundIzhar.map((found) => ({
    index: found.index,
    length: found.length,
    style: {
      color: '#40FF00', // Remplacez par la couleur désirée
      weight: 'bold', // Remplacez par le poids désiré
      size: '50px' // Remplacez par la taille désirée
    }
  }));
}

function applyIdghamShafawiRule(verseText) {
  const mimSukun = 'م';
  const diacriticalMarks = ['َ', 'ِ', 'ُ'];
  const shedda = 'ّ';
  let foundIdgham = [];

  for (let i = 0; i < verseText.length - 3; i++) {
    if (verseText[i] === mimSukun && verseText[i + 1] === ' ' && verseText[i + 2] === 'م' && verseText[i + 3] === shedda && diacriticalMarks.includes(verseText[i + 4])) {
      foundIdgham.push({ word: verseText, chars: mimSukun + ' م' + shedda + verseText[i + 4], index: i, nextChar: 'م', length: 5 });
    }
  }
  const results = foundIdgham.map((found) => {
    return {
      index: found.index,
      length: found.length,
      style: {
        color: '#B45F04', // Vous pouvez remplacer ceci par la couleur désirée pour cette règle
        weight: 'bold', // Vous pouvez remplacer ceci par le poids de la police désiré pour cette règle
        size: '50px' // Vous pouvez remplacer ceci par la taille de la police désirée pour cette règle
      }
    };
  });

  return results;
}

function applyIkhfaShafawiRule(verseText) {
  const mimSukun = 'م';
  const diacriticalMarks = ['َ', 'ِ', 'ُ'];
  let foundIkhfa = [];

  for (let i = 0; i < verseText.length - 2; i++) {
    if (verseText[i] === mimSukun && verseText[i + 1] === ' ' && verseText[i + 2] === 'ب' && diacriticalMarks.includes(verseText[i + 3])) {
      foundIkhfa.push({ index: i, length: 4 });
    }
  }

  return foundIkhfa.map((found) => ({
    index: found.index,
    length: found.length,
    style: {
      color: '#01DF01', // Remplacez par la couleur désirée
      weight: 'bold', // Remplacez par le poids désiré
      size: '50px' // Remplacez par la taille désirée
    }
  }));
}

function applyIqlabRule(verseText) {
  const tanwinInOun = ['ٌ', 'ٍ'];
  const tanwinAn = 'ً';
  let foundIqlab = [];

  const speechNoun = `نون ساكنة و بعدها حرف الباء`;
  const speechTanwin = (mark) => `${TANWIN_NAMES[mark] || 'تنوين'} و بعده حرف الباء`;

  for (let i = 0; i < verseText.length; i++)
  {
    if (verseText[i] === 'ن' && verseText[i + 1] === 'ۢ' && verseText[i + 2] === 'ب') {
      foundIqlab.push({ index: i, length: 3, speech: speechNoun });
    }
    else if (verseText[i] === 'ن' && verseText[i + 1] === 'ۢ' && verseText[i + 2] === ' ' && verseText[i + 3] === 'ب') {
      foundIqlab.push({ index: i, length: 4, speech: speechNoun });
    }
    // tanwin damm + small high meem + ' ' + ب — inclut la lettre porteuse (i-1)
    else if (i > 0 && verseText[i] === 'ٌ' && verseText[i + 1] === 'ۢ' && verseText[i + 2] === ' ' && verseText[i + 3] === 'ب') {
      foundIqlab.push({ index: i - 1, length: 5, speech: speechTanwin('ٌ') });
    }
    else if (verseText[i] === 'ن' && verseText[i + 1] === 'ب') {
      foundIqlab.push({ index: i, length: 2, speech: speechNoun });
    }
    // tanwin (ٌ/ٍ) + (space|ٱ) + ب — inclut la lettre porteuse
    else if (i > 0 && tanwinInOun.includes(verseText[i]) && (verseText[i + 1] === ' ' || verseText[i + 1] === 'ٱ') && verseText[i + 2] === 'ب') {
      foundIqlab.push({ index: i - 1, length: 4, speech: speechTanwin(verseText[i]) });
    }
    // ً + ا + ' ' + ب — tanwin fath + alif — inclut la lettre porteuse
    else if (i > 0 && verseText[i] === tanwinAn && verseText[i + 1] === 'ا' && verseText[i + 2] === ' ' && verseText[i + 3] === 'ب') {
      foundIqlab.push({ index: i - 1, length: 5, speech: speechTanwin(tanwinAn) });
    }
    else if (verseText[i] === 'ن' && verseText[i + 1] === ' ' && verseText[i + 2] === 'ب') {
      foundIqlab.push({ index: i, length: 3, speech: speechNoun });
    }
    // \u0640\u064b + small high meem + alif + ' ' + \u0628 \u2014 inclut la lettre porteuse
    if (i > 0 && verseText[i] === '\u064b' && verseText[i + 1] === '\u06e2' && verseText[i + 2] === '\u0627' && verseText[i + 3] === ' ' && verseText[i + 4] === '\u0628') {
      foundIqlab.push({ index: i - 1, length: 6, speech: speechTanwin('\u064b') });
    }
   }

  return foundIqlab.map(h => ({
    index: h.index,
    length: h.length,
    speech: h.speech,
    style: { color: '#B45F04', weight: 'bold', size: '50px' }
  }));
}

function applyIkhfaRule(verseText) {
  const ikhfaLetters = ['ص', 'ذ', 'ث', 'ك', 'ج', 'ش', 'ق', 'س', 'د', 'ط', 'ز', 'ف', 'ت', 'ض', 'ظ'];
  const tanwinInOun = ['ٌ', 'ٍ'];
  const tanwinAn = 'ً';
  const alif = ['ا', 'ى'];
  let foundIkhfa = [];

  const styleObject = { color: '#9A2EFE', weight: 'bold', size: '50px' };
  const speechNoun = (target) => `نون ساكنة و بعدها حرف ${LETTER_NAMES[target] || target}`;
  const speechTanwin = (mark, target) => `${TANWIN_NAMES[mark] || 'تنوين'} و بعده حرف ${LETTER_NAMES[target] || target}`;

  for (let i = 0; i < verseText.length; i++) {
    // ن (saakinah implicite) + lettre d'ikhfa
    if (verseText[i] === 'ن' && ikhfaLetters.includes(verseText[i + 1])) {
      foundIkhfa.push({ index: i, length: 2, style: styleObject, speech: speechNoun(verseText[i + 1]) });
    }

    // tanwin (ٌ/ٍ) + (space|ٱ) + lettre d'ikhfa — inclut la lettre porteuse (i-1)
    if (i > 0 && tanwinInOun.includes(verseText[i]) && (verseText[i + 1] === ' ' || verseText[i + 1] === 'ٱ') && ikhfaLetters.includes(verseText[i + 2])) {
      foundIkhfa.push({ index: i - 1, length: 4, style: styleObject, speech: speechTanwin(verseText[i], verseText[i + 2]) });
    }

    // ـً + alif + ' ' + lettre d'ikhfa — inclut la lettre porteuse
    if (i > 0 && verseText[i] === tanwinAn && alif.includes(verseText[i + 1]) && verseText[i + 2] === ' ' && ikhfaLetters.includes(verseText[i + 3])) {
      foundIkhfa.push({ index: i - 1, length: 5, style: styleObject, speech: speechTanwin(tanwinAn, verseText[i + 3]) });
    }

    // ن + ' ' + lettre d'ikhfa
    if (verseText[i] === 'ن' && verseText[i + 1] === ' ' && ikhfaLetters.includes(verseText[i + 2])) {
      foundIkhfa.push({ index: i, length: 3, style: styleObject, speech: speechNoun(verseText[i + 2]) });
    }
  }

  return foundIkhfa;
}

// Vérifie si un caractère est un signe diacritique arabe
function isArabicDiacritic(char) {
  const arabicDiacritics = ['\u064B', '\u064C', '\u064D', '\u064E', '\u064F', '\u0650', '\u0651', '\u0652'];
  return arabicDiacritics.includes(char);
}

function applyIzharRule(verseText) {
  const izharLetters = ['ح', 'خ', 'ع', 'غ', 'ه', 'أ', 'إ', 'ؤ', 'ئ'];
  const tanwin = ['ٌ', 'ٍ', 'ً'];
  const alif = ['ا', 'ى'];
  let foundIzhar = [];

  const speechNoun = (target) => `نون ساكنة و بعدها حرف ${LETTER_NAMES[target] || target}`;
  const speechTanwin = (mark, target) => `${TANWIN_NAMES[mark] || 'تنوين'} و بعده حرف ${LETTER_NAMES[target] || target}`;

  for (let i = 0; i < verseText.length; i++) {
    // ن + soukoun + lettre d'izhar — noun ساكنة est sa propre base
    if (verseText[i] === 'ن' && verseText[i + 1] === 'ْ' && izharLetters.includes(verseText[i + 2])) {
      foundIzhar.push({ index: i, length: 3, speech: speechNoun(verseText[i + 2]) });
    }

    // ـً + alif + ' ' + lettre d'izhar — inclut la lettre porteuse (i-1)
    if (i > 0 && verseText[i] === 'ً' && alif.includes(verseText[i + 1]) && verseText[i + 2] === ' ' && izharLetters.includes(verseText[i + 3])) {
      foundIzhar.push({ index: i - 1, length: 5, speech: speechTanwin('ً', verseText[i + 3]) });
    }

    // tanwin (ٌ/ٍ/ً) + ' ' + lettre d'izhar — inclut la lettre porteuse
    if (i > 0 && tanwin.includes(verseText[i]) && verseText[i + 1] === ' ' && izharLetters.includes(verseText[i + 2])) {
      foundIzhar.push({ index: i - 1, length: 4, speech: speechTanwin(verseText[i], verseText[i + 2]) });
    }
  }

  return foundIzhar.map(h => ({
    index: h.index,
    length: h.length,
    speech: h.speech,
    style: { color: 'green', weight: 'bold', size: '50px' }
  }));
}

/**
 * Affiche dans la console chaque caractère et son code hexadécimal.
 * @param {string} s – la chaîne à inspecter
 */
function showHex(s) {
  s.split('').forEach(ch => {
    const hex = '0x' + ch.charCodeAt(0)
                       .toString(16)
                       .toUpperCase()
                       .padStart(4, '0');
    console.log(`Caractère: ${ch} – Hex: ${hex}`);
  });
}

/**
 * Détecte les positions de qalqalah dans un verset
 * On ne garde que la lettre + éventuellement le sukun qui suit.
 *
 * @param {string} verseText
 * @returns {Array<{index:number,length:number,style:Object}>}
 */
function findKalkalaInVerse(verseText) {
  const letters = new Set(['ق','ط','ب','ج','د']);
  const SUKUN   = '\u0652';

  const style = { color:'red', weight:'bold', size:'50px' };
  const hits = [];

  for (let i = 0; i < verseText.length; i++) {
    const ch = verseText[i];
    if (!letters.has(ch)) continue;

    const next = verseText[i+1] || '';
    if (next === SUKUN) {
      // lettre + sukun
      hits.push({ index:i, length:2, style });
    } else {
      // si fin de mot/verset ou espace, on prend juste la lettre
      const after = verseText[i+1] || '';
      if (after === ' ' || i+1 === verseText.length) {
        hits.push({ index:i, length:1, style });
      }
    }
  }

  // dernière lettre du verset (qalqala en fin de mot même sans sukun)
  let idx = verseText.length - 1;
  // on recule en ignorant tous diacritiques et espaces
  const ignore = new Set([SUKUN,'\u064E','\u064F','\u0650','\u0651','\u064C','\u064D','\u06ED','\u06E2',' ']);
  while (idx >= 0 && ignore.has(verseText[idx])) idx--;
  if (idx >= 0 && letters.has(verseText[idx])) {
    // éviter double-push si déjà présent
    if (!hits.some(h => h.index === idx)) {
      hits.push({ index:idx, length:1, style });
    }
  }

  return hits;
}

/**
 * Cherche la lettre de qalqala dans le dernier « mot » (fin de verset),
 * même si elle est suivie de plusieurs diacritiques ou small-meem.
 *
 * @param {string} verseText          – le texte complet du verset
 * @param {string[]} kalkalaLetters   – ['ق','ط','ب','ج','د']
 * @param {string[]} diacriticChars   – vos diacritiques classiques
 * @param {object} styleObject        – { color, weight, size }
 *
 * @returns {object|null}
 */
function findLastWordKalkala(verseText, kalkalaLetters, diacriticChars, styleObject) {
  // 1) On crée un Set de TOUS les diacritiques à IGNORER
  const extendedDiacritics = new Set([
    ...diacriticChars,
    '\u06ED', // ۭ small-low meem
    '\u06E2'  // ۢ small-high meem
  ]);

  // 2) On recule depuis la fin du string jusqu'à trouver une vraie lettre
  let idx = verseText.length - 1;
  while (
    idx >= 0 &&
    (extendedDiacritics.has(verseText[idx]) || verseText[idx] === ' ')
  ) {
    idx--;
  }
  if (idx < 0) return null;

  // 3) Si cette lettre est de type qalqala, on va la colorier
  const letter = verseText[idx];
  if (!kalkalaLetters.includes(letter)) return null;

  // 4) On compte combien de diacritiques/ small-meem suivent cette lettre,
  //    pour les englober DANS le span et ne pas casser la ligature.
  let end = idx + 1;
  while (end < verseText.length && extendedDiacritics.has(verseText[end])) {
    end++;
  }
  const length = end - idx;  // inclut la lettre + tous les diacritiques après

  return {
    word:     verseText,
    chars:    letter,
    index:    idx,
    nextChar: verseText[idx + 1] || '',
    length:   length,
    style:    styleObject
  };
}


function applyIdghamNoGhounaRule(verseText) {
  const idghamNoGhounaLetters = ['ل', 'ر'];
  const tanwin = ['ٌ', 'ٍ', 'ً'];
  const letters = ['ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي'];
  const alif = ['ا', 'ى'];
  const diacritics = ['\u064E', '\u064F', '\u0650', '\u0652', 'ٌ', 'ٍ', 'ً']; // fatha, damma, kasra, sukuun, tanwin fathah, tanwin dammah, tanwin kasrah
  const shedda = '\u0651';
  const whitespace = ' ';
  let foundIdghamNoGhouna = [];

  for (let i = 0; i < verseText.length; i++) {
    // 1) Noun saakinah implicite (نْ en fin de mot) + lettre cible + shedda
    if (verseText[i] === 'ن' && !letters.includes(verseText[i + 1]) && !diacritics.includes(verseText[i + 1]) && verseText[i + 1] === whitespace && idghamNoGhounaLetters.includes(verseText[i + 2]) && verseText[i + 3] === shedda) {
        const target = LETTER_NAMES[verseText[i + 2]] || verseText[i + 2];
        foundIdghamNoGhouna.push({
          word: verseText,
          char: 'ن' + whitespace + verseText[i + 2] + verseText[i + 3] + (verseText[i + 4] !== whitespace ? verseText[i + 4] : ''),
          index: i, nextChar: verseText[i + 2],
          speech: `نون ساكنة و بعده حرف ${target} مشددة`
        });
    }

    // 2) Tanwin fath + alif (ـً ا) + lettre cible + shedda
    //    On inclut la lettre porteuse (i-1) sinon le tanwin (diacritique combinant)
    //    hérite de la couleur de sa base et apparaît noir à l'écran.
    if (i > 0 && verseText[i] === 'ً' && alif.includes(verseText[i + 1]) && verseText[i + 2] === whitespace && idghamNoGhounaLetters.includes(verseText[i + 3]) && verseText[i + 4] === shedda) {
        const target = LETTER_NAMES[verseText[i + 3]] || verseText[i + 3];
        foundIdghamNoGhouna.push({
          word: verseText,
          char: verseText[i - 1] + verseText[i] + verseText[i + 1] + whitespace + verseText[i + 3] + verseText[i + 4] + (verseText[i + 5] !== whitespace ? verseText[i + 5] : ''),
          index: i - 1, nextChar: verseText[i + 3],
          speech: `تنوين بالفتح و بعده حرف ${target} مشددة`
        });
    }

    // 3) Tanwin (ـٌ, ـٍ, ـً) + lettre cible + shedda — idem, on inclut la lettre porteuse
    if (i > 0 && tanwin.includes(verseText[i]) && verseText[i + 1] === whitespace && idghamNoGhounaLetters.includes(verseText[i + 2]) && verseText[i + 3] === shedda) {
        const tanwinName = TANWIN_NAMES[verseText[i]] || 'تنوين';
        const target = LETTER_NAMES[verseText[i + 2]] || verseText[i + 2];
        foundIdghamNoGhouna.push({
          word: verseText,
          char: verseText[i - 1] + verseText[i] + whitespace + verseText[i + 2] + verseText[i + 3] + (verseText[i + 4] !== whitespace ? verseText[i + 4] : ''),
          index: i - 1, nextChar: verseText[i + 2],
          speech: `${tanwinName} و بعده حرف ${target} مشددة`
        });
    }
  }

  const results = foundIdghamNoGhouna.map((found) => {
    return {
      index: found.index,
      length: found.char.length, // la longueur du texte mis en évidence
      speech: found.speech,      // phrase spécifique pour le clic droit (data-speech)
      style: {
        color: 'deepskyblue', // la couleur ou autre style que vous souhaitez appliquer
        weight: 'bold',
        size: '50px'
      }
    };
  });

  return results;
}

function applyIdghamGhounaRule(verseText) {
  const idghamGhounaLetters = ['ي', 'ن', 'م', 'و'];
  const letters = ['ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي'];
  const alif = ['ا', 'ى'];
  const whitespace = ' ';
  let foundIdghamGhouna = [];

  const styleObject = { color: '#04B404', weight: 'bold', size: '50px' };
  const speechNoun = (target) => `نون ساكنة و بعدها حرف ${LETTER_NAMES[target] || target} مشددة`;
  const speechTanwin = (mark, target) => `${TANWIN_NAMES[mark] || 'تنوين'} و بعده حرف ${LETTER_NAMES[target] || target} مشددة`;

  for (let i = 0; i < verseText.length; i++) {
    // ن (saakinah implicite, fin de mot) + ' ' + lettre d'idgham — noun est sa propre base
    if (verseText[i] === 'ن' && !letters.includes(verseText[i + 1]) && verseText[i + 1] !== 'ْ' && verseText[i + 1] === whitespace && idghamGhounaLetters.includes(verseText[i + 2])) {
      foundIdghamGhouna.push({ index: i, length: 3, style: styleObject, speech: speechNoun(verseText[i + 2]) });
    }
    // tanwin (ٌ/ٍ) + ' ' + lettre d'idgham — inclut la lettre porteuse (i-1)
    else if (i > 0 && (verseText[i] === 'ٌ' || verseText[i] === 'ٍ') && verseText[i + 1] === whitespace && idghamGhounaLetters.includes(verseText[i + 2])) {
      foundIdghamGhouna.push({ index: i - 1, length: 4, style: styleObject, speech: speechTanwin(verseText[i], verseText[i + 2]) });
    }
    // ـً + alif + ' ' + lettre d'idgham — inclut la lettre porteuse
    else if (i > 0 && verseText[i] === 'ً' && alif.includes(verseText[i + 1]) && verseText[i + 2] === whitespace && idghamGhounaLetters.includes(verseText[i + 3])) {
      foundIdghamGhouna.push({ index: i - 1, length: 5, style: styleObject, speech: speechTanwin('ً', verseText[i + 3]) });
    }
    // ـً (sans alif) + ' ' + lettre d'idgham — inclut la lettre porteuse
    else if (i > 0 && verseText[i] === 'ً' && verseText[i + 1] === whitespace && idghamGhounaLetters.includes(verseText[i + 2])) {
      foundIdghamGhouna.push({ index: i - 1, length: 4, style: styleObject, speech: speechTanwin('ً', verseText[i + 2]) });
    }
  }

  return foundIdghamGhouna;
}

function getPageVerses(pageNumber) {
  return fetch(`api.php?page=${pageNumber}`)
    .then((response) => response.json())
    .then((data) => {
      return data.verses;
    })
    .catch((error) => {
      console.error('Une erreur s\'est produite lors de la récupération des données:', error);
    });
}

function loadPage() {
  const pageNumberInput = document.getElementById('pageNumberInput');
  const pageNumber = pageNumberInput.value;
  const quranContent = document.getElementById('quranContent');

  if (!pageNumber) {
    //alert('Veuillez entrer un numéro de page');
    return;
  }

  const enableHighlightBasmala = false; // Mettez ceci à false ou commentez-le pour désactiver la mise en évidence de la basmala

  getPageVerses(pageNumber)
    .then((verses) => {
      quranContent.innerHTML = '';
      const pageDiv = document.createElement('div');
      pageDiv.textContent = `Page : ${pageNumber}`;
      quranContent.appendChild(pageDiv);

      verses.forEach((verse) => {
        let verseText = verse.text; // Utilisation de la propriété 'text' de 'verse'

        if (enableHighlightBasmala) {
          verseText = highlightBasmala(verse.sura, verse.aya, verse.text);
        }

        const verseDiv = document.createElement('div');
        verseDiv.className = 'verse';
        verseDiv.innerHTML = `Sura : ${verse.sura}, Aya : ${verse.aya}, ${verseText}`; // Utilisation de la variable 'verseText'
        quranContent.appendChild(verseDiv);
      });

      lastLoadedPageNumber = pageNumber;
    })
    .catch((error) => {
      console.error('Une erreur s\'est produite lors de la récupération des données:', error);
    });
}

/**
 * Initialise les boutons de règles pour qu'ils parlent puis chargent la page.
 */
function initRuleButtons(useOptionA = true) {
  Object.keys(buttonRuleFunctions).forEach(ruleId => {
    const btn = document.getElementById(ruleId);
    if (!btn) return;

    btn.addEventListener('click', async () => {
      const details = buttonRuleFunctions[ruleId];
      if (!details) return;

      // Autoriser l'annonce du compte d'occurrences en fin de chargement.
      shouldSpeakCount = true;

      // L'annonce « البحث عن … صفحة … » est désormais gérée par loadPageWithButton
      // (via speakText → Google TTS, voix féminine, awaitable). On ne déclenche
      // donc plus de SpeechSynthesisUtterance directe ici (qui doublait avec Naayf).
      await loadPageWithButton(ruleId, useOptionA);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#sidebar button').forEach(btn => {
    btn.classList.add('rule-button');
  });
  initRuleButtons(true);
});

function LoadPageBefore() {
  const input = document.getElementById('pageNumberInput');
  let pageNumber = parseInt(input.value) || 1;
  if (pageNumber > 1) {
    input.value = pageNumber - 1;
    loadPage();
  }
}

function LoadPageAfter() {
  const input = document.getElementById('pageNumberInput');
  let pageNumber = parseInt(input.value) || 1;
  if (pageNumber < 1206) { // Mets 1208 si tu utilises les demi-pages
    input.value = pageNumber + 1;
    loadPage();
  }
}
// 🪟 Rendre les fonctions globales (accessibles depuis le HTML)
window.LoadPageBefore = LoadPageBefore;
window.LoadPageAfter = LoadPageAfter;
window.loadPage = loadPage; // si tu appelles aussi loadPage() depuis le HTML

const menuToggle = document.getElementById('menu-toggle');
const sidebar = document.getElementById('sidebar');

// ouverture/fermeture du menu
menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));

// fermeture automatique au clic sur une règle (en mobile)
document.querySelectorAll('#buttonGrid button').forEach(btn => {
  btn.addEventListener('click', () => {
    // charge la page
    loadPageWithButton(btn.id);
    // si on est en mobile, referme la sidebar
    if (window.innerWidth <= 768) {
      sidebar.classList.remove('open');
    }
  });
});