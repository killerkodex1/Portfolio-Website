const form = document.querySelector('#contact-form');
const status = document.querySelector('#form-status');

document.querySelector('#year').textContent = new Date().getFullYear();

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
    form.reset();
  } catch (error) {
    status.className = 'form-status error';
    status.textContent = error.message;
  } finally {
    button.disabled = false;
    button.innerHTML = 'Send message <span>↗</span>';
  }
});
