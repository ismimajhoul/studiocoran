let shouldSpeakCount = false;

// Mode détection : quand actif, un clic gauche sur une lettre lance
// directement l'analyse de règle de tajwid (équivalent au clic droit →
// "Identifier" sur desktop).
// Mode étymologie : quand actif, un clic gauche sur un mot affichera sa
// racine + forme verbale + lemme (V1 : verbes uniquement).
// Les deux modes sont MUTUELLEMENT EXCLUSIFS : activer l'un désactive
// l'autre. Reset à false à chaque loadPage — pas de persistance.
let detectionMode = false;
let etymologyMode = false;
function setDetectionMode(on) {
  detectionMode = !!on;
  if (detectionMode) etymologyMode = false; // exclusion mutuelle
  syncToggleButtons();
}
function setEtymologyMode(on) {
  etymologyMode = !!on;
  if (etymologyMode) detectionMode = false; // exclusion mutuelle
  syncToggleButtons();
}
function syncToggleButtons() {
  const d = document.getElementById('detectionToggleBtn');
  const e = document.getElementById('etymologyToggleBtn');
  if (d) d.setAttribute('aria-pressed', detectionMode ? 'true' : 'false');
  if (e) e.setAttribute('aria-pressed', etymologyMode ? 'true' : 'false');
}

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

  // Reset du contexte chat : le mot précédent n'est plus dans la nouvelle page
  window._chatContext = null;
  if (typeof updateChatContextLabel === 'function') updateChatContextLabel();

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
    updateClearAnalysisBtnVisibility();
    // L'ancien bindSpeechOnOverlay (clic droit direct sur lettre coloriée) est
    // remplacé par bindContextDetection, monté UNE fois au chargement de la
    // page (cf. DOMContentLoaded). On ne l'appelle donc plus ici.

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
  // Tri ascendant par word-start : indispensable car certaines règles
  // (applyMounfasil notamment) itèrent le verset à l'envers et retournent
  // donc des hits en ordre descendant. Sans ce tri, le regroupement
  // confond les bornes et wrapTajweedLetters reçoit des hits dont l'index
  // est antérieur au chunk extrait → HTML cassé.
  const sorted = [...hitInfos].sort((a, b) => a.ws - b.ws);
  const groups = [];
  for (const h of sorted) {
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
  // Fusionne d'abord les hits qui se chevauchent. Sans ça, certaines règles
  // (typ. mad mounfasil) qui peuvent pousser des ranges qui se croisent
  // produisent du HTML corrompu (un <span> ouvre au milieu d'un attribut
  // de <span> précédent → l'attribut s'affiche en texte brut).
  const sorted = [...hits].sort((a, b) => a.index - b.index);
  const merged = [];
  for (const h of sorted) {
    const last = merged[merged.length - 1];
    if (last && h.index < last.index + last.length) {
      // chevauchement → on étend le dernier au lieu d'ajouter un nouveau wrap
      const newEnd = Math.max(last.index + last.length, h.index + h.length);
      last.length = newEnd - last.index;
      // on garde le speech/style du premier (suffit pour le rendu)
    } else {
      merged.push({ ...h });
    }
  }

  let s = chunk;
  // tri descendant pour ne pas casser les offsets lors de l'injection
  merged
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

// ————————————————————————————————————————————————————————————
//  Coloration de base permanente (Phases A + B + C)
// ————————————————————————————————————————————————————————————

// Charte de couleurs (palette du Mushaf en tajwid)
const COLOR_MAD_4_TEMPS   = '#E91E63'; // rose  : mad muttasil / munfasil
const COLOR_MAD_6_TEMPS   = '#CC0000'; // rouge : mad laazim (4 variantes)
const COLOR_MAD_ARID      = '#FF8C00'; // orange: mad ʿarid lis-sukoun
const COLOR_GHUNNA        = '#1E7A1E'; // vert  : règles avec nasillement
const COLOR_QALQALA       = '#001F5F'; // bleu marine
const COLOR_EMPHATIC      = '#4169E1'; // bleu foncé (différencié du marine)

const ALWAYS_EMPHATIC_SET = new Set(['خ','ص','ض','غ','ط','ق','ظ']);

/**
 * Calcule la couleur de chaque position du verseText selon les règles
 * de tajwid. La priorité (du plus fort au plus faible) :
 *   1. Mads (rose / rouge / orange)
 *   2. Qalqala (bleu marine)
 *   3. Ghunna (vert)
 *   4. Lettres emphatiques (bleu foncé) — fallback
 *
 * Retourne un tableau de la longueur de verseText, contenant la couleur
 * (string CSS) ou null pour chaque position.
 */
function computeBaseColors(verseText) {
  const colorAt = new Array(verseText.length).fill(null);

  const applyHits = (hits, color) => {
    for (const h of hits || []) {
      const end = Math.min(h.index + h.length, verseText.length);
      for (let p = h.index; p < end; p++) {
        if (colorAt[p] === null) colorAt[p] = color; // first wins
      }
    }
  };

  // 1) Mads (priorité la plus haute — pédagogiquement les plus saillants)
  applyHits(applyMouttasil(verseText),     COLOR_MAD_4_TEMPS);
  applyHits(applyMounfasil(verseText),     COLOR_MAD_4_TEMPS);
  applyHits(applyLaazim_K_Thaqqal(verseText), COLOR_MAD_6_TEMPS);
  applyHits(applyLaazim_K_Khaffaf(verseText), COLOR_MAD_6_TEMPS);
  applyHits(applyLaazim_H_Thaqqal(verseText), COLOR_MAD_6_TEMPS);
  applyHits(applyLaazim_H_Khaffaf(verseText), COLOR_MAD_6_TEMPS);
  applyHits(applyWaqfSoukounRule(verseText),  COLOR_MAD_ARID);

  // 2) Qalqala
  applyHits(findKalkalaInVerse(verseText), COLOR_QALQALA);

  // 3) Ghunna (toutes les règles à nasillement)
  applyHits(applyIdghamGhounaRule(verseText),  COLOR_GHUNNA);
  applyHits(applyIqlabRule(verseText),         COLOR_GHUNNA);
  applyHits(applyIkhfaRule(verseText),         COLOR_GHUNNA);
  applyHits(applyNounSheddaRule(verseText),    COLOR_GHUNNA);
  applyHits(applyMimSheddaRule(verseText),     COLOR_GHUNNA);
  applyHits(applyIdghamShafawiRule(verseText), COLOR_GHUNNA);
  applyHits(applyIkhfaShafawiRule(verseText),  COLOR_GHUNNA);

  // 4) Lettres emphatiques (toujours) — uniquement les positions encore vides
  for (let i = 0; i < verseText.length; i++) {
    if (colorAt[i] === null && ALWAYS_EMPHATIC_SET.has(verseText[i])) {
      colorAt[i] = COLOR_EMPHATIC;
    }
  }

  return colorAt;
}

/**
 * Post-traite le HTML produit par applyOverlay pour appliquer la coloration
 * de base permanente. Walke le HTML et le verseText en parallèle pour mapper
 * les positions, en évitant les zones déjà à l'intérieur d'un <span
 * class="tajweed-letter"> (surlignage rouge actif via !important — prime).
 */
function applyBaseTajwidColors(html, verseText) {
  const colorAt = computeBaseColors(verseText);

  const out = [];
  const stack = [];   // type des spans ouverts
  let i = 0;          // position dans le html
  let v = 0;          // position dans le verseText
  let currentColor = null;

  const closeCurrent = () => {
    if (currentColor !== null) {
      out.push('</span>');
      currentColor = null;
    }
  };

  while (i < html.length) {
    if (html[i] === '<') {
      closeCurrent();
      const end = html.indexOf('>', i);
      if (end === -1) { out.push(html.slice(i)); break; }
      const tag = html.slice(i, end + 1);
      out.push(tag);
      if (tag.startsWith('</')) {
        if (stack.length) stack.pop();
      } else if (!tag.endsWith('/>')) {
        stack.push(tag.includes('class="tajweed-letter"') ? 'letter' : 'other');
      }
      i = end + 1;
    } else {
      const ch = html[i];
      const inLetter = stack.includes('letter');
      const color = inLetter ? null : (colorAt[v] || null);

      if (color !== currentColor) {
        closeCurrent();
        if (color !== null) {
          out.push(`<span class="tajweed-base" style="color:${color}">`);
          currentColor = color;
        }
      }
      out.push(ch);
      i++;
      v++;
    }
  }
  closeCurrent();
  return out.join('');
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
  let   html    = applyOverlay(text, verse, groups, offsets);
  // Coloration de base permanente (lettres emphatiques en bleu foncé) :
  // appliquée APRÈS applyOverlay pour ne pas casser les offsets des hits.
  html = applyBaseTajwidColors(html, text);

  const vDiv = document.createElement('div');
  vDiv.className = 'verse';
  // Métadonnées pour la détection contextuelle au clic droit :
  // on garde sura, aya, et le texte arabe ORIGINAL (sans les overlays HTML).
  vDiv.dataset.sura = verse.sura;
  vDiv.dataset.aya  = verse.aya;
  vDiv.dataset.text = text;

  // En-tête « Sura : X, Aya : Y, » dans un span dédié → on peut ainsi
  // isoler le corps arabe et calculer les offsets sans risque de pollution.
  const header = document.createElement('span');
  header.className = 'verseHeader';
  header.textContent = `Sura : ${verse.sura}, Aya : ${verse.aya}, `;
  vDiv.appendChild(header);

  const body = document.createElement('span');
  body.className = 'verseBody';
  body.innerHTML = html;
  vDiv.appendChild(body);

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

// ————————————————————————————————————————————————————————————
//  Détection au clic droit (menu contextuel) — analyse d'UN caractère
// ————————————————————————————————————————————————————————————

// Lettres toujours emphatiques (mufakhama) — v1 simplifiée.
// ر et ل (contextuelles) seront traitées plus tard.
const EMPHATIC_LETTERS = new Set(['خ', 'ص', 'ض', 'غ', 'ط', 'ق', 'ظ']);

const VOWEL_NAMES = {
  'َ': 'بالفتحة',
  'ُ': 'بالضمة',
  'ِ': 'بالكسرة',
  'ْ': 'ساكنة',
};

/**
 * Trouve le caractère du verset arabe sous les coordonnées écran (x, y).
 * Retourne { sura, aya, verseText, index, char } ou null si hors verset.
 */
function pickCharacterAt(x, y) {
  if (!document.caretPositionFromPoint) return null;
  const p = document.caretPositionFromPoint(x, y);
  if (!p) return null;
  const node = p.offsetNode;
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;

  // p.offset est la position du CARET (entre 2 caractères), pas l'index du
  // caractère cliqué. Pour trouver la bonne lettre, on teste les 2 candidats
  // autour du caret et on garde celui dont le rectangle contient (x, y).
  const containsClick = (ofs) => {
    if (ofs < 0 || ofs >= node.textContent.length) return false;
    const r = document.createRange();
    r.setStart(node, ofs);
    r.setEnd(node, ofs + 1);
    const rect = r.getBoundingClientRect();
    return (rect.width > 0 || rect.height > 0)
        && x >= rect.left && x <= rect.right
        && y >= rect.top  && y <= rect.bottom;
  };

  let offset = p.offset;
  if      (containsClick(offset))                            { /* OK */ }
  else if (containsClick(offset - 1))                        offset -= 1;
  // Repli si aucun rect ne contient strictement le clic (espaces, bordures…)
  else if (offset >= node.textContent.length)                offset = node.textContent.length - 1;
  else if (offset > 0)                                       offset -= 1;
  if (offset < 0 || offset >= node.textContent.length) return null;

  const verseDiv = node.parentElement && node.parentElement.closest('.verse');
  if (!verseDiv) return null;
  const verseText = verseDiv.dataset.text;
  if (!verseText) return null;

  // Reconstruit l'offset global dans le texte arabe ORIGINAL, en parcourant
  // les text nodes uniquement dans .verseBody (pour exclure l'en-tête).
  const body = verseDiv.querySelector('.verseBody');
  if (!body || !body.contains(node)) return null;

  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let acc = 0, n, found = false;
  while ((n = walker.nextNode())) {
    if (n === node) { acc += offset; found = true; break; }
    acc += n.textContent.length;
  }
  if (!found) return null;

  // Le DOM peut différer marginalement du texte original à cause des
  // injections de span ; on clampe pour éviter de sortir de la chaîne.
  if (acc >= verseText.length) acc = verseText.length - 1;
  if (acc < 0) return null;

  return {
    sura: +verseDiv.dataset.sura,
    aya:  +verseDiv.dataset.aya,
    verseText,
    index: acc,
    char: verseText[acc],
    node, offset,   // pour pouvoir re-sélectionner ce caractère via une Range
  };
}

/**
 * Place le marqueur visuel sous la lettre désignée.
 * Utilise un Range DOM pour obtenir le rectangle exact du caractère, qui
 * fonctionne même quand la lettre est dans un span surligné ou imbriqué.
 */
function highlightDesignatedLetter(target) {
  const marker = document.getElementById('designatedMarker');
  if (!marker) return;
  if (!target || !target.node) { marker.hidden = true; return; }
  try {
    const range = document.createRange();
    const len = target.node.textContent.length;
    const start = Math.min(target.offset, len);
    const end   = Math.min(start + 1, len);
    if (end <= start) { marker.hidden = true; return; }
    range.setStart(target.node, start);
    range.setEnd(target.node, end);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) { marker.hidden = true; return; }
    marker.style.left   = (rect.left   + window.scrollX) + 'px';
    marker.style.top    = (rect.top    + window.scrollY) + 'px';
    marker.style.width  = rect.width  + 'px';
    marker.style.height = rect.height + 'px';
    marker.hidden = false;
  } catch (e) {
    marker.hidden = true;
  }
}

/**
 * Décrit un caractère arabe lorsque aucune règle ne s'applique.
 * Si le pointeur est sur un diacritique, on remonte à la lettre porteuse.
 *
 * Exemples :
 *   كَ      → « حرف الكاف بالفتحة »
 *   قِّ      → « حرف القاف بالكسرة مشددة وهي مفخمة »
 *   نْ      → « حرف النون ساكنة »
 *   ٌ isolé → « تنوين بالضم »
 */
function describeCharacter(verseText, index) {
  let i = index;
  // Si on est sur un diacritique, remonter à la lettre porteuse précédente.
  while (i > 0 && isDiacritic(verseText[i])) i--;

  // Cas tanwin isolé (rare en pratique car il y a toujours une porteuse,
  // mais on garde la robustesse).
  if (isTanwin(verseText[i])) return TANWIN_NAMES[verseText[i]] || 'تنوين';

  const letter = verseText[i];
  if (!letter) return '';
  let letterName = LETTER_NAMES[letter] || letter;

  // Cas particulier : ى (alif maksoura, U+0649) joue le rôle de YA prolongé
  // quand la lettre précédente porte une kasra (ou kasratan). Pédagogiquement
  // on l'appelle alors « ياء » et non « ألف مقصورة ».
  // Exemples : فِى, ٱلَّتِى → ya  ;  هُدًى, فَتَوَلَّى → alif maksoura.
  if (letter === 'ى' && i > 0) {
    let k = i - 1;
    while (k >= 0 && isDiacritic(verseText[k])) {
      const m = verseText[k];
      if (m === 'ِ' || m === 'ٍ') { letterName = 'ياء'; break; }
      if (m === 'َ' || m === 'ً' || m === 'ُ' || m === 'ٌ') break;
      k--;
    }
  }

  // Diacritiques qui suivent la lettre
  const marks = [];
  let j = i + 1;
  while (j < verseText.length && isDiacritic(verseText[j])) { marks.push(verseText[j]); j++; }

  // Voyelle (le tanwin a priorité s'il est présent)
  let vowel = '';
  const tn = marks.find(isTanwin);
  if (tn)      vowel = TANWIN_NAMES[tn] || 'تنوين';
  else         for (const m of marks) { if (VOWEL_NAMES[m]) { vowel = VOWEL_NAMES[m]; break; } }

  const hasShadda  = marks.some(isShadda);
  const isEmphatic = EMPHATIC_LETTERS.has(letter);

  const parts = [`حرف ${letterName}`];
  if (vowel)      parts.push(vowel);
  if (hasShadda)  parts.push('مشددة');
  if (isEmphatic) parts.push('وهي مفخمة');
  return parts.join(' ');
}

/**
 * Tente de trouver une règle de tajwid qui s'applique au caractère à l'index
 * donné dans le verset. Pour la v1, on n'examine que les règles autour du
 * noun saakinah et du tanwin.
 *
 * @returns {{ ruleAr:string|null, ruleFr:string|null, ruleFn:Function|null, description:string, speech:string }}
 */
function analyzeAt(verseText, index) {
  const RULES = [
    { fn: applyIzharRule,          ar: 'إظهار',          fr: 'Izhar' },
    { fn: applyIkhfaRule,          ar: 'إخفاء',          fr: 'Ikhfa' },
    { fn: applyIdghamGhounaRule,   ar: 'إدغام بغنة',     fr: 'Idgham avec ghouna' },
    { fn: applyIdghamNoGhounaRule, ar: 'إدغام بغير غنة', fr: 'Idgham sans ghouna' },
    { fn: applyIqlabRule,          ar: 'إقلاب',          fr: 'Iqlab' },
    { fn: findKalkalaInVerse,      ar: 'قلقلة',          fr: 'Qalqala' },
    { fn: applyIdghamShafawiRule,  ar: 'إدغام شفوي',     fr: 'Idgham shafawi' },
    { fn: applyIkhfaShafawiRule,   ar: 'إخفاء شفوي',     fr: 'Ikhfa shafawi' },
    { fn: applyIzharShafawiRule,   ar: 'إظهار شفوي',     fr: 'Izhar shafawi' },
    { fn: applyMimSheddaRule,      ar: 'ميم مشددة',      fr: 'Mim mushaddada' },
    // triggerOnStart = la règle ne matche que si on a cliqué sur la lettre
    // principale (le 1er caractère du hit), pas sur le ya/waw/alif de
    // prolongation qui suit. Adapté aux règles de mad.
    { fn: applyMadAsliRule,        ar: 'مد طبيعي',       fr: 'Mad at-tabiʼi', triggerOnStart: true },
    { fn: applyMadBadalRule,       ar: 'مد بدل',         fr: 'Mad al-badal',  triggerOnStart: true },
    { fn: applyMadIwadRule,        ar: 'مد عوض',         fr: 'Mad al-iwad',   triggerOnStart: true },
    { fn: applySilatuSuraRule,     ar: 'صلة صغرى',       fr: 'Silatu sughra', triggerOnStart: true },
    { fn: applyMouttasil,          ar: 'مد متصل',        fr: 'Mad muttasil',  triggerOnStart: true },
    { fn: applyMounfasil,          ar: 'مد منفصل',       fr: 'Mad munfasil',  triggerOnStart: true },
    { fn: applySilatuKubraRule,    ar: 'صلة كبرى',       fr: 'Silatu kubra',  triggerOnStart: true },
    { fn: applyLaazim_K_Thaqqal,   ar: 'مد لازم كلمي مثقل',  fr: 'Mad lazim kalami mouthaqqal', triggerOnStart: true },
    { fn: applyLaazim_K_Khaffaf,   ar: 'مد لازم كلمي مخفف',  fr: 'Mad lazim kalami moukhaffaf', triggerOnStart: true },
    { fn: applyLaazim_H_Thaqqal,   ar: 'مد لازم حرفي مثقل',  fr: 'Mad lazim harfi mouthaqqal',  triggerOnStart: true },
    { fn: applyLaazim_H_Khaffaf,   ar: 'مد لازم حرفي مخفف',  fr: 'Mad lazim harfi moukhaffaf',  triggerOnStart: true },
    { fn: applyWaqfSoukounRule,    ar: 'مد عارض للسكون',  fr: 'Mad ʿarid lis-sukoun',         triggerOnStart: true },
    // Noun mushaddada AVANT lam shamsiya : sinon, clic sur le ن de ٱلنَّاسِ
    // renverrait « lam shamsiya » alors que c'est le ن qui porte la shadda.
    // Les patterns plus spécifiques (3 chars sur le ن) gagnent contre les
    // patterns plus larges (4 chars ٱل + lettre solaire).
    { fn: applyNounSheddaRule,     ar: 'نون مشددة',       fr: 'Noun mushaddada' },
    // Lam shamsi/qamari : pas de triggerOnStart, le clic sur ٱ, ل ou la
    // lettre suivante (solaire/lunaire) déclenche la détection.
    { fn: applyLamShamsiRule,      ar: 'لام شمسية',       fr: 'Lam shamsiya' },
    { fn: applyLamQamariRule,      ar: 'لام قمرية',       fr: 'Lam qamariya' },
  ];
  // Si le clic est tombé sur un diacritique (fatha, damma, sukun…), on
  // remonte à la lettre porteuse pour la recherche de règle. Sinon une
  // qalqala sur le د de ٱلصَّمَدُ ne serait pas détectée quand on clique pile
  // sur la damma au-dessus.
  let searchIndex = index;
  while (searchIndex > 0 && isDiacritic(verseText[searchIndex])) searchIndex--;

  const makeResult = (rule, hit) => {
    const description = hit.speech || describeOccurrence(verseText.substr(hit.index, hit.length));
    return {
      ruleAr: rule.ar,
      ruleFr: rule.fr,
      ruleFn: rule.fn,
      hit,                   // le hit précis (index/length) pour colorier UNIQUEMENT cette occurrence
      description,
      speech: `${rule.ar}. ${description}`,
    };
  };

  // Cas particulier : si le hit.index tombe sur un diacritique (typ. la
  // shadda d'une lettre avec mad lazim mouthaqqal comme ٱلضَّآلِّينَ), la
  // VRAIE lettre principale est juste AVANT hit.index. On accepte donc
  // aussi un clic sur une lettre qui n'est séparée de hit.index que par
  // des diacritiques (forward walk).
  //
  // IMPORTANT : on exige que hit.index lui-même soit un diacritique.
  // Si hit.index est une lettre, c'est une lettre différente du clic
  // (par ex. ف après خْ) → on ne doit PAS matcher.
  const reachesHitStart = (clickPos, hit) => {
    if (clickPos >= hit.index) return false;
    if (!isDiacritic(verseText[hit.index])) return false;
    for (let p = clickPos + 1; p < hit.index; p++) {
      if (!isDiacritic(verseText[p])) return false;
    }
    return true;
  };

  // Deux passes pour gérer la priorité spécifique > large.
  //
  // Pass 1 — règles avec triggerOnStart (mads, silatu, etc.) : la lettre
  // cliquée doit être EXACTEMENT la lettre principale du hit. Plus spécifique
  // que les règles de plage (idgham/ikhfa/iqlab) qui englobent plusieurs
  // lettres. Exemple : sur le مِ de مِن مَّآءٍ, le clic sur le mim qui suit
  // (lettre principale du mad muttasil) doit retourner « mad muttasil »
  // plutôt que l'idgham qui inclut ce mim dans sa plage.
  //
  // Pass 2 — règles à plage large : un clic n'importe où dans [index, end)
  // matche. Ne s'exécute QUE si aucune règle spécifique n'a déjà matché.
  for (const rule of RULES) {
    if (!rule.triggerOnStart) continue;
    const hits = rule.fn(verseText) || [];
    for (const hit of hits) {
      const inHit = index === hit.index || searchIndex === hit.index
                 || reachesHitStart(index, hit) || reachesHitStart(searchIndex, hit);
      if (inHit) return makeResult(rule, hit);
    }
  }
  for (const rule of RULES) {
    if (rule.triggerOnStart) continue;
    const hits = rule.fn(verseText) || [];
    for (const hit of hits) {
      const hitEnd = hit.index + hit.length;
      const inHit = (index       >= hit.index && index       < hitEnd)
                 || (searchIndex >= hit.index && searchIndex < hitEnd);
      if (inHit) return makeResult(rule, hit);
    }
  }
  // Aucune règle ne s'applique : on décrit juste le caractère
  const description = describeCharacter(verseText, index);
  return { ruleAr: null, ruleFr: null, ruleFn: null, description, speech: description };
}

/**
 * Applique UNE seule occurrence d'une règle (le hit qui contient la lettre
 * désignée) sur le verset contenant la lettre. Les autres versets de la
 * page et les autres occurrences de la règle restent inchangés.
 *
 * Re-render le .verse avec ce seul hit → la coloration rouge, le voile
 * .tajweed-overlay (avec la loupe au survol) et la possibilité de jouer
 * l'audio du mot au clic gauche sont restaurés pour ce mot précis.
 */
function applyHitToDesignatedVerse(designated, hit) {
  if (!designated || !hit) return;
  const verseDiv = document.querySelector(
    `#quranContent .verse[data-sura="${designated.sura}"][data-aya="${designated.aya}"]`
  );
  if (!verseDiv) return;
  const text = verseDiv.dataset.text;
  if (!text) return;
  const newDiv = renderVerseWithHighlight(
    { sura: designated.sura, aya: designated.aya, text },
    [hit]
  );
  verseDiv.replaceWith(newDiv);
  bindAudioOnOverlay(true);
}

/**
 * Met à jour le panneau d'analyse et déclenche la lecture vocale.
 * Accepte un objet { ruleAr, ruleFr, description, speech }.
 */
function showAnalysis(result) {
  if (!result) return;
  const ruleDiv = document.getElementById('analysisRule');
  const txtDiv  = document.getElementById('analysisText');
  if (ruleDiv) {
    ruleDiv.textContent = result.ruleAr
      ? `${result.ruleAr}  /  ${result.ruleFr}`
      : '';
  }
  if (txtDiv) txtDiv.textContent = result.description;
  updateClearAnalysisBtnVisibility();
  speakText(result.speech);
}

/**
 * Vide le panneau d'analyse, masque le marqueur de lettre désignée,
 * et retire les effets couleur/loupe (.tajweed-letter) sur les versets
 * qui ont été coloriés par une détection précédente, en les re-rendant
 * sans hit.
 */
function clearAnalysisAndHighlights() {
  // 1) coupe toute lecture vocale en cours
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  if (window._currentQuranAudio) {
    clearTimeout(window._currentQuranAudio._pauseTimer);
    window._currentQuranAudio.pause();
    window._currentQuranAudio = null;
  }

  // 2) vide le panneau d'analyse
  const ruleDiv = document.getElementById('analysisRule');
  const txtDiv  = document.getElementById('analysisText');
  if (ruleDiv) ruleDiv.textContent = '';
  if (txtDiv)  txtDiv.textContent  = '';

  // 3) masque le marqueur de lettre désignée
  const marker = document.getElementById('designatedMarker');
  if (marker) marker.hidden = true;

  // 4) retire couleur/loupe : pour chaque .verse contenant un .tajweed-letter,
  //    re-render le verset sans hit (récupère sura/aya/text depuis data-*)
  const colored = new Set();
  document.querySelectorAll('#quranContent .verse .tajweed-letter')
    .forEach(el => {
      const v = el.closest('.verse');
      if (v) colored.add(v);
    });
  colored.forEach(verseDiv => {
    const sura = +verseDiv.dataset.sura;
    const aya  = +verseDiv.dataset.aya;
    const text = verseDiv.dataset.text;
    if (!text) return;
    const newDiv = renderVerseWithHighlight({ sura, aya, text }, []);
    verseDiv.replaceWith(newDiv);
  });

  updateClearAnalysisBtnVisibility();
}

/**
 * Affiche le bouton ✕ uniquement s'il y a quelque chose à effacer
 * (texte dans le panneau OU couleur/loupe active dans la page).
 */
function updateClearAnalysisBtnVisibility() {
  const btn = document.getElementById('clearAnalysisBtn');
  if (!btn) return;
  const ruleDiv = document.getElementById('analysisRule');
  const txtDiv  = document.getElementById('analysisText');
  const hasText = (ruleDiv && ruleDiv.textContent.trim() !== '')
               || (txtDiv  && txtDiv.textContent.trim()  !== '');
  const hasColor = !!document.querySelector('#quranContent .verse .tajweed-letter');
  btn.style.display = (hasText || hasColor) ? 'block' : 'none';
}

// ─────────────────────────────────────────────────────────────────────────
// ÉTYMOLOGIE — V1 : verbes uniquement
//
// Quand le mode étymologie est ON et qu'on clique sur un mot, on identifie
// le numéro de mot dans le verset (1-indexé, convention Quranic Arabic
// Corpus), on interroge morphology.php, et on affiche racine + forme + lemme
// dans le panneau, plus une lecture TTS des lettres de la racine.
// ─────────────────────────────────────────────────────────────────────────

// Renvoie { wordPos, wordStart, wordLength } pour la position cliquée dans
// le texte du verset. wordPos est 1-indexé (1er mot = 1).
function wordPositionFromIndex(verseText, clickIndex) {
  const offsets = computeOffsets(verseText);
  for (let i = 0; i < offsets.length; i++) {
    const { start, length } = offsets[i];
    if (clickIndex >= start && clickIndex < start + length) {
      return { wordPos: i + 1, wordStart: start, wordLength: length };
    }
  }
  return null;
}

async function fetchEtymology(sura, aya, wordPos) {
  try {
    const res = await fetch(`morphology.php?sura=${sura}&aya=${aya}&word=${wordPos}`);
    if (res.status === 404) return { notVerb: true };
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return await res.json();
  } catch (e) {
    return { error: e.message || 'fetch failed' };
  }
}

// I-X en chiffres romains. NULL en base = Form I implicite.
function verbFormRoman(num) {
  const map = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];
  return num ? map[num - 1] : 'I';
}

