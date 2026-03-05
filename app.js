/* ============================================================
   PROGRAMME ÉLECTORAL — Application JavaScript
   Wasquehal Vivante — Benoît Tirmarche — 2026
   ============================================================
   1.  État global
   2.  Utilitaires (hex→rgb, HTML escaping, surlignage)
   3.  Chargement JSON
   4.  Initialisation
   5.  Routeur (hash-based)
   6.  Navigation avec transition
   7.  Vue Accueil
   8.  Vue Thème
   9.  Accordéon
   10. Recherche temps réel
   11. Fil d'Ariane
   ============================================================ */


/* ============================================================
   1. ÉTAT GLOBAL
   ============================================================ */
const state = {
  program:       null,   // Données chargées depuis programme.json
  pendingPropId: null,   // Proposition à ouvrir après navigation
  navigating:    false,  // Verrou anti-double-clic
};


/* ============================================================
   2. UTILITAIRES
   ============================================================ */

/**
 * Convertit un code hexadécimal en "r,g,b" pour rgba() via CSS custom property.
 * Ex : "#e92e6c" → "233,46,108"
 */
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return '100,100,100';
  return `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}`;
}

/** Échappe les caractères HTML dangereux. */
function esc(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#x27;');
}

/**
 * Surligne les occurrences de `query` dans `text` avec <mark>,
 * en échappant correctement le HTML.
 */
function highlight(text, query) {
  if (!text || !query) return esc(text);
  const safeQ = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts  = text.split(new RegExp(`(${safeQ})`, 'gi'));
  return parts
    .map((p, i) => (i % 2 === 1 ? `<mark>${esc(p)}</mark>` : esc(p)))
    .join('');
}

/** Retrouve une proposition (et son thème) depuis son id. */
function findProp(propId) {
  for (const theme of (state.program?.themes ?? [])) {
    const proposition = (theme.propositions ?? []).find(p => p.id === propId);
    if (proposition) return { theme, proposition };
  }
  return null;
}


/* ============================================================
   3. CHARGEMENT DES DONNÉES
   ============================================================ */
