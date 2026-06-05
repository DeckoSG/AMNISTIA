export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { type, data } = req.body;

  if (!type || !data?.id) {
    return res.status(200).json({ ok: true });
  }

  try {
    // Obtener detalles del pago de MP
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
      headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });
    const pago = await mpRes.json();

    if (pago.status !== 'approved') {
      return res.status(200).json({ ok: true, status: pago.status });
    }

    // Obtener IDs de ventas del external_reference
    const ventaIds = pago.external_reference ? pago.external_reference.split(',') : [];

    for (const ventaId of ventaIds) {
      if (!ventaId) continue;

      // Actualizar estado de la venta a aprobado
      await fetch(`${process.env.SUPABASE_URL}/rest/v1/ventas?id=eq.${ventaId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({
          mp_payment_id: String(data.id),
          estado: 'aprobado'
        })
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

      // Generar códigos de ticket
      const codigos = [];
      for (let i = 1; i <= venta.lugares; i++) {
        const codigo = `AMN-${ventaId.slice(0,8).toUpperCase()}-${venta.mesa_id}-${i}`;

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
            lugar_num: i,
            usado: false
          })
        });
        codigos.push(codigo);
      }

      // Mandar correo si hay email
      if (venta.comprador_email) {
        await enviarCorreo(venta, codigos);
      }
    }

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('Error webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function enviarCorreo(venta, codigos) {
  const pisoLabel = venta.piso === 'pa' ? 'Planta Alta' : 'Planta Baja';
  const codigosHtml = codigos.map(c =>
    `<div style="background:#0f0f18;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px 12px;margin-bottom:6px;font-family:monospace;font-size:13px;color:#c9a8f0;">${c}</div>`
  ).join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#1a0f2e;color:#fff;margin:0;padding:0;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;margin-bottom:28px;">
      <h1 style="font-size:26px;color:#c9a8f0;margin:0;">Amnistía</h1>
      <p style="color:rgba(255,255,255,0.5);margin:4px 0 0;font-size:13px;">Tributo a José Madero</p>
    </div>
    <div style="background:#1c1c28;border-radius:16px;padding:28px;margin-bottom:16px;">
      <h2 style="font-size:18px;color:#5dca85;margin:0 0 14px;">¡Tu ticket está listo!</h2>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 20px;font-size:14px;">Hola ${venta.comprador_nombre || 'amig@'}, tu compra fue confirmada.</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:7px 0;color:rgba(255,255,255,0.5);font-size:13px;border-top:1px solid rgba(255,255,255,0.07);">Evento</td><td style="padding:7px 0;color:#fff;font-size:13px;text-align:right;">Tributo a José Madero</td></tr>
        <tr><td style="padding:7px 0;color:rgba(255,255,255,0.5);font-size:13px;border-top:1px solid rgba(255,255,255,0.07);">Fecha</td><td style="padding:7px 0;color:#fff;font-size:13px;text-align:right;">Sábado 13 de junio, 2025</td></tr>
        <tr><td style="padding:7px 0;color:rgba(255,255,255,0.5);font-size:13px;border-top:1px solid rgba(255,255,255,0.07);">Horario</td><td style="padding:7px 0;color:#fff;font-size:13px;text-align:right;">Acceso 9:00 PM · Inicio 10:00 PM</td></tr>
        <tr><td style="padding:7px 0;color:rgba(255,255,255,0.5);font-size:13px;border-top:1px solid rgba(255,255,255,0.07);">Lugar</td><td style="padding:7px 0;color:#fff;font-size:13px;text-align:right;">McCarthy's Irish Pub · Boca del Río</td></tr>
        <tr><td style="padding:7px 0;color:rgba(255,255,255,0.5);font-size:13px;border-top:1px solid rgba(255,255,255,0.07);">Mesa</td><td style="padding:7px 0;color:#c9a8f0;font-size:13px;font-weight:bold;text-align:right;">${venta.mesa_id} · ${pisoLabel}</td></tr>
        <tr><td style="padding:7px 0;color:rgba(255,255,255,0.5);font-size:13px;border-top:1px solid rgba(255,255,255,0.07);">Lugares</td><td style="padding:7px 0;color:#fff;font-size:13px;text-align:right;">${venta.lugares}</td></tr>
        <tr><td style="padding:7px 0;color:rgba(255,255,255,0.5);font-size:13px;border-top:1px solid rgba(255,255,255,0.07);">Total pagado</td><td style="padding:7px 0;color:#5dca85;font-size:14px;font-weight:bold;text-align:right;">$${venta.total.toLocaleString('es-MX')} MXN</td></tr>
      </table>
    </div>
    <div style="background:#1c1c28;border-radius:16px;padding:24px;margin-bottom:16px;">
      <h3 style="font-size:14px;color:rgba(255,255,255,0.7);margin:0 0 12px;">Tus códigos de acceso</h3>
      <p style="font-size:12px;color:rgba(255,255,255,0.4);margin:0 0 12px;">Presenta cualquiera de estos códigos en la entrada. El staff los escaneará.</p>
      ${codigosHtml}
    </div>
    <div style="background:rgba(255,165,0,0.1);border:1px solid rgba(255,165,0,0.3);border-radius:10px;padding:14px;margin-bottom:20px;">
      <p style="color:#ffa500;font-size:12px;margin:0;line-height:1.6;">
        ⚠️ <strong>Importante:</strong> Evento +18. Presenta identificación oficial a la entrada. No se permiten reembolsos.
      </p>
    </div>
    <div style="text-align:center;">
      <p style="color:rgba(255,255,255,0.25);font-size:11px;margin:0;">McCarthy's Irish Pub · Boca del Río, Ver.<br>© 2025 Amnistía</p>
    </div>
  </div>
</body>
</html>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Amnistía Tickets <onboarding@resend.dev>',
      to: [venta.comprador_email],
      subject: `🎵 Tu ticket — Mesa ${venta.mesa_id} · Tributo a José Madero`,
      html
    })
  });
}
