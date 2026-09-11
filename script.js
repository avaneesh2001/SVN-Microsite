import { initTransactions } from './transactions.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const header = document.querySelector('.site-header');
const nav = document.querySelector('.site-nav');
const links = [...nav.querySelectorAll('a')];
const menuButton = document.querySelector('.mudra-menu-button');
const menuLabel = menuButton.querySelector('.mudra-menu-label');
const mobileBrand = document.querySelector('.mobile-brand');
const navBackdrop = document.querySelector('.nav-backdrop');
const main = document.querySelector('main');
const footer = document.querySelector('footer');
const mobileNavQuery = window.matchMedia('(max-width: 820px)');
const sections = [...document.querySelectorAll('[data-section]')];
const sectionById = new Map(sections.map(section => [section.id, section]));
let isProgrammaticScroll = false;
let scrollEndTimer = 0;
let mobileMenuOpen = false;

document.documentElement.classList.add('motion-ready');
initTransactions();

const setMobileMenu = (open, restoreFocus = false) => {
  mobileMenuOpen = Boolean(open && mobileNavQuery.matches);
  header.classList.toggle('nav-open', mobileMenuOpen);
  document.body.classList.toggle('nav-open', mobileMenuOpen);
  menuButton.setAttribute('aria-expanded', String(mobileMenuOpen));
  menuButton.setAttribute('aria-label', mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu');
  menuLabel.textContent = mobileMenuOpen ? 'Close' : 'Menu';
  nav.inert = mobileNavQuery.matches && !mobileMenuOpen;
  main.inert = mobileMenuOpen;
  footer.inert = mobileMenuOpen;
  if (mobileMenuOpen) requestAnimationFrame(() => (links.find(link => link.classList.contains('active')) || links[0])?.focus({ preventScroll: true }));
  else if (restoreFocus) menuButton.focus({ preventScroll: true });
};

const syncMobileNavigation = () => setMobileMenu(false, false);
syncMobileNavigation();
if (mobileNavQuery.addEventListener) mobileNavQuery.addEventListener('change', syncMobileNavigation);
else mobileNavQuery.addListener(syncMobileNavigation);

menuButton.addEventListener('click', () => setMobileMenu(!mobileMenuOpen, mobileMenuOpen));
navBackdrop.addEventListener('click', () => setMobileMenu(false, true));
document.addEventListener('keydown', event => {
  if (!mobileMenuOpen) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    setMobileMenu(false, true);
    return;
  }
  if (event.key !== 'Tab') return;
  const focusableMenuItems = [menuButton,...links].filter(element => !element.inert && element.offsetParent !== null);
  const first = focusableMenuItems[0];
  const last = focusableMenuItems.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

const keepTabVisible = link => {
  const left = link.offsetLeft;
  const right = left + link.offsetWidth;
  const viewLeft = nav.scrollLeft;
  const viewRight = viewLeft + nav.clientWidth;
  if (left < viewLeft || right > viewRight) nav.scrollLeft = Math.max(0, left - (nav.clientWidth - link.offsetWidth) / 2);
};

const setActive = id => {
  links.forEach(link => {
    const active = link.hash === `#${id}`;
    link.classList.toggle('active', active);
    if (active) {
      link.setAttribute('aria-current', 'page');
      keepTabVisible(link);
    } else {
      link.removeAttribute('aria-current');
    }
  });
};

const updateNavHeight = () => document.documentElement.style.setProperty('--nav-height', `${header.getBoundingClientRect().height}px`);
updateNavHeight();
if ('ResizeObserver' in window) new ResizeObserver(updateNavHeight).observe(header);

const targetTop = target => target.getBoundingClientRect().top + window.scrollY - header.getBoundingClientRect().height - 16;

const releaseProgrammaticScroll = () => {
  window.clearTimeout(scrollEndTimer);
  isProgrammaticScroll = false;
  activateNearestSection();
};

const scrollToSection = (target, updateHistory = true, smooth = true) => {
  isProgrammaticScroll = true;
  window.clearTimeout(scrollEndTimer);
  setActive(target.id);
  const top = Math.max(0, targetTop(target));
  window.scrollTo({ top, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
  if (updateHistory && window.location.hash !== `#${target.id}`) history.pushState(null, '', `#${target.id}`);
  if (!smooth || reduceMotion || Math.abs(window.scrollY - top) < 1) requestAnimationFrame(releaseProgrammaticScroll);
};

links.forEach(link => link.addEventListener('click', event => {
  const target = sectionById.get(link.hash.slice(1));
  if (!target) return;
  event.preventDefault();
  if (mobileMenuOpen) setMobileMenu(false, false);
  scrollToSection(target);
}));

mobileBrand.addEventListener('click', event => {
  event.preventDefault();
  if (mobileMenuOpen) setMobileMenu(false, false);
  scrollToSection(sectionById.get('home'));
});

const intersecting = new Map();
const activateNearestSection = () => {
  if (isProgrammaticScroll) return;
  const focusLine = window.innerHeight * .38;
  const candidates = [...intersecting.values()].filter(entry => entry.isIntersecting);
  const nearest = candidates.reduce((best, entry) => {
    const distance = Math.abs(entry.target.getBoundingClientRect().top - focusLine);
    return !best || distance < best.distance ? { id: entry.target.id, distance } : best;
  }, null);
  if (nearest) setActive(nearest.id);
};

const sectionObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => intersecting.set(entry.target.id, entry));
  activateNearestSection();
}, { rootMargin: '-25% 0px -60% 0px', threshold: 0 });
sections.forEach(section => sectionObserver.observe(section));

window.addEventListener('scroll', () => {
  if (!isProgrammaticScroll) return;
  window.clearTimeout(scrollEndTimer);
  scrollEndTimer = window.setTimeout(releaseProgrammaticScroll, 140);
}, { passive: true });
if ('onscrollend' in window) window.addEventListener('scrollend', () => { if (isProgrammaticScroll) releaseProgrammaticScroll(); }, { passive: true });

sections.forEach(section => {
  [...section.querySelectorAll(':scope > .reveal')].forEach((element, index) => {
    element.style.setProperty('--reveal-delay', `${Math.min(index, 4) * 80}ms`);
  });
});

document.querySelectorAll('.tier').forEach((element, index) => {
  element.classList.add('reveal');
  element.style.setProperty('--reveal-delay', `${80 + (index % 2) * 80}ms`);
});
document.querySelectorAll('.council-grid article').forEach((element, index) => {
  element.classList.add('reveal');
  element.style.setProperty('--reveal-delay', `${(index % 2) * 80}ms`);
});

const revealElements = [...document.querySelectorAll('.reveal')];
const lines = [...document.querySelectorAll('.short-sep,.long-sep')];
lines.forEach(line => line.classList.add('line-reveal'));

const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('is-visible');
    revealObserver.unobserve(entry.target);
  });
}, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
revealElements.forEach(element => revealObserver.observe(element));
lines.forEach(line => revealObserver.observe(line));