async function loadProgram() {
  document.getElementById('app').innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <span class="loading-text">Chargement du programme…</span>
    </div>
  `;

  try {
    const res = await fetch('programme.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.program = await res.json();
    initApp();
  } catch (err) {
    console.error('[Wasquehal Vivante] Erreur :', err);
    document.getElementById('app').innerHTML = `
      <div class="error-state">
        <div class="error-icon">⚠️</div>
        <h2 class="error-title">Impossible de charger le programme</h2>
        <p class="error-body">
          Le fichier <code>programme.json</code> est introuvable ou invalide.<br>
          Ce site nécessite un serveur HTTP local (les navigateurs bloquent <code>fetch</code> en <code>file://</code>).
        </p>
        <code class="error-hint">python3 -m http.server 8000 &nbsp;·&nbsp; npx serve &nbsp;·&nbsp; php -S localhost:8000</code>
      </div>
    `;
  }
}


/* ============================================================
   4. INITIALISATION
   ============================================================ */
function initApp() {
  const meta = state.program.meta ?? {};

  // Titre de la page
  document.title = meta.list ? `${meta.list} — Programme 2026` : 'Programme Municipal';

  // Footer
  const fList     = document.getElementById('footer-list');
  const fCity     = document.getElementById('footer-city');
  const fElection = document.getElementById('footer-election');

  if (fList)     fList.textContent     = meta.list ? `${meta.list}${meta.candidate ? ' · ' + meta.candidate : ''}` : '';
  if (fCity)     fCity.textContent     = meta.city     ?? '';
  if (fElection) fElection.textContent = meta.election ?? '';

  // Boutons de navigation
  document.getElementById('nav-brand-btn')?.addEventListener('click', () => navigateTo(''));
  document.getElementById('nav-home-btn')?.addEventListener('click',  () => navigateTo(''));

  // Routeur
  window.addEventListener('hashchange', render);

  // Recherche
  setupSearch();

  // Premier rendu
  render();
}


/* ============================================================
   5. ROUTEUR
   ============================================================ */

/**
 * Analyse le hash courant.
 * "" ou "#"                → { view: 'home' }
 * "#theme/tid"             → { view: 'theme', themeId: 'tid' }
 * "#theme/tid/pid"         → { view: 'theme', themeId: 'tid', propId: 'pid' }
 */
function parseHash() {
  const hash  = window.location.hash.slice(1);
  const parts = hash.split('/');
  if (parts[0] === 'theme' && parts[1]) {
    return { view: 'theme', themeId: parts[1], propId: parts[2] ?? null };
  }
  return { view: 'home' };
}

function render() {
  if (!state.program) return;
  const route = parseHash();

  if (route.view === 'theme') {
    const theme = state.program.themes.find(t => t.id === route.themeId);
    theme ? renderThemeView(theme, route.propId) : renderHomeView();
  } else {
    renderHomeView();
  }
}


/* ============================================================
   6. NAVIGATION AVEC TRANSITION
   ============================================================ */

/**
 * Navigue vers un hash avec une transition fade-out → fade-in.
 * @param {string}      hash   - Ex : "theme/mobilite" ou "" pour l'accueil
 * @param {string|null} propId - Si renseigné, ouvre cette proposition au chargement
 */
function navigateTo(hash, propId = null) {
  if (state.navigating) return;

  const currentHash = window.location.hash.slice(1);
  if (currentHash === hash && !propId) return;

  state.navigating    = true;
  state.pendingPropId = propId;

  const app = document.getElementById('app');
  app.style.transition = 'opacity 0.20s ease, transform 0.20s ease';
  app.style.opacity    = '0';
  app.style.transform  = 'translateY(-8px)';

  setTimeout(() => {
    if (currentHash === hash) {
      render();           // Même hash mais propId différent
    } else {
      window.location.hash = hash; // hashchange déclenche render()
    }
    state.navigating = false;
  }, 200);
}

/** Fade-in du contenu après injection du nouveau HTML. */
function animateIn() {
  const app = document.getElementById('app');
  app.style.transition = 'none';
  app.style.opacity    = '0';
  app.style.transform  = 'translateY(14px)';

  void app.offsetHeight; // Force reflow

  app.style.transition = 'opacity 0.32s ease, transform 0.32s ease';
  requestAnimationFrame(() => {
    app.style.opacity   = '1';
    app.style.transform = 'translateY(0)';
  });
}


/* ============================================================
   7. VUE ACCUEIL
   ============================================================ */
function renderHomeView() {
  setBreadcrumb([{ label: 'Accueil', active: true }]);

  const meta   = state.program.meta   ?? {};
  const themes = state.program.themes ?? [];

  document.getElementById('app').innerHTML = `
    <!-- Hero -->
    <section class="home-hero">
      <div class="hero-accent" aria-hidden="true"></div>
      <div class="hero-content">
        <div class="hero-list">${esc(meta.list ?? 'Programme Municipal')}</div>
        <div class="hero-candidate">${meta.candidate ? 'avec ' + esc(meta.candidate) : ''}</div>
        ${meta.election ? `<div class="hero-election">${esc(meta.election)}</div>` : ''}
        ${meta.tagline ? `<div class="hero-tagline">${esc(meta.tagline)}</div>` : ''}
      </div>
    </section>

    <!-- Grille des thèmes -->
    <p class="themes-section-title">Nos ${themes.length} thèmes de programme</p>
    <div class="themes-grid" role="list">
      ${themes.map(t => buildThemeCard(t)).join('')}
      <!-- Bouton "Mesure Aléatoire" — dans la grille -->
      <button
        class="theme-card random-card"
        id="btn-random-prop"
        role="listitem"
        tabindex="0"
        aria-label="Découvrir une mesure aléatoire"
      >
        <div class="card-icon-wrap random-icon-wrap" aria-hidden="true">🎲</div>
        <div class="card-body">
          <div class="card-title">Découvrir une mesure au hasard</div>
        </div>
      </button>
    </div>

    <!-- Bloc programme : télécharger + partager -->
    <div class="programme-actions">
      <a href="Programme-Wasquehal-Vivante.pdf" download class="programme-action-card" aria-label="Télécharger le programme complet en PDF">
        <div class="programme-action-icon" aria-hidden="true">📄</div>
        <div class="programme-action-text">Télécharger le programme complet</div>
        <div class="programme-action-sub">Format PDF</div>
      </a>
      <div class="programme-action-card programme-action-qr">
        <div class="programme-action-icon" aria-hidden="true">
          <img
            src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=http://wasquehal-vivante.fr/"
            alt="QR Code vers wasquehal-vivante.fr"
            class="qr-code-img"
            loading="lazy"
          >
        </div>
        <div class="programme-action-text">Partagez le programme</div>
        <div class="programme-action-sub">Scannez ou partagez wasquehal-vivante.fr</div>
      </div>
    </div>

    <!-- Section "Votre équipe" -->
    <section class="team-section">
      <h2 class="team-title">Votre équipe</h2>
      <p class="team-subtitle">35 Wasquehalien·nes engagé·es pour leur ville</p>
      <div class="team-photo-wrapper">
        <img
          src="Wasquehal-Vivante-Groupe-low.jpg"
          alt="L'équipe Wasquehal Vivante"
          class="team-photo"
          loading="lazy"
          draggable="false"
        >
      </div>
    </section>
  `;

  animateIn();

  // Attacher les événements aux cartes
  themes.forEach(theme => {
    const card = document.getElementById(`tc-${theme.id}`);
    if (!card) return;
    const go = () => navigateTo(`theme/${theme.id}`);
    card.addEventListener('click', go);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
  });

  // Attacher l'événement au bouton "Aléatoire"
  document.getElementById('btn-random-prop')?.addEventListener('click', openRandomProp);
}

/** Choisit une proposition au hasard et y navigue. */
function openRandomProp() {
  const allProps = [];
  const themes = state.program.themes ?? [];

  themes.forEach(theme => {
    (theme.propositions ?? []).forEach(prop => {
      allProps.push({ themeId: theme.id, propId: prop.id });
    });
  });

  if (allProps.length === 0) return;

  const randomIdx = Math.floor(Math.random() * allProps.length);
  const target = allProps[randomIdx];

  navigateTo(`theme/${target.themeId}`, target.propId);
}

/** HTML d'une carte de thème (layout horizontal compact). */
function buildThemeCard(theme) {
  const rgb   = hexToRgb(theme.color);
  const count = (theme.propositions ?? []).length;
  return `
    <div
      class="theme-card"
      id="tc-${esc(theme.id)}"
      role="listitem"
      tabindex="0"
      aria-label="${esc(theme.title)} — ${count} proposition${count > 1 ? 's' : ''}"
      style="--card-color: ${esc(theme.color)}; --card-rgb: ${rgb}"
    >
      <div class="card-icon-wrap" aria-hidden="true">${theme.icon ?? '📌'}</div>
      <div class="card-body">
        <div class="card-title">${esc(theme.title)}</div>
        <div class="card-desc">${esc(theme.description ?? '')}</div>
      </div>
      <span class="card-count">${count}</span>
    </div>
  `;
}


/* ============================================================
   8. VUE THÈME
   ============================================================ */
function renderThemeView(theme, propIdToOpen = null) {
  setBreadcrumb([
    { label: 'Accueil',   action: () => navigateTo('') },
    { label: theme.title, active: true },
  ]);

  const rgb   = hexToRgb(theme.color);
  const props = theme.propositions ?? [];

  document.getElementById('app').innerHTML = `
    <button class="back-btn" id="back-btn" aria-label="Retour à l'accueil">
      ← Retour au programme
    </button>

    <header
      class="theme-header"
      style="--theme-color: ${esc(theme.color)}; --theme-rgb: ${rgb}"
    >
      <div class="theme-header-icon" aria-hidden="true">${theme.icon ?? '📌'}</div>
      <div class="theme-header-content">
        <h1 class="theme-header-title">${esc(theme.title)}</h1>
        <p class="theme-header-desc">${esc(theme.description ?? '')}</p>
        <span class="theme-header-count">${props.length} proposition${props.length > 1 ? 's' : ''}</span>
      </div>
    </header>

    <div
      class="propositions-list"
      style="--theme-color: ${esc(theme.color)}; --theme-rgb: ${rgb}"
    >
      ${props.map((p, i) => buildPropCard(p, i + 1)).join('')}
    </div>
  `;

  animateIn();

  // Bouton retour
  document.getElementById('back-btn').addEventListener('click', () => navigateTo(''));

  // Accordéons
  props.forEach(prop => {
    const header = document.getElementById(`ph-${prop.id}`);
    if (header) {
      header.addEventListener('click',   () => toggleProp(prop.id, theme));
      header.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleProp(prop.id, theme); }
      });
    }
  });

  // Ouvrir une proposition cible (depuis recherche ou lien croisé)
  const targetId = propIdToOpen ?? state.pendingPropId;
  state.pendingPropId = null;

  if (targetId && props.some(p => p.id === targetId)) {
    setTimeout(() => {
      openProp(targetId, theme);
      const el = document.getElementById(`pc-${targetId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('highlighted');
        setTimeout(() => el.classList.remove('highlighted'), 2200);
      }
    }, 360);
  }
}

