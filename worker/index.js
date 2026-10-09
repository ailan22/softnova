// Worker de SoftNova: sirve el sitio estático y recibe el formulario de contacto en /api/contacto.
// El mensaje se manda por correo con Cloudflare Email Routing (binding SEND_EMAIL), sin servicios externos.

import { EmailMessage } from 'cloudflare:email';

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

  const field = (name, max) => String(form.get(name) || '').trim().slice(0, max);
  const nombre = field('nombre', 200);
  const telefono = field('telefono', 50);
  const email = field('email', 200);
  const mensaje = field('mensaje', 5000);
  if (!nombre || !email || !mensaje) return reply(false, 'Faltan datos');

  const body = [
    'Nuevo mensaje desde el formulario de softnova.uy',
    '',
    `Nombre: ${nombre}`,
    `Teléfono: ${telefono || '-'}`,
    `Correo: ${email}`,
    '',
    'Mensaje:',
    mensaje,
  ].join('\n');

  // Solo se usa como Reply-To si es un correo válido (y sin saltos de línea que inyecten encabezados)
  const replyTo = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(email) ? email : null;

  const raw = buildMime({
    from: `SoftNova Web <${env.FROM_EMAIL}>`,
    to: env.CONTACT_EMAIL,
    replyTo,
    subject: `Nuevo mensaje de ${nombre.replace(/[\r\n]+/g, ' ')}`,
    body,
    domain: env.FROM_EMAIL.split('@')[1],
  });

  try {
    await env.SEND_EMAIL.send(new EmailMessage(env.FROM_EMAIL, env.CONTACT_EMAIL, raw));
    return reply(true, 'ok');
  } catch (err) {
    console.error('Error enviando el correo', err && err.message);
    return reply(false, 'No se pudo enviar');
  }
}

function buildMime({ from, to, replyTo, subject, body, domain }) {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    replyTo && `Reply-To: ${replyTo}`,
    `Subject: =?UTF-8?B?${base64(subject)}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ].filter(Boolean);
  const encodedBody = base64(body).replace(/.{76}/g, '$&\r\n');
  return `${headers.join('\r\n')}\r\n\r\n${encodedBody}\r\n`;
}

function base64(text) {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
