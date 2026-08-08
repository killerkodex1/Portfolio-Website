const form = document.querySelector('#contact-form');
const status = document.querySelector('#form-status');
const themeToggle = document.querySelector('#theme-toggle');
const themeLabel = themeToggle.querySelector('.theme-label');
const themeColor = document.querySelector('meta[name="theme-color"]');

document.querySelector('#year').textContent = new Date().getFullYear();

function setTheme(theme) {
  const isDark = theme === 'dark';
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  themeToggle.setAttribute('aria-pressed', String(isDark));
  themeToggle.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} theme`);
  themeLabel.textContent = isDark ? 'Light' : 'Dark';
  themeColor.setAttribute('content', isDark ? '#081017' : '#07111e');
  try { localStorage.setItem('portfolio-theme', isDark ? 'dark' : 'light'); } catch { /* Theme still works without storage. */ }
}

setTheme(document.documentElement.dataset.theme);
themeToggle.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  const data = Object.fromEntries(new FormData(form));

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  button.disabled = true;
  button.textContent = 'Sending…';
  status.textContent = '';

  try {
    const response = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to send your message.');
    status.className = 'form-status success';
    status.textContent = result.message;
    if (result.fallback && result.directEmail) {
      window.location.href = result.directEmail;
    }
    form.reset();
  } catch (error) {
    status.className = 'form-status error';
    status.textContent = error.message;
  } finally {
    button.disabled = false;
    button.innerHTML = 'Send message <span>↗</span>';
  }
});
