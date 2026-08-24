/*!
 * Freddy Entrenamiento — capa de mejora progresiva.
 * 0 dependencias. Cada bloque es opcional: si algo falla o no está soportado,
 * la página sigue siendo 100% legible y navegable (HTML + CSS ya lo garantizan).
 */
(() => {
  'use strict';

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const canHover = matchMedia('(hover: hover) and (pointer: fine)');
  const root = document.documentElement;
  const hasIO = 'IntersectionObserver' in window;

  /* ---------------------------------------------------------------------
   * 1. Reveal-on-scroll: un único observer, se desconecta por elemento
   *    en cuanto revela (no sigue trabajando de fondo).
   * ------------------------------------------------------------------- */
  const revealTargets = document.querySelectorAll('[data-reveal]');
  if (revealTargets.length) {
    if (!hasIO || reduceMotion.matches) {
      revealTargets.forEach((el) => el.classList.add('is-visible'));
    } else {
      revealTargets.forEach((el, i) => el.style.setProperty('--reveal-i', i % 6));
      const io = new IntersectionObserver(
        (entries, obs) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
              obs.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
      );
      revealTargets.forEach((el) => io.observe(el));
    }
  }

  /* ---------------------------------------------------------------------
   * 2. Sección activa en la nav principal — IntersectionObserver en vez
   *    de "scroll" + cálculos por frame.
   * ------------------------------------------------------------------- */
  function initSectionTracking(group) {
    if (!hasIO) return;
    const trackers = document.querySelectorAll(`[data-track="${group}"]`);
    const links = document.querySelectorAll(`[data-nav-group="${group}"]`);
    if (!trackers.length || !links.length) return;

    const map = new Map();
    links.forEach((link) => map.set(link.getAttribute('data-nav-for'), link));

    const setActive = (id) => {
      map.forEach((link, key) => {
        const active = key === id;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
    );
    trackers.forEach((el) => io.observe(el));
  }
  initSectionTracking('nav');

  /* ---------------------------------------------------------------------
   * 3. Apertura de "Proyectos" con View Transitions cuando el navegador
   *    lo soporta; si no, el <details> nativo ya funciona sin JS.
   * ------------------------------------------------------------------- */
  const projectsToggle = document.getElementById('projects-toggle');
  if (projectsToggle && document.startViewTransition && !reduceMotion.matches) {
    const summary = projectsToggle.querySelector('summary');
    summary.addEventListener('click', (event) => {
      event.preventDefault();
      const willOpen = !projectsToggle.open;
      document.startViewTransition(() => {
        projectsToggle.open = willOpen;
      });
    });
  }

  /* ---------------------------------------------------------------------
   * 4. Barra de progreso: CSS scroll-driven animation cubre esto sin JS
   *    (ver styles.css, @supports animation-timeline: scroll()).
   *    Este bloque solo se activa como red de seguridad si el navegador
   *    NO soporta scroll-timelines — coste cero cuando sí lo soporta.
   * ------------------------------------------------------------------- */
  const progress = document.querySelector('.fe-progress');
  const supportsScrollTimeline =
    typeof CSS !== 'undefined' && CSS.supports && CSS.supports('animation-timeline: scroll()');
  if (progress && !supportsScrollTimeline && !reduceMotion.matches) {
    let ticking = false;
    const update = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      progress.style.transform = `scaleX(${max > 0 ? doc.scrollTop / max : 0})`;
      ticking = false;
    };
    addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          requestAnimationFrame(update);
          ticking = true;
        }
      },
      { passive: true }
    );
    update();
  }

  /* ---------------------------------------------------------------------
   * 5. Cursor a medida: solo se inicializa si hay puntero fino + hover
   *    (lazy init real — en touch no se añade ni un listener) y solo si
   *    el usuario no pidió menos movimiento.
   * ------------------------------------------------------------------- */
  if (canHover.matches && !reduceMotion.matches) {
    const cursor = document.querySelector('.fe-cursor');
    if (cursor) {
      root.classList.add('has-fe-cursor');
      let raf = null;
      const move = (event) => {
        const x = event.clientX;
        const y = event.clientY;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          cursor.style.setProperty('--x', `${x}px`);
          cursor.style.setProperty('--y', `${y}px`);
          raf = null;
        });
      };
      addEventListener('pointermove', move, { passive: true });

      document.querySelectorAll('[data-cursor-active]').forEach((el) => {
        el.addEventListener('pointerenter', () => cursor.classList.add('is-active'));
        el.addEventListener('pointerleave', () => cursor.classList.remove('is-active'));
      });
    }
  }

  /* ---------------------------------------------------------------------
   * 6. Feed unificado de "Novedades" (Instagram + YouTube + Facebook, y
   *    TikTok en cuanto esté disponible). Datos servidos por un Cloudflare
   *    Worker que agrega las APIs oficiales de cada red (ver /worker) —
   *    aquí solo se pide el JSON ya normalizado, se pinta y se filtra.
   *    Carga perezosa: no se pide nada hasta que la sección está cerca
   *    del viewport. Construido con DOM (createElement/textContent), no
   *    innerHTML, para no confiar en texto que viene de APIs externas.
   * ------------------------------------------------------------------- */
  (() => {
    const feed = document.getElementById('fe-feed');
    if (!feed) return;
    const feedUrl = feed.getAttribute('data-feed-url');
    const grid = document.getElementById('fe-feed-grid');
    const filtersBar = document.getElementById('fe-feed-filters');
    const status = document.getElementById('fe-feed-status');

    const PLATFORM_LABELS = {
      instagram: 'Instagram',
      youtube: 'YouTube',
      facebook: 'Facebook',
      tiktok: 'TikTok',
    };
    const FILTER_ORDER = ['instagram', 'youtube', 'tiktok', 'facebook'];

    const dateFormatter = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    const arrowSVG = () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '14');
      svg.setAttribute('height', '14');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '3');
      svg.setAttribute('stroke-linecap', 'square');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML =
        '<line x1="3" y1="12" x2="21" y2="12"></line><polyline points="13 4 21 12 13 20"></polyline>';
      return svg;
    };

    function buildCard(post, index) {
      const card = document.createElement('article');
      card.className = 'fe-feed-card';
      card.dataset.platform = post.platform;
      card.style.setProperty('--reveal-i', index % 8);

      const link = document.createElement('a');
      link.className = 'fe-feed-card__link';
      link.href = post.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.setAttribute('data-cursor-active', '');

      const media = document.createElement('span');
      media.className = post.image ? 'fe-feed-card__media' : 'fe-feed-card__media fe-feed-card__media--empty';
      if (post.image) {
        media.style.backgroundImage = `url("${post.image}")`;
        if (post.isVideo) {
          const play = document.createElement('span');
          play.className = 'fe-feed-card__play';
          play.innerHTML =
            '<svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>';
          media.appendChild(play);
        }
      }

      const body = document.createElement('span');
      body.className = 'fe-feed-card__body';

      const meta = document.createElement('span');
      meta.className = 'fe-feed-card__meta';
      const platformEl = document.createElement('span');
      platformEl.className = 'fe-feed-card__platform';
      platformEl.textContent = PLATFORM_LABELS[post.platform] || post.platform;
      const dateEl = document.createElement('span');
      dateEl.className = 'fe-feed-card__date';
      const d = new Date(post.date);
      dateEl.textContent = isNaN(d) ? '' : dateFormatter.format(d);
      meta.append(platformEl, dateEl);

      const textEl = document.createElement('span');
      textEl.className = 'fe-feed-card__text';
      textEl.textContent = post.text || '';

      const cta = document.createElement('span');
      cta.className = 'fe-feed-card__cta';
      cta.append('Ver original', arrowSVG());

      body.append(meta, textEl, cta);
      link.append(media, body);
      card.append(link);
      return card;
    }

    function applyFilter(platform) {
      grid.querySelectorAll('.fe-feed-card').forEach((card) => {
        card.hidden = platform !== 'all' && card.dataset.platform !== platform;
      });
    }

    function buildFilters(platformsPresent) {
      FILTER_ORDER.filter((p) => platformsPresent.has(p)).forEach((platform) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fe-feed__filter';
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', 'false');
        btn.dataset.filter = platform;
        btn.textContent = PLATFORM_LABELS[platform];
        filtersBar.appendChild(btn);
      });
      if (platformsPresent.size > 0) filtersBar.hidden = false;
    }

    filtersBar.addEventListener('click', (event) => {
      const btn = event.target.closest('.fe-feed__filter');
      if (!btn) return;
      filtersBar.querySelectorAll('.fe-feed__filter').forEach((b) => {
        b.classList.toggle('is-active', b === btn);
        b.setAttribute('aria-checked', b === btn ? 'true' : 'false');
      });
      applyFilter(btn.dataset.filter);
    });

    async function loadFeed() {
      if (!feedUrl || feedUrl.includes('TU-SUBDOMINIO')) {
        status.textContent =
          'El feed todavía no está conectado. Sigue las publicaciones directamente en Instagram, YouTube, Facebook o TikTok.';
        return;
      }
      try {
        const res = await fetch(feedUrl, { mode: 'cors' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const posts = Array.isArray(data.posts) ? data.posts : [];
        if (!posts.length) {
          status.textContent = 'Todavía no hay publicaciones para mostrar.';
          return;
        }
        status.remove();
        const platformsPresent = new Set(posts.map((p) => p.platform));
        buildFilters(platformsPresent);
        const fragment = document.createDocumentFragment();
        posts.forEach((post, i) => fragment.appendChild(buildCard(post, i)));
        grid.appendChild(fragment);

        if (reduceMotion.matches || !hasIO) {
          grid.querySelectorAll('.fe-feed-card').forEach((c) => c.classList.add('is-visible'));
        } else {
          const cardIO = new IntersectionObserver(
            (entries, obs) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) {
                  entry.target.classList.add('is-visible');
                  obs.unobserve(entry.target);
                }
              });
            },
            { threshold: 0.1, rootMargin: '0px 0px -5% 0px' }
          );
          grid.querySelectorAll('.fe-feed-card').forEach((c) => cardIO.observe(c));
        }
      } catch (err) {
        status.textContent =
          'No se ha podido cargar el feed ahora mismo. Prueba a recargar la página en un momento.';
        console.error('Feed unificado:', err);
      }
    }

    if (hasIO) {
      const lazyIO = new IntersectionObserver(
        (entries, obs) => {
          if (entries.some((e) => e.isIntersecting)) {
            loadFeed();
            obs.disconnect();
          }
        },
        { rootMargin: '600px 0px' }
      );
      lazyIO.observe(feed);
    } else {
      loadFeed();
    }
  })();

  /* ---------------------------------------------------------------------
   * 7. Entrenamiento — abre la app de EL MÉTODO (Apps Script) en un overlay
   *    a pantalla completa en vez de navegar fuera del sitio. El iframe no
   *    se crea hasta el primer clic (no gasta una carga de Apps Script en
   *    cada visita), y se limpia al cerrar para no dejar audio/vídeo de
   *    fondo ni una sesión colgada detrás del overlay.
   * ------------------------------------------------------------------- */
  (() => {
    const opener = document.getElementById('fe-open-training');
    const overlay = document.getElementById('fe-training');
    const frame = document.getElementById('fe-training-frame');
    const closeBtn = document.getElementById('fe-training-close');
    if (!opener || !overlay || !frame || !closeBtn) return;

    const url = opener.getAttribute('data-training-url');
    let loaded = false;

    function open() {
      if (!loaded) {
        frame.src = url;
        loaded = true;
      }
      overlay.hidden = false;
      document.body.style.overflow = 'hidden';
      closeBtn.focus();
    }

    function close() {
      overlay.hidden = true;
      document.body.style.overflow = '';
      opener.focus();
    }

    opener.addEventListener('click', (event) => {
      // Solo interceptamos el click normal (sin Ctrl/Cmd/clic-central, que el
      // usuario usa a propósito para abrir en pestaña nueva).
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      open();
    });

    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !overlay.hidden) close();
    });
  })();
})();
