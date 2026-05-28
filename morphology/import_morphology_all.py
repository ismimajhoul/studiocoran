"""Parse le fichier Quranic Arabic Corpus (quranic-corpus-morphology-0.4.txt)
et importe TOUS les segments (verbes, noms, particules...) dans la table
quran_morphology_all. Convertit les racines Buckwalter en arabe.

Temps 1 du chantier "noms + harf" : fondation données.
"""
import os, sys, re, subprocess

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

DIR = os.path.dirname(__file__)
SRC = os.path.join(DIR, 'quranic-corpus-morphology-0.4.txt')
MYSQL = 'C:/MAMP/bin/mysql/bin/mysql.exe'
DB = 'quran_wasla'

# ─── Buckwalter → arabe (lettres racines, sans diacritiques) ──────────────
BUCK2AR = {
    "'": 'ء', '|': 'آ', '>': 'أ', '&': 'ؤ', '<': 'إ', '}': 'ئ',
    'A': 'ا', 'b': 'ب', 'p': 'ة', 't': 'ت', 'v': 'ث', 'j': 'ج',
    'H': 'ح', 'x': 'خ', 'd': 'د', '*': 'ذ', 'r': 'ر', 'z': 'ز',
    's': 'س', '$': 'ش', 'S': 'ص', 'D': 'ض', 'T': 'ط', 'Z': 'ظ',
    'E': 'ع', 'g': 'غ', 'f': 'ف', 'q': 'ق', 'k': 'ك', 'l': 'ل',
    'm': 'م', 'n': 'ن', 'h': 'ه', 'w': 'و', 'Y': 'ى', 'y': 'ي',
    '{': 'ا',  # alif wasla → alif (pour les racines)
}

def buck_root_to_ar(root):
    """smw → 'س م و' ; rHm → 'ر ح م'. Espaces entre les lettres (format projet)."""
    if not root:
        return ''
    letters = [BUCK2AR.get(c, c) for c in root]
    return ' '.join(letters)

def parse_features(feat):
    """Extrait pos, lemma, root depuis la chaîne FEATURES."""
    pos = lemma = root = None
    for part in feat.split('|'):
        if part.startswith('POS:'):   pos   = part[4:]
        elif part.startswith('LEM:'): lemma = part[4:]
        elif part.startswith('ROOT:'):root  = part[5:]
    return pos, lemma, root

# ─── Parsing du fichier ───────────────────────────────────────────────────
LOC_RE = re.compile(r'^\((\d+):(\d+):(\d+):(\d+)\)$')
rows = []
in_data = False
with open(SRC, encoding='utf-8') as f:
    for line in f:
        line = line.rstrip('\n')
        if line.startswith('LOCATION\t'):
            in_data = True
            continue
        if not in_data or not line or line.startswith('#'):
            continue
        cols = line.split('\t')
        if len(cols) < 3:
            continue
        loc, form, tag = cols[0], cols[1], cols[2]
        feat = cols[3] if len(cols) > 3 else ''
        m = LOC_RE.match(loc)
        if not m:
            continue
        sura, aya, word, seg = (int(x) for x in m.groups())
        pos, lemma, root = parse_features(feat)
        if not pos:
            pos = tag  # segments PREFIX/SUFFIX sans POS: → on prend le TAG
        root_ar = buck_root_to_ar(root) if root else ''
        rows.append((sura, aya, word, seg, tag, pos,
                     lemma or '', root or '', root_ar, feat))

print(f'Parsed {len(rows)} segments.')

# ─── Génération du fichier SQL (DDL + INSERTs par batches) ────────────────
def esc(s):
    return s.replace('\\', '\\\\').replace("'", "\\'")

SQL_OUT = os.path.join(DIR, 'quran_morphology_all.sql')
BATCH = 500
with open(SQL_OUT, 'w', encoding='utf-8') as f:
    f.write("SET NAMES utf8mb4;\n")
    f.write("DROP TABLE IF EXISTS quran_morphology_all;\n")
    f.write("""CREATE TABLE quran_morphology_all (
  sura SMALLINT UNSIGNED NOT NULL,
  aya SMALLINT UNSIGNED NOT NULL,
  word_position SMALLINT UNSIGNED NOT NULL,
  segment TINYINT UNSIGNED NOT NULL,
  tag VARCHAR(8),
  pos VARCHAR(16),
  lemma_buck VARCHAR(64),
  root_buck VARCHAR(16),
  root_ar VARCHAR(32),
  features VARCHAR(255),
  PRIMARY KEY (sura, aya, word_position, segment),
  KEY idx_pos (pos),
  KEY idx_loc (sura, aya)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n""")
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i+BATCH]
        values = []
        for (sura, aya, word, seg, tag, pos, lemma, root, root_ar, feat) in chunk:
            values.append(
                f"({sura},{aya},{word},{seg},'{esc(tag)}','{esc(pos)}',"
                f"'{esc(lemma)}','{esc(root)}','{esc(root_ar)}','{esc(feat)}')"
            )
        f.write("INSERT INTO quran_morphology_all "
                "(sura,aya,word_position,segment,tag,pos,lemma_buck,root_buck,root_ar,features) "
                "VALUES " + ','.join(values) + ';\n')
print(f'SQL écrit : {SQL_OUT} ({os.path.getsize(SQL_OUT)//1024} KB)')

# ─── Import via stdin (pas de limite de longueur de ligne de commande) ────
with open(SQL_OUT, 'r', encoding='utf-8') as f:
    sql_content = f.read()
r = subprocess.run([MYSQL, '-u', 'root', '-proot', DB,
                    '--default-character-set=utf8mb4'],
                   input=sql_content, capture_output=True, text=True, encoding='utf-8')
if r.returncode != 0:
    print('ERREUR import:', r.stderr[:500])
    sys.exit(1)
print('Import terminé.')

# ─── Stats de contrôle ────────────────────────────────────────────────────
stats = subprocess.run([MYSQL, '-u', 'root', '-proot', DB,
        '--default-character-set=utf8mb4', '-B', '-N', '-e',
        "SELECT pos, COUNT(*) FROM quran_morphology_all GROUP BY pos ORDER BY COUNT(*) DESC LIMIT 15;"],
        capture_output=True, text=True, encoding='utf-8')
print('\nTop POS :')
print(stats.stdout)