// Wazn (وزن) du passé (الماضي) et du présent (المضارع) pour chaque forme
// verbale — affichés ensemble pour permettre à l'utilisateur de reconnaître
// la forme du verbe du verset (qui peut être au passé OU au présent).
// Référence : la table classique de dérivation trilitère (الفعل المجرد ومزيداته).
// Pour la Forme I, le présent a 3 variantes (يَفْعُلُ, يَفْعِلُ, يَفْعَلُ) selon
// le verbe — on affiche la plus commune (يَفْعُلُ) par défaut, peut être faux.
const WAZN_PAST_ABSTRACT = {
  1:  'فَعَلَ',          2:  'فَعَّلَ',         3:  'فَاعَلَ',
  4:  'أَفْعَلَ',         5:  'تَفَعَّلَ',        6:  'تَفَاعَلَ',
  7:  'اِنْفَعَلَ',        8:  'اِفْتَعَلَ',       9:  'اِفْعَلَّ',
  10: 'اِسْتَفْعَلَ',
};
const WAZN_PRESENT_ABSTRACT = {
  1:  'يَفْعُلُ',         2:  'يُفَعِّلُ',         3:  'يُفَاعِلُ',
  4:  'يُفْعِلُ',          5:  'يَتَفَعَّلُ',        6:  'يَتَفَاعَلُ',
  7:  'يَنْفَعِلُ',         8:  'يَفْتَعِلُ',         9:  'يَفْعَلُّ',
  10: 'يَسْتَفْعِلُ',
};

