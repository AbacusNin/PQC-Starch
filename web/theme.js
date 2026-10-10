// Switches between the AudiOS-style dark theme and the regular light theme. Both stylesheets are on the page;
// the inactive one keeps media="not all", so the browser loads it in the background and a switch is instant.
// The choice is a per-browser convenience, so it lives in localStorage and the page works without it.
const KEY = 'pqc-buyer-workbook:style';
const STYLES = {audios:{link:'style-audios', scheme:'dark'}, regular:{link:'style-regular', scheme:'light'}};

const saved = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const remember = value => { try { localStorage.setItem(KEY, value); } catch { /* storage blocked: the choice lasts until the page closes */ } };

export function applyStyle(name) {
  const choice = STYLES[name] ? name : 'audios';
  const root = document.documentElement;
  const target = document.getElementById(STYLES[choice].link);
  const show = () => {
    for (const [key, style] of Object.entries(STYLES)) document.getElementById(style.link).media = key === choice ? 'all' : 'not all';
    root.dataset.theme = choice;
    document.querySelector('meta[name="color-scheme"]').content = STYLES[choice].scheme;
    for (const button of document.querySelectorAll('[data-theme-choice]')) button.setAttribute('aria-pressed', String(button.dataset.themeChoice === choice));
    delete root.dataset.styling;
  };
  // If the chosen stylesheet has not arrived yet, keep the page hidden rather than show it unstyled.
  if (target.sheet) show();
  else {
    root.dataset.styling = 'loading';
    target.addEventListener('load', show, {once:true});
    target.addEventListener('error', () => delete root.dataset.styling, {once:true});
  }
  return choice;
}

applyStyle(saved());
document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-theme-choice]');
  if (button) remember(applyStyle(button.dataset.themeChoice));
});
