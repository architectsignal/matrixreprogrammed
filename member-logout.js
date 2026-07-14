(() => {
  const buttons = document.querySelectorAll('[data-member-logout]');
  if (!buttons.length) return;

  async function logout(button) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Logging out…';
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        cache: 'no-store',
        headers: { accept: 'application/json' }
      });
    } catch {}
    location.replace('/member-login.html');
    setTimeout(() => {
      button.disabled = false;
      button.textContent = original;
    }, 4000);
  }

  buttons.forEach(button => button.addEventListener('click', () => logout(button)));
})();