/** HTML d'une carte de proposition (accordéon). */
function buildPropCard(prop, number) {
  // Badge MEL si la proposition concerne la MEL
  const melBadge = prop.mel
    ? `<span class="mel-badge" title="Compétence Métropole Européenne de Lille">MEL</span>`
    : '';

  return `
    <div class="prop-card" id="pc-${esc(prop.id)}">
      <div
        class="prop-header"
        id="ph-${esc(prop.id)}"
        role="button"
        tabindex="0"
        aria-expanded="false"
        aria-controls="pb-${esc(prop.id)}"
      >
        <div class="prop-number" aria-hidden="true">${number}</div>
        <div class="prop-text">
          <div class="prop-title">
            ${esc(prop.title)}${melBadge}
          </div>
          <p class="prop-summary">${esc(prop.summary ?? '')}</p>
        </div>
        <span class="prop-chevron" aria-hidden="true">⌄</span>
      </div>

      <div
        class="prop-body"
        id="pb-${esc(prop.id)}"
        role="region"
        aria-labelledby="ph-${esc(prop.id)}"
      >
        <div class="prop-body-inner">
          <p class="prop-detail">${esc(prop.detail ?? '')}</p>
          ${buildRelatedLinks(prop.related ?? [], prop)}
        </div>
      </div>
    </div>
  `;
}