const handleInitialHash = () => {
  const target = sectionById.get(window.location.hash.slice(1));
  if (target) scrollToSection(target, false, false);
};
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
if (document.fonts?.ready) document.fonts.ready.then(() => requestAnimationFrame(handleInitialHash));
else window.addEventListener('load', handleInitialHash, { once: true });
window.addEventListener('popstate', handleInitialHash);

const shimmer = document.querySelector('.cursor-shimmer');
const precisePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
if (precisePointer && !reduceMotion) {
  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight / 2;
  let currentX = targetX;
  let currentY = targetY;
  let shimmerFrame = 0;

  const animateShimmer = () => {
    currentX += (targetX - currentX) * .10;
    currentY += (targetY - currentY) * .10;
    if (Math.abs(targetX - currentX) > .05 || Math.abs(targetY - currentY) > .05) shimmer.style.transform = `translate3d(${currentX}px,${currentY}px,0)`;
    shimmerFrame = requestAnimationFrame(animateShimmer);
  };

  document.addEventListener('pointermove', event => {
    targetX = event.clientX;
    targetY = event.clientY;
  }, { passive: true });
  document.addEventListener('pointerover', event => {
    shimmer.classList.add('is-present');
    shimmer.classList.toggle('is-catching-light', Boolean(event.target.closest('a,button,.emblem,.tier,.payment-upi')));
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => shimmer.classList.remove('is-present','is-catching-light'));
  const startShimmer = () => { if (!shimmerFrame) shimmerFrame = requestAnimationFrame(animateShimmer); };
  const stopShimmer = () => { cancelAnimationFrame(shimmerFrame); shimmerFrame = 0; };
  document.addEventListener('visibilitychange', () => document.hidden ? stopShimmer() : startShimmer());
  startShimmer();
}

document.querySelector('.copy-button').addEventListener('click', async event => {
  const button = event.currentTarget;
  const originalLabel = button.textContent;
  const status = document.querySelector('.copy-status');
  try {
    await navigator.clipboard.writeText(button.dataset.copy);
    button.textContent = 'Copied';
    status.textContent = 'UPI ID copied to your clipboard.';
  } catch {
    const range = document.createRange();
    range.selectNode(document.querySelector('#upi-id'));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    status.textContent = 'UPI ID selected — copy it from your browser.';
  }
  window.setTimeout(() => { button.textContent = originalLabel; status.textContent = ''; }, 3000);
});
