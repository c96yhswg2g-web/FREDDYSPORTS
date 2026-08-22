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
   * 2. Sección activa: misma lógica reutilizada para la nav principal
   *    y para el índice editorial de "Novedades" (dos grupos, dos IO).
   *    IntersectionObserver en vez de "scroll" + cálculos por frame.
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
  initSectionTracking('index');

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
})();
