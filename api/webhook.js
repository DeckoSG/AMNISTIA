export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { type, data } = req.body;

  if (!type || !data?.id) {
    return res.status(200).json({ ok: true });
  }

  try {
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
      headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });
    const pago = await mpRes.json();

    if (pago.status !== 'approved') {
      return res.status(200).json({ ok: true, status: pago.status });
    }

    const ventaIds = pago.external_reference ? pago.external_reference.split(',') : [];

    for (const ventaId of ventaIds) {
      if (!ventaId) continue;

      // Actualizar estado de la venta
      await fetch(`${process.env.SUPABASE_URL}/rest/v1/ventas?id=eq.${ventaId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({ mp_payment_id: String(data.id), estado: 'aprobado' })
      });

      // Obtener datos de la venta
      const ventaRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/ventas?id=eq.${ventaId}`, {
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        }
      });
      const ventas = await ventaRes.json();
      const venta = ventas[0];
      if (!venta) continue;

      // Generar UN SOLO código por compra
      const codigo = `AMN-${ventaId.slice(0,8).toUpperCase()}-${venta.mesa_id}`;
      await fetch(`${process.env.SUPABASE_URL}/rest/v1/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({
          venta_id: ventaId,
          codigo,
          mesa_id: venta.mesa_id,
          piso: venta.piso,
          lugar_num: 1,
          usado: false
        })
      });
      const codigos = [codigo];

      // Mandar correo con Brevo
      if (venta.comprador_email) {
        await enviarCorreoBrevo(venta, codigos);
      }
    }

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('Error webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function enviarCorreoBrevo(venta, codigos) {
  const pisoLabel = venta.piso === 'pa' ? 'Planta Alta' : 'Planta Baja';

  // Generar QR como imagen usando Google Charts API
  const codigo = codigos[0];
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(codigo)}&bgcolor=ffffff&color=1a0f2e&margin=10`;
  const qrBlock = `
    <div style="text-align:center;margin-bottom:16px;">
      <img src="${qrUrl}" alt="QR ${codigo}" style="width:220px;height:220px;border-radius:10px;border:4px solid #fff;"/>
      <div style="font-family:monospace;font-size:12px;color:rgba(255,255,255,0.5);margin-top:8px;">${codigo}</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:4px;">Válido para ${venta.lugares} lugar${venta.lugares>1?'es':''}</div>
    </div>`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#1a0f2e;color:#fff;margin:0;padding:0;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;margin-bottom:24px;">
      <h1 style="font-size:26px;color:#c9a8f0;margin:0;">Amnistía</h1>
      <p style="color:rgba(255,255,255,0.5);margin:4px 0 0;font-size:13px;">Tributo a José Madero</p>
    </div>
    <div style="background:#1c1c28;border-radius:16px;padding:24px;margin-bottom:16px;">
      <h2 style="font-size:17px;color:#5dca85;margin:0 0 12px;">¡Tu ticket está listo!</h2>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 18px;font-size:13px;">Hola ${venta.comprador_nombre || 'amig@'}, tu compra fue confirmada.</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:rgba(255,255,255,0.5);font-size:12px;border-top:1px solid rgba(255,255,255,0.07);">Evento</td><td style="padding:6px 0;color:#fff;font-size:12px;text-align:right;">Tributo a José Madero</td></tr>
        <tr><td style="padding:6px 0;color:rgba(255,255,255,0.5);font-size:12px;border-top:1px solid rgba(255,255,255,0.07);">Fecha</td><td style="padding:6px 0;color:#fff;font-size:12px;text-align:right;">Sábado 13 de junio, 2026</td></tr>
        <tr><td style="padding:6px 0;color:rgba(255,255,255,0.5);font-size:12px;border-top:1px solid rgba(255,255,255,0.07);">Horario</td><td style="padding:6px 0;color:#fff;font-size:12px;text-align:right;">Acceso 9:00 PM · Inicio 10:00 PM</td></tr>
        <tr><td style="padding:6px 0;color:rgba(255,255,255,0.5);font-size:12px;border-top:1px solid rgba(255,255,255,0.07);">Lugar</td><td style="padding:6px 0;color:#fff;font-size:12px;text-align:right;">McCarthy's Irish Pub · Boca del Río</td></tr>
        <tr><td style="padding:6px 0;color:rgba(255,255,255,0.5);font-size:12px;border-top:1px solid rgba(255,255,255,0.07);">Mesa</td><td style="padding:6px 0;color:#c9a8f0;font-size:13px;font-weight:bold;text-align:right;">${venta.mesa_id} · ${pisoLabel}</td></tr>
        <tr><td style="padding:6px 0;color:rgba(255,255,255,0.5);font-size:12px;border-top:1px solid rgba(255,255,255,0.07);">Lugares</td><td style="padding:6px 0;color:#fff;font-size:12px;text-align:right;">${venta.lugares}</td></tr>
        <tr><td style="padding:6px 0;color:rgba(255,255,255,0.5);font-size:12px;border-top:1px solid rgba(255,255,255,0.07);">Total pagado</td><td style="padding:6px 0;color:#5dca85;font-size:13px;font-weight:bold;text-align:right;">$${venta.total.toLocaleString('es-MX')} MXN</td></tr>
      </table>
    </div>
    <div style="background:#1c1c28;border-radius:16px;padding:24px;margin-bottom:16px;text-align:center;">
      <h3 style="font-size:14px;color:rgba(255,255,255,0.7);margin:0 0 6px;">Tu código QR de acceso</h3>
      <p style="font-size:11px;color:rgba(255,255,255,0.35);margin:0 0 16px;">Muestra este QR en la entrada — válido para todos tus lugares</p>
      ${qrBlock}
    </div>
    <div style="background:rgba(255,165,0,0.1);border:1px solid rgba(255,165,0,0.3);border-radius:10px;padding:14px;margin-bottom:20px;">
      <p style="color:#ffa500;font-size:12px;margin:0;line-height:1.6;">
        ⚠️ <strong>Importante:</strong> Evento +18. Presenta identificación oficial. Acceso 9:00 PM · Reservaciones hasta las 10:10 PM.
      </p>
    </div>
    <p style="text-align:center;color:rgba(255,255,255,0.25);font-size:11px;">McCarthy's Irish Pub · Boca del Río, Ver.<br>© 2026 Amnistía</p>
  </div>
</body>
</html>`;

  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: 'Amnistía Tickets', email: 'apolo.room10@gmail.com' },
      to: [{ email: venta.comprador_email, name: venta.comprador_nombre || '' }],
      subject: `🎵 Tu ticket — Mesa ${venta.mesa_id} · Tributo a José Madero`,
      htmlContent: html
    })
  });
}
