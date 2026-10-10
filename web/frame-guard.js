// GitHub Pages cannot send a frame-ancestors header, and a meta CSP cannot set one, so the page protects
// itself. The stylesheet hides the body until this check passes; a frame that blocks scripts therefore shows
// nothing to click. Inside a frame the workbook replaces itself with a link and stops loading.
if (window.top === window.self) {
  document.documentElement.removeAttribute('data-guard');
} else {
  const notice = document.createElement('main');
  notice.className = 'framed-notice';
  const heading = document.createElement('h1');
  heading.textContent = 'The workbook was opened inside another page';
  const text = document.createElement('p');
  text.textContent = 'To protect the records saved in this browser, the workbook only runs in its own tab.';
  const link = document.createElement('a');
  link.href = location.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.textContent = 'Open the workbook in its own tab';
  notice.append(heading, text, link);
  document.body.replaceChildren(notice);
  document.documentElement.removeAttribute('data-guard');
  throw new Error('PQC Buyer Workbook stopped: it was loaded inside a frame.');
}