/** HTML des chips de liens croisés. */
function buildRelatedLinks(relatedIds, currentProp) {
  if (!relatedIds.length) return '';

  const chips = relatedIds.map(id => {
    const found = findProp(id);
    if (!found) return '';
    const { theme, proposition } = found;

    // Trouver le thème de la proposition courante pour comparer
    const currentFound = findProp(currentProp.id);
    const isSameTheme  = currentFound?.theme.id === theme.id;

    const label = isSameTheme
      ? proposition.title
      : `${theme.title} → ${proposition.title}`;

    return `
      <span
        class="related-chip"
        data-theme-id="${esc(theme.id)}"
        data-prop-id="${esc(id)}"
        role="link"
        tabindex="0"
        title="Voir aussi : ${esc(label)}"
      >🔗 ${esc(label)}</span>
    `;
  }).filter(Boolean).join('');

  if (!chips) return '';

  return `
    <div class="prop-related">
      <span class="related-label">Voir aussi :</span>
      ${chips}
    </div>
  `;
}


/* ============================================================
   9. ACCORDÉON
   ============================================================ */
function toggleProp(propId, theme) {
  const card = document.getElementById(`pc-${propId}`);
  if (!card) return;
  card.classList.contains('open') ? closeProp(propId) : openProp(propId, theme);
}

function openProp(propId, theme) {
  const card   = document.getElementById(`pc-${propId}`);
  const body   = document.getElementById(`pb-${propId}`);
  const header = document.getElementById(`ph-${propId}`);
  if (!card || !body) return;

  card.classList.add('open');
  header?.setAttribute('aria-expanded', 'true');
  body.style.maxHeight = body.scrollHeight + 'px';

  // Activer les chips de liens croisés (une seule fois)
  card.querySelectorAll('.related-chip:not([data-wired])').forEach(chip => {
    chip.dataset.wired = '1';
    const go = () => navigateTo(`theme/${chip.dataset.themeId}`, chip.dataset.propId);
    chip.addEventListener('click', go);
    chip.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
  });
}

function closeProp(propId) {
  const card   = document.getElementById(`pc-${propId}`);
  const body   = document.getElementById(`pb-${propId}`);
  const header = document.getElementById(`ph-${propId}`);
  if (!card || !body) return;

  card.classList.remove('open');
  header?.setAttribute('aria-expanded', 'false');
  body.style.maxHeight = '0';
}


/* ============================================================
   10. RECHERCHE EN TEMPS RÉEL
   ============================================================ */
