/**
 * Workforce RH - Presentation Engine
 */

document.addEventListener('DOMContentLoaded', () => {
  const slides = Array.from(document.querySelectorAll('.slide'));
  const totalSlides = slides.length;
  let currentIdx = 0;

  const uiCurr = document.getElementById('curr-num');
  const uiTotal = document.getElementById('total-num');
  const uiProgress = document.getElementById('progress-fill');
  const btns = document.querySelectorAll('.ctrl-btn');

  if (uiTotal) uiTotal.textContent = totalSlides;

  function updateHUD() {
    if (uiCurr) uiCurr.textContent = currentIdx + 1;
    if (uiProgress) {
      const pct = ((currentIdx + 1) / totalSlides) * 100;
      uiProgress.style.width = `${pct}%`;
    }
  }

  function goToSlide(targetIdx) {
    if (targetIdx < 0 || targetIdx >= totalSlides || targetIdx === currentIdx) return;

    const currSlide = slides[currentIdx];
    const nextSlide = slides[targetIdx];

    // Clear ALL inline styles so CSS classes are never overridden
    slides.forEach(s => { s.style.transform = ''; s.style.opacity = ''; });

    // Remove classes
    currSlide.classList.remove('is-active', 'is-leaving');
    nextSlide.classList.remove('is-active', 'is-leaving');

    // Direction check
    if (targetIdx > currentIdx) {
      // Moving forward
      currSlide.classList.add('is-leaving'); // slides out left
    } else {
      // Moving backward — just remove current, activate next (CSS handles the rest)
      currSlide.classList.remove('is-active');
    }

    requestAnimationFrame(() => {
      nextSlide.classList.add('is-active');
    });

    currentIdx = targetIdx;
    updateHUD();
  }

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
      e.preventDefault();
      goToSlide(currentIdx + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      goToSlide(currentIdx - 1);
    }
  });

  // Buttons navigation
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const dir = parseInt(btn.getAttribute('data-dir'), 10);
      goToSlide(currentIdx + dir);
    });
  });

  // ── Fullscreen + presentation scaler ──────────────────────────
  // In fullscreen we scale the slides wrapper to a fixed 1280×720 canvas
  // (exactly like PowerPoint), centred on the physical screen.
  // Outside fullscreen we reset to the normal CSS (position:fixed; inset:0).
  const WRAPPER = document.getElementById('slides-wrapper');
  const BASE_W = 1280;
  const BASE_H = 720;

  function applyFullscreenScale() {
    document.documentElement.classList.add('is-fullscreen');
  }

  function resetScale() {
    document.documentElement.classList.remove('is-fullscreen');
  }

  function reactivateSlide() {
    // Suppress CSS transitions for one paint so the snap is invisible
    document.body.classList.add('no-transition');
    slides.forEach(s => {
      s.style.transform = '';
      s.style.opacity   = '';
      s.classList.remove('is-active', 'is-leaving');
    });
    slides[currentIdx].classList.add('is-active');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.body.classList.remove('no-transition');
    }));
  }

  const fsBtn  = document.getElementById('fullscreen-btn');
  const fsIcon = document.getElementById('fs-icon');

  function updateFsIcon() {
    if (!fsIcon) return;
    fsIcon.textContent = document.fullscreenElement
      ? 'close_fullscreen'
      : 'open_in_full';
  }

  if (fsBtn) {
    fsBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    document.addEventListener('fullscreenchange', () => {
      updateFsIcon();
      if (document.fullscreenElement) {
        applyFullscreenScale();
      } else {
        resetScale();
      }
      reactivateSlide();
    });

    // Re-scale if window resizes while in fullscreen (e.g. monitor switch)
    window.addEventListener('resize', () => {
      if (document.fullscreenElement) applyFullscreenScale();
    });
  }

  // Initial HUD setup
  updateHUD();

  // Set initial animation delays just in case
  slides.forEach(slide => {
    const animatedElements = slide.querySelectorAll('[data-anim]');
    animatedElements.forEach((el, index) => {
      if(!el.style.getPropertyValue('--anim-delay')){
        el.style.setProperty('--anim-delay', `${index * 150 + 100}ms`);
      }
    });
  });

  // ── PDF Download (via print) ──────────────────────────────────
  const pdfBtn = document.getElementById('download-pdf-btn');
  if (pdfBtn) {
    pdfBtn.addEventListener('click', () => {
      window.print();
    });
  }
});
