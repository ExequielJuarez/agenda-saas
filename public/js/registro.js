// Registro público: elige el rubro y crea la cuenta con la prueba gratis.
import { api, h } from './common.js';

const form = document.getElementById('form');
const err = document.getElementById('err');
const select = document.getElementById('rubro');

const { rubros } = await api('/api/rubros');
rubros.forEach((r) => select.append(h('option', { value: r.id }, r.name)));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.textContent = '';
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    await api('/api/signup', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
    location.href = '/app';
  } catch (ex) {
    err.textContent = ex.message;
    btn.disabled = false;
  }
});