// Wazn passé : retourne le wazn abstrait approprié au nombre de lettres
// de la racine. Trilitère = WAZN_PAST_ABSTRACT, quadrilitère = فَعْلَلَ (Form I).
function computeWaznPast(formNum, rootAr) {
  if (formNum === 1 && rootAr) {
    const L = rootAr.split(/\s+/).filter(Boolean);
    if (L.length === 4) return 'فَعْلَلَ';   // quadrilitère Form I
  }
  return WAZN_PAST_ABSTRACT[formNum];
}

// Wazn présent — pour Form I, on retourne le wazn ABSTRAIT (avec ف/ع/ل
// visibles) plutôt que la forme surface. La voyelle opérative (fatha/damma/
// kasra) est détectée depuis la forme présente réelle de Qutrub :
//   ك ي د → يَكِيدُ : kasra sur R1 → wazn يَفْعِلُ
//   ق و ل → يَقُولُ : damma sur R1 → wazn يَفْعُلُ
//   ك ت ب → يَكْتُبُ : damma sur R2 → wazn يَفْعُلُ
//   ن ز ل → يَنْزِلُ : kasra sur R2 → wazn يَفْعِلُ
//   ذ ه ب → يَذْهَبُ : fatha sur R2 → wazn يَفْعَلُ
// Cas spéciaux : géminé (يَفُلُّ), défectueux (يَفْعِي/يَفْعُو), Lafif.
// Quadrilitère Form I : يُفَعْلِلُ (وَسْوَسَ → يُوَسْوِسُ, زَلْزَلَ → يُزَلْزِلُ).
function computeWaznPresent(formNum, rootAr, presentForm) {
  const abstract = WAZN_PRESENT_ABSTRACT[formNum];
  if (!rootAr) return abstract;
  const L = rootAr.split(/\s+/).filter(Boolean);
  // Quadrilitère (4 lettres) → Form I = يُفَعْلِلُ
  if (L.length === 4 && formNum === 1) return 'يُفَعْلِلُ';
  if (L.length !== 3) return abstract;
  const [r1, r2, r3] = L;
  const r2_weak = r2 === 'و' || r2 === 'ي';
  const r3_weak = r3 === 'و' || r3 === 'ي';

  if (formNum === 1) {
    if (r2 === r3)          return 'يَفُلُّ';                      // géminé
    if (r2_weak && r3_weak) return r3 === 'ي' ? 'يَفْعِي' : 'يَفْعُو'; // Lafif مقرون
    // Sain, creux, défectueux, مثال, لفيف مفروق : détection commune de la
    // voyelle opérative depuis la forme surface. On retourne TOUJOURS le
    // wazn abstrait (يَفْعُلُ/يَفْعِلُ/يَفْعَلُ avec ل visible).
    if (presentForm) {
      // R1 peut apparaître sous variantes hamza (ا/أ/إ/آ) dans la forme
      // surface alors que la racine du corpus a la version "abstraite"
      // (souvent ا). On normalise pour la recherche.
      const hamzas = new Set(['ا', 'أ', 'إ', 'آ']);
      const sameLetter = (a, b) => a === b || (hamzas.has(a) && hamzas.has(b));
      const r1_weak = r1 === 'و' || r1 === 'ي';
      // Essai 1 : ancrer sur R1 (cas usuels où R1 est visible au présent).
      let idx = -1;
      for (let i = 1; i < presentForm.length; i++) {
        if (sameLetter(presentForm[i], r1)) { idx = i; break; }
      }
      // Essai 2 : si R1 introuvable ET R1 faible (chute typique des مثال
      // و ج د → ي ج د, et des لفيف مفروق و ح ي → ي ح ي), on bascule sur R2.
      // La 1ère voyelle trouvée après R2 est alors directement la voyelle
      // opérative cherchée (يَفْعِلُ pour يَحِي, يَفْعِلُ pour يَجِدُ, etc.).
      if (idx < 0 && r1_weak) {
        for (let i = 1; i < presentForm.length; i++) {
          if (sameLetter(presentForm[i], r2)) { idx = i; break; }
        }
      }
      if (idx >= 0) {
        for (let i = idx + 1; i < presentForm.length; i++) {
          const c = presentForm[i];
          if (c === 'َ') return 'يَفْعَلُ';
          if (c === 'ُ') return 'يَفْعُلُ';
          if (c === 'ِ') return 'يَفْعِلُ';
          // sukoon, shadda, lettres : on continue
        }
      }
    }
    return abstract;
  }
  // Forms II-X : wazn abstrait suffit (la forme surface est très proche)
  return abstract;
}

// V2 : les conjugaisons (passé, présent, impératif, masdar) sont désormais
// pré-calculées par Qutrub dans la table quran_verb_canonical (voir
// morphology/enrich_with_qutrub.py). Le JS lit simplement data.past_3ms,
// data.present_3ms, data.imperative_2ms, data.masdar depuis la réponse JSON
// de morphology.php (qui fait un LEFT JOIN avec quran_verb_canonical).

// Classification du verbe trilitère selon la planche pédagogique classique
// (catégories MUTUELLEMENT EXCLUSIVES) :
//
//   الفعل
//   ├── صحيح (aucune lettre faible و/ي en racine)
//   │   ├── سالم    (pas de hamza, R2 ≠ R3)
//   │   ├── مضعف   (R2 == R3)
//   │   └── مهموز   (au moins une hamza — encodée ا/أ/إ/آ/ؤ/ئ)
//   └── معتل (au moins une lettre faible و/ي)
//       ├── مثال   (R1 faible)
//       ├── أجوف   (R2 faible)
//       ├── ناقص   (R3 faible)
//       └── لفيف   (≥ 2 lettres faibles)
//
// Le corpus encode toute hamza-racine par 'ا' (jamais d'alif "vrai" en racine).
// Conséquence : أَخَذَ (ا خ ذ) → فعل صحيح مهموز.
//
// Retourne { branch: 'صحيح'|'معتل', sub: 'سالم'|... } ou null.
function classifyVerb(rootAr) {
  if (!rootAr) return null;
  const L = rootAr.split(/\s+/).filter(Boolean);
  // ─── Racine quadrilitère (4 lettres) — branche رباعي ────────────────
  if (L.length === 4) {
    const [a, b, c, d] = L;
    // مضعف رباعي : R1=R3 et R2=R4 (وَسْوَسَ, زَلْزَلَ, دَمْدَمَ)
    if (a === c && b === d) return { branch: 'صحيح', sub: 'مضعف رباعي' };
    return { branch: 'صحيح', sub: 'رباعي' };
  }
  if (L.length !== 3) return null;
  const [r1, r2, r3] = L;
  // و, ي = vraies lettres faibles. ا en position racine = encodage de hamza
  // dans le corpus. ء/أ/إ/آ/ؤ/ئ idem.
  const isWeak  = c => c === 'و' || c === 'ي';
  const isHamza = c => c === 'ا' || 'ءأإآؤئ'.includes(c);

  const r1W = isWeak(r1), r2W = isWeak(r2), r3W = isWeak(r3);
  const weakCount = (r1W ? 1 : 0) + (r2W ? 1 : 0) + (r3W ? 1 : 0);

  // ─── Branche معتل (au moins une lettre faible و/ي) ──────────────────
  if (weakCount >= 2) return { branch: 'معتل', sub: 'لفيف' };
  if (weakCount >= 1) {
    if (r1W) return { branch: 'معتل', sub: 'مثال' };
    if (r2W) return { branch: 'معتل', sub: 'أجوف' };
    if (r3W) return { branch: 'معتل', sub: 'ناقص' };
  }
  // ─── Branche صحيح (aucune lettre faible) ────────────────────────────
  if (r2 === r3)                                       return { branch: 'صحيح', sub: 'مضعف' };
  if (isHamza(r1) || isHamza(r2) || isHamza(r3))       return { branch: 'صحيح', sub: 'مهموز' };
  return { branch: 'صحيح', sub: 'سالم' };
}

const ETY_FEATURE_FR = {
  PERF: 'accompli', IMPF: 'inaccompli', IMPV: 'impératif',
  PASS: 'passif',  ACT:  'actif',
  '1S':  '1re pers. sing.',  '1P':  '1re pers. plur.',
  '2MS': '2e pers. m. sing.', '2MP': '2e pers. m. plur.',
  '2FS': '2e pers. f. sing.', '2FP': '2e pers. f. plur.',
  '3MS': '3e pers. m. sing.', '3MP': '3e pers. m. plur.',
  '3FS': '3e pers. f. sing.', '3FP': '3e pers. f. plur.',
  '2D':  '2e pers. duel', '3D': '3e pers. duel',
  'MOOD:IND': 'indicatif', 'MOOD:SUBJ': 'subjonctif', 'MOOD:JUS': 'jussif',
};
function formatFeaturesFr(features) {
  if (!features) return '';
  return features.split('|').map(t => ETY_FEATURE_FR[t] || t).join(', ');
}