function setupSearch() {
  const input    = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear');
  const dropdown = document.getElementById('search-dropdown');
  if (!input) return;

  let timer;

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearBtn?.classList.toggle('active', q.length > 0);

    clearTimeout(timer);
    timer = setTimeout(() => {
      q.length >= 2
        ? renderSearchDropdown(performSearch(q), q)
        : hideDropdown();
    }, 160);
  });

  clearBtn?.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.remove('active');
    hideDropdown();
    input.focus();
  });

  // Fermer au clic hors du champ
  document.addEventListener('click', e => {
    if (!e.target.closest('.nav-search-wrapper')) hideDropdown();
  });

  // Fermer avec Échap
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { hideDropdown(); input.blur(); }
  });
}

/** Recherche dans tout le programme (titre + résumé + détail). */
function performSearch(query) {
  const q       = query.toLowerCase();
  const results = [];

  for (const theme of (state.program?.themes ?? [])) {
    const matching = (theme.propositions ?? []).filter(p =>
      p.title?.toLowerCase().includes(q)   ||
      p.summary?.toLowerCase().includes(q) ||
      p.detail?.toLowerCase().includes(q)  ||
      theme.title?.toLowerCase().includes(q)
    );
    if (matching.length) results.push({ theme, propositions: matching });
  }
  return results;
}

/** Affiche les résultats dans le dropdown. */
function renderSearchDropdown(results, query) {
  const dropdown = document.getElementById('search-dropdown');
  if (!dropdown) return;

  if (!results.length) {
    dropdown.innerHTML = `<div class="search-no-results">Aucun résultat pour <strong>${esc(query)}</strong></div>`;
    dropdown.classList.add('visible');
    return;
  }

  dropdown.innerHTML = results.map(group => `
    <div class="search-group">
      <div class="search-group-label" style="--group-color: ${esc(group.theme.color)}">
        ${group.theme.icon ?? ''} ${esc(group.theme.title)}
      </div>
      ${group.propositions.map(prop => `
        <div
          class="search-result-item"
          data-theme-id="${esc(group.theme.id)}"
          data-prop-id="${esc(prop.id)}"
          style="--item-color: ${esc(group.theme.color)}"
          role="option"
          tabindex="0"
        >
          <div class="search-result-title">${highlight(prop.title, query)}</div>
          <div class="search-result-summary">${esc(prop.summary ?? '')}</div>
        </div>
      `).join('')}
    </div>
  `).join('');

  dropdown.classList.add('visible');

  // Événements sur les résultats
  dropdown.querySelectorAll('.search-result-item').forEach(item => {
    const go = () => {
      hideDropdown();
      const inp = document.getElementById('search-input');
      if (inp) {
        inp.value = '';
        document.getElementById('search-clear')?.classList.remove('active');
      }
      navigateTo(`theme/${item.dataset.themeId}`, item.dataset.propId);
    };
    item.addEventListener('click', go);
    item.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  });
}

function hideDropdown() {
  document.getElementById('search-dropdown')?.classList.remove('visible');
}


/* ============================================================
   11. FIL D'ARIANE
   ============================================================ */

/**
 * Met à jour le fil d'Ariane.
 * @param {Array<{label: string, active?: boolean, action?: Function}>} items
 */
function setBreadcrumb(items) {
  const el = document.getElementById('breadcrumb');
  if (!el) return;

  el.innerHTML = items.map((item, i) => {
    const sep = i > 0 ? `<span class="crumb-sep" aria-hidden="true">›</span>` : '';
    if (item.active) {
      return `${sep}<span class="crumb-item active">${esc(item.label)}</span>`;
    }
    return `${sep}<span class="crumb-item clickable" data-idx="${i}" role="link" tabindex="0">${esc(item.label)}</span>`;
  }).join('');

  // Attacher les actions
  el.querySelectorAll('.crumb-item.clickable').forEach(node => {
    const idx    = parseInt(node.dataset.idx, 10);
    const action = items[idx]?.action;
    if (action) {
      node.addEventListener('click', action);
      node.addEventListener('keydown', e => { if (e.key === 'Enter') action(); });
    }
  });
}


/* ============================================================
   DÉMARRAGE
   ============================================================ */
document.addEventListener('DOMContentLoaded', loadProgram);
