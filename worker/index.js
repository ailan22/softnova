// Worker de SoftNova: sirve el sitio estático y recibe el formulario de contacto en /api/contacto.
// El mensaje se reenvía a FormSubmit desde el servidor, así el navegador del visitante nunca
// se conecta a formsubmit.co (algunos celulares y bloqueadores cortan esa conexión).

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/contacto') {
      return handleContact(request, env, url);
    }
    return env.ASSETS.fetch(request);
  },
};

async function handleContact(request, env, url) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
  }

  const wantsJson = (request.headers.get('Accept') || '').includes('application/json');
  const reply = (ok, message) => {
    if (wantsJson) return Response.json({ ok, message }, { status: ok ? 200 : 502 });
    // Envío sin JavaScript: vuelve a la sección de contacto
    return Response.redirect(new URL(ok ? '/?enviado=1#contacto' : '/?enviado=0#contacto', url.origin), 303);
  };

  let form;
  try {
    form = await request.formData();
  } catch {
    return reply(false, 'Formulario inválido');
  }

  // Campo trampa: si un bot lo completa, se descarta sin avisarle
  if (form.get('_honey')) return reply(true, 'ok');

  const nombre = String(form.get('nombre') || '').trim();
  const email = String(form.get('email') || '').trim();
  const mensaje = String(form.get('mensaje') || '').trim();
  if (!nombre || !email || !mensaje) return reply(false, 'Faltan datos');

  const payload = new FormData();
  payload.set('_subject', 'Nuevo mensaje desde softnova.uy');
  payload.set('_captcha', 'false');
  payload.set('_replyto', email);
  payload.set('nombre', nombre);
  payload.set('telefono', String(form.get('telefono') || '').trim());
  payload.set('email', email);
  payload.set('mensaje', mensaje);

  try {
    const res = await fetch(`https://formsubmit.co/ajax/${env.CONTACT_EMAIL}`, {
      method: 'POST',
      headers: { Accept: 'application/json', Referer: `${url.origin}/`, Origin: url.origin },
      body: payload,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || String(data.success) !== 'true') {
      console.error('FormSubmit rechazó el mensaje', res.status, JSON.stringify(data));
      return reply(false, data.message || 'No se pudo enviar');
    }
    return reply(true, 'ok');
  } catch (err) {
    console.error('Error conectando con FormSubmit', err);
    return reply(false, 'No se pudo enviar');
  }
}