// Version arabe des features — beaucoup plus parlante en contexte
// d'apprentissage de l'arabe coranique. Affichée en priorité, avec la
// version française gardée en sous-ligne plus petite.
const ETY_TENSE_AR = {
  PERF: 'ماضي',
  IMPF: 'مضارع',
  IMPV: 'أمر',
};
const PRONOUN_AR = {
  '1S':  'أنا',   '1P':  'نحن',
  '2MS': 'أنتَ',   '2MP': 'أنتم',
  '2FS': 'أنتِ',   '2FP': 'أنتنّ',
  '3MS': 'هو',    '3MP': 'هم',
  '3FS': 'هي',    '3FP': 'هنّ',
  '2D':  'أنتما', '3D':  'هما',
};
function formatFeaturesAr(features) {
  if (!features) return '';
  const tags = features.split('|');
  const parts = [];
  // Temps : ماضي / مضارع / أمر
  for (const t of tags) {
    if (ETY_TENSE_AR[t]) { parts.push(ETY_TENSE_AR[t]); break; }
  }
  // Voix : on n'affiche que مبني للمجهول (le مبني للمعلوم est le défaut, implicite)
  if (tags.includes('PASS')) parts.push('مبني للمجهول');
  // Pronom + rôle approprié : الفاعل (actif), نائب الفاعل (passif), المخاطب (impératif)
  for (const t of tags) {
    if (PRONOUN_AR[t]) {
      let label;
      if (tags.includes('IMPV'))      label = 'المخاطب';
      else if (tags.includes('PASS')) label = 'نائب الفاعل';
      else                            label = 'الفاعل';
      parts.push(`${label}: ${PRONOUN_AR[t]}`);
      break;
    }
  }
  return parts.join(' · ');
}

// Construction du TTS en 2 segments distincts (ligne 1 / ligne 2) pour
// permettre un highlight visuel synchronisé : chaque segment correspond
// à un bloc DOM dans le panneau d'analyse.

function buildRootSpeechLine1(rootAr, base, cls, waznPastF1, waznPresF1) {
  const letters = rootAr.split(/\s+/).filter(Boolean);
  const names = letters.map(l => (typeof LETTER_NAMES !== 'undefined' && LETTER_NAMES[l]) || l);
  let phrase = `جذر ${names.join(' ')}`;
  if (base && base.past_3ms) {
    const tri = [base.past_3ms, base.present_3ms].filter(Boolean).join(' — ');
    phrase += `. ${tri}`;
  }
  if (cls && cls.branch && cls.sub) {
    phrase += `. فعل ${cls.branch} ${cls.sub}`;
  }
  if (waznPastF1) phrase += `. وزن الماضي ${waznPastF1}`;
  if (waznPresF1) phrase += `. وزن المضارع ${waznPresF1}`;
  return phrase;
}

function buildRootSpeechLine2(data, waznPast, waznPres, base, isFormIActive) {
  let phrase = `الفعل`;
  if (waznPast) phrase += `. وزن الماضي ${waznPast}`;
  if (waznPres) phrase += `. وزن المضارع ${waznPres}`;
  if (data) {
    const past   = data.past_3ms       || data.lemma_ar || null;
    const pres   = data.present_3ms    || null;
    const impv   = data.imperative_2ms || null;
    const masdar = data.masdar         || null;
    if (past)   phrase += `. الماضي ${past}`;
    if (pres)   phrase += `. المضارع ${pres}`;
    if (impv)   phrase += `. الأمر ${impv}`;
    if (masdar) phrase += `. المصدر ${masdar}`;
    const actP  = data.active_participle  || null;
    const passP = data.passive_participle || null;
    if (actP)   phrase += `. اسم الفاعل ${actP}`;
    if (passP)  phrase += `. اسم المفعول ${passP}`;
  }
  if (!isFormIActive && base && base.past_3ms) {
    phrase += `. مشتق من ${base.past_3ms}`;
  }
  return phrase;
}

// Walk les text nodes de `rootEl`, enveloppe chaque mot dans un
// <span class="ety-word">, et retourne la liste des spans créés dans l'ordre.
// Ignore les tokens purement ponctuation (·, —, :, ...) pour qu'ils ne
// soient pas surlignés comme des mots.
const _PUNCT_ONLY_RE = /^[·—:.,;\-]+$/;
function wrapWordsInElement(rootEl) {
  if (!rootEl) return [];
  const spans = [];
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
  const textNodes = [];
  let n;
  while ((n = walker.nextNode())) textNodes.push(n);

  for (const tn of textNodes) {
    const text = tn.nodeValue;
    if (!text || !text.trim()) continue;
    const parent = tn.parentNode;
    if (!parent) continue;
    if (parent.classList && parent.classList.contains('ety-word')) continue;
    const parts = text.split(/(\s+)/);
    const frag = document.createDocumentFragment();
    for (const part of parts) {
      if (!part) continue;
      if (/^\s+$/.test(part) || _PUNCT_ONLY_RE.test(part)) {
        frag.appendChild(document.createTextNode(part));
      } else {
        const sp = document.createElement('span');
        sp.className = 'ety-word';
        sp.textContent = part;
        frag.appendChild(sp);
        spans.push(sp);
      }
    }
    parent.replaceChild(frag, tn);
  }
  return spans;
}

// Lit une séquence [{text, el}] : chaque élément DOM reçoit la classe
// `ety-reading` pendant que son texte associé est en cours de lecture TTS,
// et chaque mot visible est surligné à tour de rôle en fonction de la
// progression de l'audio (timing estimé proportionnellement à la longueur
// en caractères de chaque mot).
async function speakLinesWithHighlight(segments) {
  for (const seg of segments) {
    if (!seg.text) continue;
    if (seg.el) seg.el.classList.add('ety-reading');
    const wordSpans = seg.el ? wrapWordsInElement(seg.el) : [];
    const wordChars = wordSpans.map(s => Math.max(1, s.textContent.length));
    const totalChars = wordChars.reduce((a,b) => a+b, 0) || 1;
    // cumChars[i] = nb total de chars jusqu'à la fin du mot i (inclus)
    const cumChars = []; { let acc = 0; for (const c of wordChars) { acc += c; cumChars.push(acc); } }
    let activeIdx = -1;
    const setActive = (idx) => {
      if (idx === activeIdx) return;
      if (activeIdx >= 0 && wordSpans[activeIdx]) wordSpans[activeIdx].classList.remove('ety-word-active');
      activeIdx = idx;
      if (activeIdx >= 0 && wordSpans[activeIdx]) wordSpans[activeIdx].classList.add('ety-word-active');
    };
    const onProgress = wordSpans.length ? (ratio) => {
      const target = ratio * totalChars;
      let idx = 0;
      while (idx < cumChars.length && cumChars[idx] < target) idx++;
      if (idx >= wordSpans.length) idx = wordSpans.length - 1;
      setActive(idx);
    } : null;
    try {
      await speakText(seg.text, { onProgress });
    } finally {
      setActive(-1);
      if (seg.el) seg.el.classList.remove('ety-reading');
    }
  }
}

function showEtymologyAnalysis(data) {
  const ruleDiv = document.getElementById('analysisRule');
  const txtDiv  = document.getElementById('analysisText');
  if (!ruleDiv || !txtDiv) return;

  // Stash morpho pour le chat (utilisé comme contexte fiable par Claude)
  if (data && !data.error && !data.notVerb) {
    window._chatContext = window._chatContext || {};
    window._chatContext.morpho = data;
    if (data.word_ar) window._chatContext.word = data.word_ar;
    if (typeof updateChatContextLabel === 'function') updateChatContextLabel();
  }

  if (!data || data.error || data.notVerb) {
    ruleDiv.textContent = '';
    txtDiv.textContent  = data && data.notVerb
      ? 'Ce mot n’est pas un verbe (V1 — verbes uniquement).'
      : 'Étymologie indisponible.';
    updateClearAnalysisBtnVisibility();
    return;
  }

  const formNum    = data.verb_form || 1;        // NULL en base = Form I
  const isFormI    = formNum === 1;
  const isPassive  = (data.features || '').includes('PASS');
  const featuresAr = formatFeaturesAr(data.features);
  const featuresFr = formatFeaturesFr(data.features);

  // Wazns du verbe CORANIQUE (la forme effectivement dans le verset).
  // computeWaznPast/Present prennent en compte le nombre de lettres de la
  // racine (trilitère vs quadrilitère).
  const waznPast = computeWaznPast(formNum, data.root_ar);
  const waznPres = computeWaznPresent(formNum, data.root_ar, data.present_3ms);

  // Masdar et participes : convention dictionnaire — tanwin damma ٌ pour
  // marquer l'indéfini nominatif. Mais on N'ajoute PAS de tanwin si la
  // forme est défectueuse (déjà se termine en ٍ/ً/ى).
  const withTanwin = (s) => {
    if (!s) return null;
    if (/[ًٌٍ]$/.test(s)) return s;
    if (s.endsWith('ى')) return s;
    return s + 'ٌ';
  };

  // Classification morpho du verbe trilitère (sain/creux/...)
  const cls = classifyVerb(data.root_ar);

  // ─── LIGNE 1 : la racine et son verbe Form I de base ────────────────
  // Soit on EST une Form I active (le verbe = sa propre base), soit on
  // a la Form I de la racine dans form1_base (envoyé par morphology.php).
  // Sinon (Form I absente du Coran pour cette racine), on affiche juste
  // racine + classification + wazns abstraits sans verbe trilitère réel.
  const isFormIActive = isFormI && !isPassive;
  const base = isFormIActive
    ? { past_3ms: data.past_3ms, present_3ms: data.present_3ms,
        imperative_2ms: data.imperative_2ms, masdar: data.masdar,
        active_participle: data.active_participle,
        passive_participle: data.passive_participle }
    : (data.form1_base || null);

  // Wazns de la Form I (trilitère فَعَلَ — يَفْعُ/عِ/عَلُ, ou quadrilitère فَعْلَلَ — يُفَعْلِلُ)
  const waznPastF1 = computeWaznPast(1, data.root_ar);
  const waznPresF1 = computeWaznPresent(1, data.root_ar, base ? base.present_3ms : null);

  // ─── LIGNE 1 : "جذر:" + racine + verbe trilitère + classification + wazn Form I ────
  // Affichage 100% arabe (pas de caractères latins).
  const line1Parts = [];
  if (base && base.past_3ms) {
    const triliterePieces = [base.past_3ms, base.present_3ms].filter(Boolean).join(' — ');
    line1Parts.push(`<span class="ety-trilitere">${triliterePieces}</span>`);
  }
  if (cls) {
    // "فعل صحيح مهموز" / "فعل معتل أجوف" etc. — texte simple, même style que les wazns
    line1Parts.push(`<span class="ety-class">فعل ${cls.branch} ${cls.sub}</span>`);
  }
  const waznsF1 = [waznPastF1, waznPresF1].filter(Boolean).join(' — ');
  if (waznsF1) {
    line1Parts.push(`<span class="ety-wazn">${waznsF1}</span>`);
  }
  const line1Html =
    `<div class="ety-line ety-line-root">` +
      `<span class="ety-header">جذر:</span> ` +
      `<span class="ety-root">${data.root_ar}</span>` +
      (line1Parts.length ? ' · ' + line1Parts.join(' · ') : '') +
    `</div>`;

  // ─── LIGNE 2 : "الفعل:" + wazn du verbe coranique + conjugaisons + participes ──
  const pastForm  = data.past_3ms          || data.lemma_ar || null;
  const presForm  = data.present_3ms       || null;
  const imperForm = data.imperative_2ms    || null;
  const masdar    = withTanwin(data.masdar);
  const actPart   = withTanwin(data.active_participle);
  const passPart  = withTanwin(data.passive_participle);

  const conjParts = [];
  if (pastForm)  conjParts.push(`الماضي: ${pastForm}`);
  if (presForm)  conjParts.push(`المضارع: ${presForm}`);
  if (imperForm) conjParts.push(`الأمر: ${imperForm}`);
  if (masdar)    conjParts.push(`المصدر: ${masdar}`);
  const partParts = [];
  if (actPart)   partParts.push(`اسم الفاعل: ${actPart}`);
  if (passPart)  partParts.push(`اسم المفعول: ${passPart}`);

  // Wazns du verbe CORANIQUE (= wazn de la forme cliquée).
  // Pour Form I, c'est le même que la ligne 1 (répétition assumée).
  // Pour Forms II-X, c'est le wazn spécifique (اِفْتَعَلَ — يَفْتَعِلُ, etc.).
  const waznsCurrent = [waznPast, waznPres].filter(Boolean).join(' — ');

  const subLines = [];
  if (waznsCurrent)     subLines.push(`<span class="ety-wazn">${waznsCurrent}</span>`);
  if (conjParts.length) subLines.push(conjParts.join(' · '));
  if (partParts.length) subLines.push(partParts.join(' · '));
  // "مشتق من" : uniquement pour les Forms II-X (pas pour Form I active où le
  // verbe coranique = verbe Form I = racine).
  if (!isFormIActive && base && base.past_3ms) {
    subLines.push(`<span class="ety-derived">مشتق من ${base.past_3ms}</span>`);
  }

  const line2Html =
    `<div class="ety-line ety-line-verb">` +
      `<span class="ety-header">الفعل:</span> ` +
      subLines.map(s => `<span class="ety-morph-line">${s}</span>`).join('') +
    `</div>`;

  ruleDiv.innerHTML = line1Html + line2Html;

  // analysisText : features morpho arabe (préfixées par "اعراب:")
  // + sous-ligne FR plus petite
  let html = '';
  if (featuresAr) {
    html = `<span class="ety-header">اعراب:</span> ${featuresAr}`;
  }
  if (featuresFr) {
    html += `<span class="ety-fr-line">${featuresFr}</span>`;
  }
  txtDiv.innerHTML = html;
  updateClearAnalysisBtnVisibility();

  // TTS : 3 segments avec highlight ligne par ligne
  // Segment 1 = ligne 1 (جذر), Segment 2 = ligne 2 (الفعل), Segment 3 = اعراب
  const speech1 = buildRootSpeechLine1(data.root_ar, base, cls, waznPastF1, waznPresF1);
  const speech2 = buildRootSpeechLine2(data, waznPast, waznPres, base, isFormIActive);
  const speech3 = featuresAr ? `اعراب. ${featuresAr}` : '';
  const line1Div = ruleDiv.querySelector('.ety-line-root');
  const line2Div = ruleDiv.querySelector('.ety-line-verb');
  speakLinesWithHighlight([
    { text: speech1, el: line1Div },
    { text: speech2, el: line2Div },
    { text: speech3, el: txtDiv },
  ]);
}

/**
 * Pose les bindings :
 *  - clic droit dans une .verse → affiche le menu contextuel
 *  - clic ailleurs → ferme le menu
 *  - clic sur un item du menu → exécute l'action correspondante
 *
 * À appeler UNE seule fois (le menu et #quranContent sont permanents).
 */
function bindContextDetection() {
  const content = document.getElementById('quranContent');
  const menu    = document.getElementById('ctxMenu');
  if (!content || !menu) return;

  // La « lettre désignée » est posée par un clic gauche sur une lettre.
  // Elle reste mémorisée jusqu'au prochain clic gauche. Le clic droit
  // ouvre le menu contextuel pour agir sur cette lettre.
  let designated = null;

  // Logique partagée par le menu contextuel (clic droit) et le mode détection
  // (clic gauche quand detectionMode est ON). Renvoie true si un hit a été
  // appliqué (la désignation est alors « consommée » par l'appelant).
  const performDetection = (target) => {
    const result = analyzeAt(target.verseText, target.index);
    showAnalysis(result);
    if (result.hit) {
      applyHitToDesignatedVerse(target, result.hit);
      const marker = document.getElementById('designatedMarker');
      if (marker) marker.hidden = true;
      return true;
    }
    return false;
  };

  // CLIC GAUCHE — désigne la lettre sous le curseur (si on est dans un verset).
  // En mode détection ON : lance directement l'analyse de règle, puis garde
  // le marqueur bleu visible sur la lettre cliquée (utile quand la règle
  // colore tout un mot/segment : le marqueur indique précisément la lettre
  // que l'utilisateur a désignée).
  content.addEventListener('click', (e) => {
    const verseDiv = e.target.closest('.verse');
    if (!verseDiv) return;
    const target = pickCharacterAt(e.clientX, e.clientY);
    if (!target) return;
    // Si le clic est sur une lettre déjà coloriée (hit existant), on laisse
    // le mécanisme audio/loupe de .tajweed-overlay agir, sans relancer la
    // détection (sinon on re-render le verset par-dessus l'overlay actif).
    const onOverlay = !!e.target.closest('.tajweed-overlay');
    if (detectionMode && !onOverlay) {
      performDetection(target);
      // Le verset peut avoir été re-rendu (si une règle a matché) → le node
      // d'origine n'est plus dans le DOM. On re-pique à la MÊME position
      // écran pour retrouver la lettre dans le nouveau DOM et remettre le
      // marqueur dessus.
      const refreshed = pickCharacterAt(e.clientX, e.clientY) || target;
      designated = refreshed;
      highlightDesignatedLetter(designated);
      return;
    }
    if (etymologyMode && !onOverlay) {
      // Identifier le mot cliqué (1-indexé), le colorier, et fetcher l'info
      // morphologique. Le panneau est mis à jour quand la réponse arrive.
      const wp = wordPositionFromIndex(target.verseText, target.index);
      if (wp) {
        // Ajustement basmala : pour les sourates ≠ 1 et ≠ 9, le verset 1 est
        // affiché préfixé par "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ" (4 mots),
        // mais le corpus n'inclut pas cette basmala dans le compte des mots.
        // → décalage de -4 sur la position quand le verset commence par "بِسْمِ".
        let corpusWordPos = wp.wordPos;
        if (target.aya === 1 && target.sura !== 1 && target.sura !== 9) {
          const trimmed = (target.verseText || '').trim();
          if (trimmed.startsWith('بِسْمِ') || trimmed.startsWith('بسم')) {
            corpusWordPos -= 4;
            if (corpusWordPos < 1) {
              // Clic dans la basmala elle-même → on n'envoie pas la requête
              return;
            }
          }
        }
        // Style vert pour différencier visuellement étymologie (vert) du
        // tajwid (rouge). wrapTajweedLetters exige obligatoirement hit.style.
        const etymologyStyle = { color: '#2e7d32', weight: 'bold' };
        applyHitToDesignatedVerse(target, {
          index: wp.wordStart, length: wp.wordLength, style: etymologyStyle,
        });
        // Re-pique pour positionner le marqueur dans le DOM re-rendu
        const refreshed = pickCharacterAt(e.clientX, e.clientY) || target;
        designated = refreshed;
        highlightDesignatedLetter(designated);
        // Feedback panneau immédiat pendant le fetch
        const ruleDiv = document.getElementById('analysisRule');
        const txtDiv  = document.getElementById('analysisText');
        if (ruleDiv) ruleDiv.textContent = '';
        if (txtDiv)  txtDiv.textContent  = '… recherche de la racine …';
        updateClearAnalysisBtnVisibility();
        // Stash contexte (sourate/verset/mot) pour le chat. Le mot exact est
        // extrait depuis verseText via wordPos. Morpho sera rempli au retour.
        const wordText = (target.verseText || '')
          .split(/\s+/).filter(Boolean)[wp.wordPos - 1] || '';
        window._chatContext = {
          sourate_num:  target.sura,
          verset_num:   target.aya,
          verset_text:  target.verseText || '',
          word:         wordText,
          morpho:       null,
        };
        if (typeof updateChatContextLabel === 'function') updateChatContextLabel();
        // Lookup asynchrone (avec position ajustée pour la basmala)
        fetchEtymology(target.sura, target.aya, corpusWordPos)
          .then(showEtymologyAnalysis);
      }
      return;
    }
    designated = target;
    highlightDesignatedLetter(designated);
  });

  // CLIC DROIT — ouvre le menu contextuel sur la lettre désignée
  content.addEventListener('contextmenu', (e) => {
    const verseDiv = e.target.closest('.verse');
    if (!verseDiv) return; // hors verset → menu navigateur normal
    e.preventDefault();
    if (!designated) {
      // pas encore de lettre désignée → on n'affiche rien
      menu.hidden = true;
      return;
    }
    menu.style.left = e.pageX + 'px';
    menu.style.top  = e.pageY + 'px';
    menu.hidden = false;
  });

  // Ferme le menu sur tout autre clic à l'extérieur
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) menu.hidden = true;
  });

  // Action du menu : analyse de la lettre désignée
  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('.ctxItem');
    if (!btn) return;
    menu.hidden = true;
    if (btn.dataset.action === 'detect' && designated) {
      // Analyse ciblée sur la lettre désignée. Si un hit est trouvé, seul ce
      // mot/segment est colorié (les autres versets et occurrences restent
      // inchangés). La désignation est consommée si la règle a matché.
      if (performDetection(designated)) {
        designated = null;
      }
    }
  });

  // Repositionne le marqueur si la mise en page change (scroll, resize)
  const refreshMarker = () => { if (designated) highlightDesignatedLetter(designated); };
  window.addEventListener('scroll', refreshMarker, true);
  window.addEventListener('resize', refreshMarker);
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
  // Efface aussi le panneau d'analyse en bas (résultat d'un précédent
  // « Détecter la règle ») — il n'est plus pertinent pour la nouvelle recherche.
  const rule = document.getElementById('analysisRule');
  const txt  = document.getElementById('analysisText');
  if (rule) rule.textContent = '';
  if (txt)  txt.textContent  = '';
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
function speakText(arabicText, opts) {
  console.log('speakText :', arabicText);
  const onProgress = (opts && typeof opts.onProgress === 'function') ? opts.onProgress : null;

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
    // Pour la progression globale : on traite les segments comme une seule
    // timeline pondérée par leur longueur en caractères.
    const segLens = segments.map(s => s.length);
    const totalLen = segLens.reduce((a,b) => a+b, 0) || 1;
    const cumStart = []; { let acc = 0; for (const l of segLens) { cumStart.push(acc); acc += l; } }

    let i = 0;
    let aborted = false;
    let rafId = null;
    const cancelRaf = () => { if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; } };

    const playNext = () => {
      if (aborted) return;
      if (i >= segments.length) {
        cancelRaf();
        window._currentTTSAudio = null;
        if (onProgress) { try { onProgress(1); } catch (_) {} }
        resolve();
        return;
      }
      const segLen = segLens[i];
      const segStart = cumStart[i];
      const url = `tts.php?lang=ar&text=${encodeURIComponent(segments[i])}`;
      const a = new Audio(url);
      window._currentTTSAudio = a;
      // Tue de force l'audio pour qu'il ne puisse plus jouer plus tard
      // (Chrome peut décider de relancer un play après un échec apparent).
      const kill = () => {
        try { a.pause(); a.src = ''; a.removeAttribute('src'); a.load(); } catch (_) {}
      };

      const tick = () => {
        if (aborted || a !== window._currentTTSAudio) { rafId = null; return; }
        const d = a.duration;
        if (isFinite(d) && d > 0) {
          const segRatio = Math.min(1, Math.max(0, a.currentTime / d));
          const ratio = (segStart + segRatio * segLen) / totalLen;
          if (onProgress) { try { onProgress(ratio); } catch (_) {} }
        }
        rafId = requestAnimationFrame(tick);
      };

      a.onplay = () => { if (onProgress) { cancelRaf(); rafId = requestAnimationFrame(tick); } };
      a.onended = () => {
        cancelRaf();
        if (!aborted) { i++; playNext(); }
      };
      a.onerror = () => {
        if (aborted) return;
        aborted = true;
        cancelRaf();
        kill();
        console.warn('Google TTS onerror — annonce coupée');
        window._currentTTSAudio = null;
        if (onProgress) { try { onProgress(1); } catch (_) {} }
        resolve();
      };
      a.play().catch(() => {
        if (aborted) return;
        aborted = true;
        cancelRaf();
        kill();
        console.warn('Google TTS play().catch — annonce coupée');
        window._currentTTSAudio = null;
        if (onProgress) { try { onProgress(1); } catch (_) {} }
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

  const speechFor = (absIdx) => {
    // Si absIdx pointe sur un diacritique (typ. shadda entre la lettre
    // principale et la voyelle), on remonte jusqu'à la vraie lettre.
    let p = absIdx;
    while (p >= 0 && isDiacritic(verse[p])) p--;
    const letter = (p >= 0 ? verse[p] : verse[absIdx]) || '';
    const name = LETTER_NAMES[letter] || letter;
    return `مد لازم كلمي مثقل على حرف ${name}`;
  };

  const checkSequence = (word, wordIndex) => {
    const sequences = [
      [0x64e, 0x627, 0x653], // Fatha + Alif + maddah
      [0x650, 0x64a, 0x653], // Kasra + Ya   + maddah
      [0x64f, 0x648, 0x653]  // Damma + Waw  + maddah
    ];

    for (let index = 0; index <= word.length - sequences[0].length; index++) {
      for (const sequence of sequences) {
        if (sequence.every((charCode, seqIndex) =>
              word.charCodeAt(index + seqIndex) === charCode)) {
          const nextChar     = word.charCodeAt(index + sequence.length);
          const nextNextChar = word.charCodeAt(index + sequence.length + 1);

          // Lettre + shedda → mouthaqqal
          if ((nextChar >= 0x621 && nextChar <= 0x64A) && (nextNextChar === 0x651)) {
            const absoluteIndex = wordIndex + index;
            // Extension d'1 char à gauche pour inclure la lettre principale
            // (porteuse de la voyelle) — permet à triggerOnStart de matcher.
            if (index >= 1) {
              const extIdx = absoluteIndex - 1;
              result.push({
                index: extIdx,
                length: sequence.length + 3,
                style: laazimColor,
                speech: speechFor(extIdx)
              });
            } else {
              result.push({
                index: absoluteIndex,
                length: sequence.length + 2,
                style: laazimColor,
                speech: speechFor(absoluteIndex)
              });
            }
          }
        }
      }
    }
  };

  let currentIndex = 0;
  for (const word of words) {
    checkSequence(word, currentIndex);
    currentIndex += word.length + 1;
  }

  return result;
}

function applyLaazim_K_Khaffaf(verse) {
  const result = [];
  const laazimColor = { color: '#FF5733', weight: 'bold', size: '50px' };
  const words = verse.split(' ');

  const speechFor = (absIdx) => {
    let p = absIdx;
    while (p >= 0 && isDiacritic(verse[p])) p--;
    const letter = (p >= 0 ? verse[p] : verse[absIdx]) || '';
    const name = LETTER_NAMES[letter] || letter;
    return `مد لازم كلمي مخفف على حرف ${name}`;
  };

  const checkSequence = (word, wordIndex) => {
    const sequences = [
      [0x64e, 0x627, 0x653],
      [0x650, 0x64a, 0x653],
      [0x64f, 0x648, 0x653]
    ];

    for (let index = 0; index <= word.length - sequences[0].length; index++) {
      for (const sequence of sequences) {
        if (sequence.every((charCode, seqIndex) =>
              word.charCodeAt(index + seqIndex) === charCode)) {
          const nextChar     = word.charCodeAt(index + sequence.length);
          const nextNextChar = word.charCodeAt(index + sequence.length + 1);

          // Lettre + sukun → moukhaffaf
          if ((nextChar >= 0x621 && nextChar <= 0x64A) && (nextNextChar === 0x652)) {
            const absoluteIndex = wordIndex + index;
            if (index >= 1) {
              const extIdx = absoluteIndex - 1;
              result.push({
                index: extIdx,
                length: sequence.length + 3,
                style: laazimColor,
                speech: speechFor(extIdx)
              });
            } else {
              result.push({
                index: absoluteIndex,
                length: sequence.length + 2,
                style: laazimColor,
                speech: speechFor(absoluteIndex)
              });
            }
          }
        }
      }
    }
  };

  let currentIndex = 0;
  for (const word of words) {
    checkSequence(word, currentIndex);
    currentIndex += word.length + 1;
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
  const mounfasilColor = { color: '#642EFE', weight: 'bold', size: '50px' };

  // Speech : la lettre principale est à hit.index (après extension du hit
  // pour inclure la lettre porteuse de la voyelle, et non commencer sur la
  // voyelle elle-même). Cohérent avec Mad muttasil / Mad tabii.
  const speechFor = (idx) => {
    let p = idx;
    while (p >= 0 && isDiacritic(verse[p])) p--;
    const letter = (p >= 0 ? verse[p] : verse[idx]) || '';
    const name = (typeof LETTER_NAMES !== 'undefined' && LETTER_NAMES[letter]) || letter;
    return `مد منفصل على حرف ${name}`;
  };

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
      [0x64E, 0x649, 0x670, 0x653, 0x20, 0x623],
      [0x64E, 0x649, 0x670, 0x653, 0x20, 0x625],
      [0x64E, 0x640, 0x670, 0x653, 0x624],
      [0x64A, 0x64E, 0x640, 0x670, 0x653, 0x640, 0x654],
    ];

    for (const sequence of sequences) {
      if (sequence.every((charCode, seqIndex) => {
        return verse.charCodeAt(index - (sequence.length - 1) + seqIndex) === charCode;
      })) {
        return sequence.length;
      }
    }
    return 0;
  };

  for (let i = verse.length - 1; i >= 0; i--)
  {
    const length = checkSequence(i);
    if (length > 0) {
      // Extension d'1 caractère à gauche : on inclut la lettre principale
      // (celle qui porte la voyelle). Permet à triggerOnStart de matcher.
      const extStart = i - length;
      if (extStart >= 0) {
        result.push({
          index: extStart,
          length: length + 1,
          style: mounfasilColor,
          speech: speechFor(extStart)
        });
      } else {
        // Cas où le mad est en début de verset (rare) : on garde l'ancien hit.
        const idx = i - (length - 1);
        result.push({
          index: idx,
          length: length,
          style: mounfasilColor,
          speech: speechFor(idx)
        });
      }
    }
  }
  return result;
}


function applyMouttasil(verse) {
  const result = [];
  const mouttasilColor = { color: '#DF3A01', weight: 'bold', size: '50px' };

  // Speech : la lettre principale est à hit.index (après extension du hit
  // pour qu'il commence sur le caractère porteur de la voyelle, et non sur
  // la voyelle elle-même).
  const speechFor = (idx) => {
    let p = idx;
    while (p >= 0 && isDiacritic(verse[p])) p--;
    const letter = (p >= 0 ? verse[p] : verse[idx]) || '';
    const name = (typeof LETTER_NAMES !== 'undefined' && LETTER_NAMES[letter]) || letter;
    return `مد متصل على حرف ${name}`;
  };

  // Vérifie fatha, damma, kasra, soukoun, tanwin in, tanwin oun
  const checkFathaDammaKasra = charCode =>
    charCode === 0x64E || charCode === 0x64F || charCode === 0x650 ||
    charCode === 0x652 || charCode === 0x64D || charCode === 0x64C;

  for (let i = 4; i < verse.length; i++)
  {
    const charCode = verse.charCodeAt(i);

    // Scénario 1 : letter + vowel + alif/waw/ya + maddah + hamza (ء ou ئ) + vowel
    // Hit étendu d'1 caractère pour inclure la lettre principale (i-4).
    // ئ (0x626) accepté pour des mots comme ٱلسَّرَآئِرُ / شَعَآئِر / نِسَآئِك.
    if ((charCode === 0x621 || charCode === 0x626) &&
      (checkFathaDammaKasra(verse.charCodeAt(i + 1)) || verse.charCodeAt(i + 1) === 0x64B) &&
      verse.charCodeAt(i - 1) === 0x653 &&
      (verse.charCodeAt(i - 2) === 0x627 || verse.charCodeAt(i - 2) === 0x648 || verse.charCodeAt(i - 2) === 0x64A || verse.charCodeAt(i - 2) === 0x670) &&
      checkFathaDammaKasra(verse.charCodeAt(i - 3))) {
      const idx = i - 4;
      result.push({ index: idx, length: 5, style: mouttasilColor, speech: speechFor(idx) });
    }
    // Scénario 2
    else if (charCode === 0x654 && checkFathaDammaKasra(verse.charCodeAt(i + 1)) &&
        verse.charCodeAt(i - 1) === 0x640 && verse.charCodeAt(i - 2) === 0x653 &&
        (verse.charCodeAt(i - 3) === 0x627 || verse.charCodeAt(i - 3) === 0x648 || verse.charCodeAt(i - 3) === 0x64A) &&
        checkFathaDammaKasra(verse.charCodeAt(i - 4)) && i >= 5) {
      const idx = i - 5;
      result.push({ index: idx, length: 6, style: mouttasilColor, speech: speechFor(idx) });
    }
    // Scénario 3
    else if (charCode === 0x626 && checkFathaDammaKasra(verse.charCodeAt(i + 1)) &&
        verse.charCodeAt(i - 1) === 0x653 && verse.charCodeAt(i - 2) === 0x670 && verse.charCodeAt(i - 3) === 0x640 &&
        checkFathaDammaKasra(verse.charCodeAt(i - 4)) && i >= 5) {
      const idx = i - 5;
      result.push({ index: idx, length: 6, style: mouttasilColor, speech: speechFor(idx) });
    }
    // Scénario 4
    else if (charCode === 0x654 && checkFathaDammaKasra(verse.charCodeAt(i + 1)) &&
        verse.charCodeAt(i - 1) === 0x640 && verse.charCodeAt(i - 2) === 0x653 && verse.charCodeAt(i - 3) === 0x6E5 &&
        (verse.charCodeAt(i - 4) === 0x627 || verse.charCodeAt(i - 4) === 0x648 || verse.charCodeAt(i - 4) === 0x64A) &&
        checkFathaDammaKasra(verse.charCodeAt(i - 5)) && i >= 6) {
      const idx = i - 6;
      result.push({ index: idx, length: 7, style: mouttasilColor, speech: speechFor(idx) });
    }
    // Scénario 5
    else if (charCode === 0x654 && checkFathaDammaKasra(verse.charCodeAt(i + 1)) &&
        verse.charCodeAt(i - 1) === 0x640 && verse.charCodeAt(i - 2) === 0x653 && verse.charCodeAt(i - 3) === 0x6E6 &&
        (verse.charCodeAt(i - 4) === 0x627 || verse.charCodeAt(i - 4) === 0x648 || verse.charCodeAt(i - 4) === 0x64A) &&
        checkFathaDammaKasra(verse.charCodeAt(i - 5)) && i >= 6) {
      const idx = i - 6;
      result.push({ index: idx, length: 7, style: mouttasilColor, speech: speechFor(idx) });
    }
    // Scénario 6 : pattern alif + maddah + ئ — cas particulier sans
    // lettre principale clairement identifiable. On laisse le hit tel quel.
    else if (charCode === 0x626 && verse.charCodeAt(i - 1) === 0x653 && verse.charCodeAt(i - 2) === 0x627) {
      const idx = i - 2;
      result.push({ index: idx, length: 3, style: mouttasilColor, speech: speechFor(idx) });
    }
    // Scénario 7
    else if (charCode === 0x654 && verse.charCodeAt(i - 1) === 0x640 && verse.charCodeAt(i - 2) === 0x653 && verse.charCodeAt(i - 3) === 0x64a && verse.charCodeAt(i - 4) === 0x650 && i >= 5) {
      const idx = i - 5;
      result.push({ index: idx, length: 6, style: mouttasilColor, speech: speechFor(idx) });
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

  // Vérifie les conditions de la règle mad ʿarid lis-sukoun
  if (pos >= 4 &&
      (verse.charCodeAt(pos) === 0x64E || verse.charCodeAt(pos) === 0x64F || verse.charCodeAt(pos) === 0x650 || verse.charCodeAt(pos) === 0x64C || verse.charCodeAt(pos) === 0x64D) &&
      (verse.charCodeAt(pos - 1) >= 0x622 && verse.charCodeAt(pos - 1) <= 0x64A) &&
      (verse.charCodeAt(pos - 2) === 0x627 || verse.charCodeAt(pos - 2) === 0x648 || verse.charCodeAt(pos - 2) === 0x64A) &&
      ((verse.charCodeAt(pos - 2) === 0x627 && verse.charCodeAt(pos - 3) === 0x64E) ||
       (verse.charCodeAt(pos - 2) === 0x648 && verse.charCodeAt(pos - 3) === 0x64F) ||
       (verse.charCodeAt(pos - 2) === 0x64A && verse.charCodeAt(pos - 3) === 0x650)))
  {
    const mainIdx = pos - 4;     // lettre principale (porteuse de la voyelle prolongée)
    const letter = verse[mainIdx];
    const name = (typeof LETTER_NAMES !== 'undefined' && LETTER_NAMES[letter]) || letter;
    result.push({
      index: mainIdx,
      length: 3,
      style: waqfColor,
      speech: `مد عارض للسكون على حرف ${name}`
    });
  }

  return result;
}

function applySilatuKubraRule(verse) {
  const result = [];
  const normalColor  = { color: '#04B404', weight: 'bold', size: '50px' };
  const specialColor = { color: '#FFA500', weight: 'bold', size: '50px' };

  for (let i = 0; i < verse.length - 1; i++) {
    if ((verse.charCodeAt(i) === 0x6E5 || verse.charCodeAt(i) === 0x6E6) && verse.charCodeAt(i + 1) === 0x653) {
      // Doit être précédé de ه (haa du pronom) à la position i-2
      if (i > 0 && verse.charCodeAt(i - 2) !== 0x647) {
        continue;
      }

      let start = Math.max(i - 2, 0);
      let end   = Math.min(i + 4, verse.length);

      // 0x6E6 = small ya  → ha-pronoun « hi » (kasra)
      // 0x6E5 = small waw → ha-pronoun « hu » (damma)
      const isKasraVariant = verse.charCodeAt(i) === 0x6E6;
      const speech = isKasraVariant
        ? 'هاء الضمير المكسورة قبل همزة'
        : 'هاء الضمير المضمومة قبل همزة';

      const baseHit = { index: start, length: end - start, speech };
      if (i === verse.length - 2) {
        result.push({ ...baseHit, style: specialColor });
      } else {
        result.push({ ...baseHit, style: normalColor });
      }
    }
  }

  return result;
}

function applySilatuSuraRule(verse) {
  const result = [];
  const normalColor  = { color: '#8A0886', weight: 'bold', size: '50px' };
  const specialColor = { color: '#FFA500', weight: 'bold', size: '50px' };

  for (let i = 0; i < verse.length; i++) {
    if ((verse.charCodeAt(i) === 0x6E6 || verse.charCodeAt(i) === 0x6E5) && verse.charCodeAt(i + 1) !== 0x653) {
      // Doit être précédé de ه (haa du pronom) à la position i-2
      if (i > 0 && verse.charCodeAt(i - 2) !== 0x647) {
        continue;
      }

      let start = Math.max(i - 2, 0);
      let end   = Math.min(i + 4, verse.length);

      // 0x6E6 = small ya  → ha-pronoun « hi » (kasra)
      // 0x6E5 = small waw → ha-pronoun « hu » (damma)
      const isKasraVariant = verse.charCodeAt(i) === 0x6E6;
      const speech = isKasraVariant ? 'هاء الضمير المكسورة' : 'هاء الضمير المضمومة';

      const baseHit = { index: start, length: end - start, speech };
      if (i === verse.length - 1) {
        result.push({ ...baseHit, style: specialColor });
      } else {
        result.push({ ...baseHit, style: normalColor });
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
  const shedda = "ّ";
  const tanweenAn = "ً";
  const alif = "ا";

  // Extraire le dernier mot
  const words = verseText.split(' ');
  const lastWord = words[words.length - 1];

  let foundMadIwad = [];

  // Speech par hit : la lettre principale est celle à hit.index (lettre porteuse du tanwin fath)
  const speechFor = (letter) => {
    const name = (typeof LETTER_NAMES !== 'undefined' && LETTER_NAMES[letter]) || letter;
    return `حرف ${name} بالتنوين عند الوقف`;
  };

  // Recherche de la séquence dans le dernier mot
  for (let i = 0; i < lastWord.length; i++) {
    if (/[ء-ي]/.test(lastWord[i]) && lastWord[i + 1] === shedda && lastWord[i + 2] === tanweenAn && lastWord[i + 3] === alif) {
      const indexInVerse = words.slice(0, -1).reduce((sum, word) => sum + word.length + 1, 0) + i;
      foundMadIwad.push({
        index: indexInVerse,
        length: 4,
        speech: speechFor(lastWord[i]),
        style: { color: 'red', weight: 'bold', size: '50px' }
      });
    }
  }

  // Recherche de la séquence à la fin du dernier mot
  const sequenceRegEx = /([ء-ي])ً[ًۢ]*[اى]$/;

  const match = sequenceRegEx.exec(lastWord);

  if (match) {
    const indexInVerse = words.slice(0, -1).reduce((sum, word) => sum + word.length + 1, 0) + match.index;
    foundMadIwad.push({
      index: indexInVerse,
      length: match[0].length,
      speech: speechFor(match[1]),   // match[1] = la lettre porteuse capturée
      style: { color: 'red', weight: 'bold', size: '50px' }
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

  // Speech par hit : la lettre principale est celle à hit.index.
  // Format : « مد طبيعي على حرف [nom de la lettre] ».
  return foundMadAsli.map(h => ({
    ...h,
    speech: `مد طبيعي على حرف ${LETTER_NAMES[verseText[h.index]] || verseText[h.index]}`,
  }));
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
      speech: 'نون مشددة',
      style: {
        color: '#B45F04',
        weight: 'bold',
        size: '50px'
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
    speech: 'ميم مشددة',
    style: {
      color: '#0000FF',
      weight: 'bold',
      size: '50px'
    }
  }));
}

function applyLamShamsiRule(verseText) {
  const alifWasla = 'ٱ';
  const lam = 'ل';
  const shamsiLetters = ['ت','ث','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ن','ل'];
  const shedda = 'ّ';
  const diacriticalMarks = ['َ','ِ','ُ'];
  const style = { color: '#0080FF', weight: 'bold', size: '50px' };
  let foundLamShamsi = [];

  for (let i = 0; i < verseText.length; i++) {
    // Cas standard : ٱ + ل + lettre solaire + shedda + voyelle
    if (verseText[i] === alifWasla
        && verseText[i + 1] === lam
        && shamsiLetters.includes(verseText[i + 2])
        && verseText[i + 3] === shedda
        && diacriticalMarks.includes(verseText[i + 4])) {
      const target = verseText[i + 2];
      const name = (typeof LETTER_NAMES !== 'undefined' && LETTER_NAMES[target]) || target;
      foundLamShamsi.push({
        index: i,
        length: 4, // ٱ + ل + lettre solaire + shedda
        speech: `لام شمسية مدغمة في حرف ${name}`,
        style
      });
    }
    // Cas spécial : ٱ + ل + shedda + voyelle (le ل visible joue à la fois
    // le rôle de l'article et de la lettre solaire — fusion orthographique
    // typique de ٱلَّذِينَ, ٱلَّتِي, etc.).
    else if (verseText[i] === alifWasla
        && verseText[i + 1] === lam
        && verseText[i + 2] === shedda
        && diacriticalMarks.includes(verseText[i + 3])) {
      foundLamShamsi.push({
        index: i,
        length: 3, // ٱ + ل + shedda
        speech: 'لام شمسية مدغمة في حرف لام',
        style
      });
    }
  }
  return foundLamShamsi;
}

function applyLamQamariRule(verseText) {
  const alifWasla = 'ٱ';
  const lam = 'ل';
  const sukun = 'ْ';
  const qamariLetters = ['أ','ب','ج','ح','خ','ع','غ','ف','ق','ك','م','ه','و','ى'];
  let foundLamQamari = [];

  for (let i = 0; i < verseText.length; i++) {
    if (verseText[i] === alifWasla
        && verseText[i + 1] === lam
        && verseText[i + 2] === sukun
        && qamariLetters.includes(verseText[i + 3])) {
      const target = verseText[i + 3];
      const name = (typeof LETTER_NAMES !== 'undefined' && LETTER_NAMES[target]) || target;
      foundLamQamari.push({
        index: i,
        length: 4, // ٱ + ل + sukun + lettre lunaire
        speech: `لام قمرية مظهرة قبل حرف ${name}`,
        style: { color: '#FF00FF', weight: 'bold', size: '50px' }
      });
    }
  }
  return foundLamQamari;
}

function applyIzharShafawiRule(verseText) {
  const mimSukun = 'مْ';
  const allLettersExceptMimAndBa = ['ا', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'ن', 'ه', 'و', 'ي'];
  let foundIzhar = [];

  for (let i = 0; i < verseText.length - 2; i++) {
    if (verseText.substring(i, i + 2) === mimSukun) {
      let length = 3;
      let targetLetter = verseText[i + 2];
      if (verseText[i + 2] === ' ' && allLettersExceptMimAndBa.includes(verseText[i + 3])) {
        length = 4;
        targetLetter = verseText[i + 3];
      } else if (!allLettersExceptMimAndBa.includes(verseText[i + 2])) {
        continue;
      }
      const targetName = LETTER_NAMES[targetLetter] || targetLetter;
      foundIzhar.push({ index: i, length, speech: `ميم ساكنة و بعدها حرف ${targetName}` });
    }
  }
  return foundIzhar.map((found) => ({
    index: found.index,
    length: found.length,
    speech: found.speech,
    style: {
      color: '#40FF00',
      weight: 'bold',
      size: '50px'
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
      speech: 'ميم ساكنة و بعدها ميم مشددة',
      style: {
        color: '#B45F04',
        weight: 'bold',
        size: '50px'
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
    speech: 'ميم ساكنة و بعدها حرف الباء',
    style: {
      color: '#01DF01',
      weight: 'bold',
      size: '50px'
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
  const SUKUN   = 'ْ';

  const style = { color:'red', weight:'bold', size:'50px' };
  const hits = [];

  // Construit la phrase d'analyse pour un hit donné.
  //   'sukun' → qalqala sughra (lettre + soukoun explicite)
  //   'waqf'  → qalqala kubra  (lettre en fin de verset, pause/waqf)
  const speechFor = (letter, kind) => {
    const name = (typeof LETTER_NAMES !== 'undefined' && LETTER_NAMES[letter]) || letter;
    return kind === 'waqf'
      ? `${name} ساكنة عند الوقف`
      : `${name} ساكنة`;
  };

  for (let i = 0; i < verseText.length; i++) {
    const ch = verseText[i];
    if (!letters.has(ch)) continue;

    const next = verseText[i+1] || '';
    if (next === SUKUN) {
      // lettre + sukun → qalqala sughra
      hits.push({ index:i, length:2, style, speech: speechFor(ch, 'sukun') });
    } else if (next === ' ') {
      // fin de mot mid-verset → qalqala sughra implicite
      hits.push({ index:i, length:1, style, speech: speechFor(ch, 'sukun') });
    } else if (i+1 === verseText.length) {
      // strictement dernière position du texte → qalqala kubra
      hits.push({ index:i, length:1, style, speech: speechFor(ch, 'waqf') });
    }
  }

  // Dernière lettre arabe du verset (gère diacritiques ET marques de pause ۖۗۘۙۚۛۜ…)
  // On remonte en sautant TOUT ce qui n'est pas une lettre arabe de base.
  let idx = verseText.length - 1;
  while (idx >= 0 && !isArabicLetter(verseText[idx])) idx--;
  if (idx >= 0 && letters.has(verseText[idx])) {
    if (!hits.some(h => h.index === idx)) {
      hits.push({ index:idx, length:1, style, speech: speechFor(verseText[idx], 'waqf') });
    } else {
      // Si déjà présent en mode 'sukun' alors qu'on est en fin de verset, on
      // upgrade vers 'waqf' pour avoir le bon « عند الوقف ».
      const existing = hits.find(h => h.index === idx);
      if (existing) existing.speech = speechFor(verseText[idx], 'waqf');
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
  // Reset du contexte chat : le mot précédent n'est plus dans la nouvelle page
  window._chatContext = null;
  if (typeof updateChatContextLabel === 'function') updateChatContextLabel();
  const pageNumberInput = document.getElementById('pageNumberInput');
  const pageNumber = pageNumberInput.value;
  const quranContent = document.getElementById('quranContent');

  if (!pageNumber) {
    //alert('Veuillez entrer un numéro de page');
    return;
  }

  getPageVerses(pageNumber)
    .then((verses) => {
      quranContent.innerHTML = '';
      // Changement de page → la règle précédemment détectée n'est plus
      // pertinente : on vide le panneau d'analyse et on masque le bouton ✕.
      const ruleDiv = document.getElementById('analysisRule');
      const txtDiv  = document.getElementById('analysisText');
      if (ruleDiv) ruleDiv.textContent = '';
      if (txtDiv)  txtDiv.textContent  = '';
      const marker = document.getElementById('designatedMarker');
      if (marker) marker.hidden = true;

      const pageDiv = document.createElement('div');
      pageDiv.textContent = `Page : ${pageNumber}`;
      quranContent.appendChild(pageDiv);

      verses.forEach((verse) => {
        // On passe par renderVerseWithHighlight (avec aucun hit) pour avoir
        // le MÊME format de DOM qu'après un clic sur une règle :
        // - data-sura, data-aya, data-text sur le .verse
        // - structure .verseHeader / .verseBody
        // Sans ça, pickCharacterAt ne fonctionnerait pas sur les versets
        // chargés par le seul bouton « Charger ».
        const vDiv = renderVerseWithHighlight(verse, []);
        quranContent.appendChild(vDiv);
      });

      lastLoadedPageNumber = pageNumber;
      updateClearAnalysisBtnVisibility();
      // Reset des modes (détection / étymologie) à chaque changement de page.
      setDetectionMode(false);
      setEtymologyMode(false);
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

/**
 * Aligne le panneau d'analyse flottant sur la zone #content : il colle
 * au bord gauche et droit de la colonne de contenu, sans déborder sous
 * la sidebar. À appeler au chargement et à chaque redimensionnement.
 */
function positionAnalysisPanel() {
  const panel   = document.getElementById('analysisPanel');
  const content = document.getElementById('content');
  if (!panel || !content) return;
  const rect = content.getBoundingClientRect();
  const inset = 16; // 1rem de marge intérieure
  panel.style.left  = (rect.left + inset) + 'px';
  panel.style.width = Math.max(0, rect.width - 2 * inset) + 'px';
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#sidebar button').forEach(btn => {
    btn.classList.add('rule-button');
  });
  initRuleButtons(true);
  bindContextDetection();
  positionAnalysisPanel();
  window.addEventListener('resize', positionAnalysisPanel);

  // Bouton ✕ : efface règle détectée + couleur/loupe en page
  const clearBtn = document.getElementById('clearAnalysisBtn');
  if (clearBtn) clearBtn.addEventListener('click', clearAnalysisAndHighlights);
  updateClearAnalysisBtnVisibility();

  // Helpers internes pour extraire le contenu structuré du panneau.
  // Structure cible : ruleDiv contient .ety-line (1 ou 2 blocs : racine, et
  // optionnellement verbe coranique). Chaque ligne est extraite en texte plat.
  const extractPanelLines = () => {
    const ruleDiv = document.getElementById('analysisRule');
    const txtDiv  = document.getElementById('analysisText');
    const lines = [];
    if (ruleDiv) {
      const etyLines = ruleDiv.querySelectorAll('.ety-line');
      if (etyLines.length) {
        etyLines.forEach(div => {
          // Pour la ligne 2, on peut avoir plusieurs sous-spans .ety-morph-line —
          // on les sépare par newline pour rester lisible dans VS Code/Notion.
          const subs = div.querySelectorAll('.ety-morph-line');
          if (subs.length) {
            subs.forEach(sp => {
              const t = sp.textContent.trim();
              if (t) lines.push(t);
            });
          } else {
            const t = div.textContent.trim();
            if (t) lines.push(t);
          }
        });
      } else {
        // Fallback : ancien rendu (avant restructure)
        const root = Array.from(ruleDiv.childNodes)
          .filter(n => n.nodeType === Node.TEXT_NODE)
          .map(n => n.textContent.trim())
          .filter(Boolean).join(' ');
        if (root) lines.push(root);
        ruleDiv.querySelectorAll('.ety-morph-line').forEach(span => {
          const t = span.textContent.trim();
          if (t) lines.push(t);
        });
      }
    }
    if (txtDiv) {
      const ar = Array.from(txtDiv.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent.trim())
        .filter(Boolean).join(' ');
      if (ar) lines.push(ar);
      const frSpan = txtDiv.querySelector('.ety-fr-line');
      if (frSpan) {
        const f = frSpan.textContent.trim();
        if (f) lines.push(f);
      }
    }
    return lines;
  };
  // Extrait le passé 3MS pour le bouton 📋 (paste dans Almaany/Google).
  // Cherche d'abord "الماضي: X" (cas Forms II-X qui ont une ligne 2),
  // sinon prend le 1er mot du verbe trilitère affiché en ligne 1 (Form I active).
  const extractPastForm = () => {
    const ruleDiv = document.getElementById('analysisRule');
    // 1. Cherche "الماضي:" dans tout le texte
    if (ruleDiv) {
      const text = ruleDiv.textContent;
      const m = text.match(/الماضي\s*[:：]\s*([^·\n—]+)/);
      if (m) return m[1].trim().replace(/[ٌٍ]$/, '');
      // 2. Sinon : premier mot du verbe trilitère (Form I active)
      const tri = ruleDiv.querySelector('.ety-trilitere');
      if (tri) {
        const first = tri.textContent.trim().split(/\s*[—-]\s*/)[0];
        if (first) return first.replace(/[ٌٍ]$/, '');
      }
    }
    return null;
  };
  // Fonction de copie commune (factorisée pour les 2 boutons)
  const copyToClipboard = async (text, btn) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 1200);
  };

  // 📋 Bouton "copy verbe au passé" — pour paste dans Almaany, Google, etc.
  // Copie uniquement la forme citationnelle (passé 3MS sans tanwin) pour
  // que le paste dans un moteur de recherche / dico marche directement.
  const copyBtn = document.getElementById('copyAnalysisBtn');
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    const past = extractPastForm();
    if (past) await copyToClipboard(past, copyBtn);
  });

  // 📄 Bouton "copy info complète" — pour paste dans VS Code / Notion / notes.
  // Format multi-ligne avec toutes les sections.
  const copyFullBtn = document.getElementById('copyAnalysisFullBtn');
  if (copyFullBtn) copyFullBtn.addEventListener('click', async () => {
    const lines = extractPanelLines();
    const text = lines.join('\n');
    if (text) await copyToClipboard(text, copyFullBtn);
  });

  // Toggle "Détection" : active/désactive le mode où un clic gauche sur une
  // lettre lance directement l'analyse de règle de tajwid.
  const detectionBtn = document.getElementById('detectionToggleBtn');
  if (detectionBtn) {
    detectionBtn.addEventListener('click', () => setDetectionMode(!detectionMode));
  }

  // Toggle "Étymologie" : active/désactive le mode où un clic gauche sur un
  // mot affiche sa racine et sa forme verbale. La logique de lookup est en
  // étape 3 — pour l'instant le bouton ne fait qu'activer le mode et
  // désactiver "Détection" (exclusion mutuelle).
  const etymologyBtn = document.getElementById('etymologyToggleBtn');
  if (etymologyBtn) {
    etymologyBtn.addEventListener('click', () => setEtymologyMode(!etymologyMode));
  }

  // Bouton QR / Partage : ouvre un modal avec le QR code, le lien copiable
  // et le bouton de partage natif (navigator.share). Le bouton "Partager"
  // n'est affiché que si l'API est disponible (typiquement sur mobile).
  setupShareModal();
});

function setupShareModal() {
  const openBtn   = document.getElementById('qrShareBtn');
  const modal     = document.getElementById('shareModal');
  const closeBtn  = modal && modal.querySelector('.share-modal-close');
  const backdrop  = modal && modal.querySelector('.share-modal-backdrop');
  const copyBtn   = document.getElementById('shareCopyBtn');
  const nativeBtn = document.getElementById('shareNativeBtn');
  const urlBox    = document.getElementById('shareModalUrl');
  if (!openBtn || !modal) return;

  const shareUrl   = (urlBox && urlBox.textContent.trim()) || location.origin + '/';
  const shareTitle = 'StudioCoran';
  const shareText  = 'Une aide visuelle pour étudier le tajwid';

  const open  = () => { modal.hidden = false; };
  const close = () => { modal.hidden = true;  };

  openBtn.addEventListener('click', open);
  if (closeBtn) closeBtn.addEventListener('click', close);
  if (backdrop) backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
  });

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const original = copyBtn.textContent;
      try {
        await navigator.clipboard.writeText(shareUrl);
        copyBtn.textContent = '✓ Lien copié';
      } catch {
        // Fallback : sélection + execCommand pour les très vieux navigateurs.
        const ta = document.createElement('textarea');
        ta.value = shareUrl;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); copyBtn.textContent = '✓ Lien copié'; }
        catch { copyBtn.textContent = '⚠ Échec de la copie'; }
        document.body.removeChild(ta);
      }
      setTimeout(() => { copyBtn.textContent = original; }, 1800);
    });
  }

  if (nativeBtn) {
    if (navigator.share) {
      nativeBtn.addEventListener('click', async () => {
        try {
          await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
        } catch { /* utilisateur a annulé : pas un échec */ }
      });
    } else {
      // Pas de partage natif (desktop sans Web Share API) → on masque le
      // bouton, le bouton "Copier" suffit pour partager.
      nativeBtn.hidden = true;
    }
  }
}

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

// ─── CHAT LINGUISTIQUE ─────────────────────────────────────────────────────
// Panneau latéral qui appelle chat.php (proxy Claude API) avec le contexte
// du verset/mot courant. Historique conservé en mémoire (perdu au reload).

const _chatState = {
  history: [],      // [{role, content}, ...] — tours réels (sans le contexte injecté)
  busy:    false,
};

function _hasValidChatContext() {
  const ctx = window._chatContext;
  return !!(ctx && ctx.sourate_num && ctx.verset_num && ctx.word);
}

function _hasValidChatContext() {
  const ctx = window._chatContext;
  return !!(ctx && ctx.sourate_num && ctx.verset_num && ctx.word);
}

function _updateChatEnabledState() {
  const ok = _hasValidChatContext();
  const sendBtn = document.getElementById('chatSendBtn');
  const input   = document.getElementById('chatInput');
  if (sendBtn) sendBtn.disabled = !ok || _chatState.busy;
  if (input) {
    input.placeholder = ok
      ? 'Pose ta question linguistique…'
      : 'Clique d\'abord sur un mot du Coran…';
  }
}

function updateChatContextLabel() {
  const lbl = document.getElementById('chatContextLabel');
  if (lbl) {
    const ctx = window._chatContext;
    if (!ctx || !ctx.sourate_num || !ctx.word) {
      lbl.textContent = 'Clique sur un mot du Coran pour le sélectionner';
    } else {
      lbl.textContent = `Sourate ${ctx.sourate_num} · v.${ctx.verset_num} · « ${ctx.word} »`;
    }
  }
  _updateChatEnabledState();
}

// ─── Sélection au clic dans le Coran quand le chat est ouvert ─────────────
// Capture sourate/verset/mot depuis n'importe quel clic gauche dans une
// .verse, indépendamment du mode (Détection/Étymologie). Si le mot est un
// verbe connu, on enrichit le contexte avec les données morpho en arrière-
// plan pour que Claude s'appuie dessus.
function _chatPickClickHandler(e) {
  if (e.button !== 0) return;
  const verseDiv = e.target.closest('.verse');
  if (!verseDiv) return;
  if (typeof pickCharacterAt !== 'function' || typeof wordPositionFromIndex !== 'function') return;
  const target = pickCharacterAt(e.clientX, e.clientY);
  if (!target || !target.verseText) return;
  const wp = wordPositionFromIndex(target.verseText, target.index);
  if (!wp) return;

  // Ajustement basmala (idem flow étymologie)
  let corpusWordPos = wp.wordPos;
  if (target.aya === 1 && target.sura !== 1 && target.sura !== 9) {
    const trimmed = (target.verseText || '').trim();
    if (trimmed.startsWith('بِسْمِ') || trimmed.startsWith('بسم')) {
      corpusWordPos -= 4;
      if (corpusWordPos < 1) return;
    }
  }

  const words = (target.verseText || '').split(/\s+/).filter(Boolean);
  const wordText = words[wp.wordPos - 1] || '';

  window._chatContext = {
    sourate_num:  target.sura,
    verset_num:   target.aya,
    verset_text:  target.verseText || '',
    word:         wordText,
    morpho:       null,
  };
  updateChatContextLabel();

  // Enrichissement best-effort : si le mot est un verbe connu, on récupère
  // les données morpho pour les passer à Claude. Échec silencieux sinon.
  if (typeof fetchEtymology === 'function') {
    fetchEtymology(target.sura, target.aya, corpusWordPos)
      .then(data => {
        if (data && !data.error && !data.notVerb && window._chatContext
            && window._chatContext.word === wordText) {
          window._chatContext.morpho = data;
        }
      })
      .catch(() => {});
  }
}

let _chatPickInstalled = false;
function _installChatPickMode() {
  if (_chatPickInstalled) return;
  const content = document.getElementById('quranContent');
  if (!content) return;
  content.addEventListener('click', _chatPickClickHandler);
  content.classList.add('chat-pick-active');
  _chatPickInstalled = true;
}
function _uninstallChatPickMode() {
  if (!_chatPickInstalled) return;
  const content = document.getElementById('quranContent');
  if (!content) return;
  content.removeEventListener('click', _chatPickClickHandler);
  content.classList.remove('chat-pick-active');
  _chatPickInstalled = false;
}

// Rendu markdown minimal (escape HTML d'abord, puis bold/italic/inline-code).
// Les retours à la ligne sont gérés par CSS `white-space: pre-wrap`.
function _renderMarkdown(text) {
  const escaped = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<![*\w])\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>');
}

function _appendChatMsg(role, content, cls) {
  const hist = document.getElementById('chatHistory');
  if (!hist) return null;
  const div = document.createElement('div');
  div.className = 'chat-msg ' + (cls || role);
  // Pour les messages utilisateur (qu'ils ont tapé) et les erreurs : texte brut.
  // Pour les réponses de l'assistant : rendu markdown minimal (bold/italic/code).
  if ((cls || role) === 'assistant') {
    div.innerHTML = _renderMarkdown(content);
  } else {
    div.textContent = content;
  }
  hist.appendChild(div);
  hist.scrollTop = hist.scrollHeight;
  return div;
}

async function _sendChatMessage(question) {
  if (_chatState.busy || !question.trim()) return;
  if (!_hasValidChatContext()) {
    _appendChatMsg('error',
      'Clique d\'abord sur un mot du Coran pour le sélectionner. ' +
      'Le chat répondra ensuite aux questions sur ce mot.',
      'error');
    return;
  }
  _chatState.busy = true;
  _updateChatEnabledState();

  _appendChatMsg('user', question);
  const loadingDiv = _appendChatMsg('assistant', '…réflexion en cours…', 'loading');

  // Construit le payload (contexte courant + historique réel)
  const ctx = window._chatContext || {};
  const payload = {
    question,
    history: _chatState.history.slice(-10), // garde max 10 derniers tours
    context: {
      sourate_num:  ctx.sourate_num  || null,
      sourate_name: ctx.sourate_name || null,
      verset_num:   ctx.verset_num   || null,
      verset_text:  ctx.verset_text  || null,
      verset_fr:    ctx.verset_fr    || null,
      word:         ctx.word         || null,
      morpho:       ctx.morpho       || null,
    },
  };

  try {
    const resp = await fetch('chat.php', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const data = await resp.json();
    if (loadingDiv && loadingDiv.parentNode) loadingDiv.parentNode.removeChild(loadingDiv);
    if (!resp.ok || data.error) {
      _appendChatMsg('error', 'Erreur : ' + (data.error || `HTTP ${resp.status}`), 'error');
    } else {
      const reply = data.reply || '(réponse vide)';
      _appendChatMsg('assistant', reply);
      _chatState.history.push({ role: 'user',      content: question });
      _chatState.history.push({ role: 'assistant', content: reply    });
    }
  } catch (err) {
    if (loadingDiv && loadingDiv.parentNode) loadingDiv.parentNode.removeChild(loadingDiv);
    _appendChatMsg('error', 'Erreur réseau : ' + err.message, 'error');
  } finally {
    _chatState.busy = false;
    _updateChatEnabledState();
    const input = document.getElementById('chatInput');
    if (input) input.focus();
  }
}

function initChatPanel() {
  const toggleBtn = document.getElementById('chatToggleBtn');
  const panel     = document.getElementById('chatPanel');
  const closeBtn  = document.getElementById('chatCloseBtn');
  const resetBtn  = document.getElementById('chatResetBtn');
  const input     = document.getElementById('chatInput');
  const sendBtn   = document.getElementById('chatSendBtn');
  if (!toggleBtn || !panel) return;

  const open  = () => { panel.classList.add('open');  toggleBtn.classList.add('open');
                        toggleBtn.textContent = '✕'; updateChatContextLabel();
                        _installChatPickMode();
                        setTimeout(() => input && input.focus(), 50); };
  const close = () => { panel.classList.remove('open'); toggleBtn.classList.remove('open');
                        toggleBtn.textContent = '💬';
                        _uninstallChatPickMode(); };

  toggleBtn.addEventListener('click', () => {
    if (panel.classList.contains('open')) close(); else open();
  });
  if (closeBtn) closeBtn.addEventListener('click', close);

  if (resetBtn) resetBtn.addEventListener('click', () => {
    _chatState.history = [];
    const hist = document.getElementById('chatHistory');
    if (hist) hist.innerHTML = '';
  });

  const send = () => {
    const q = (input.value || '').trim();
    if (!q) return;
    input.value = '';
    _sendChatMessage(q);
  };
  if (sendBtn) sendBtn.addEventListener('click', send);
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
  }

  updateChatContextLabel();
}

document.addEventListener('DOMContentLoaded', initChatPanel);