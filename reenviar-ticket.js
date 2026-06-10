export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { venta_id } = req.body;
  if (!venta_id) return res.status(400).json({ error: 'venta_id requerido' });

  try {
    // Obtener venta
    const ventaRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/ventas?id=eq.${venta_id}`, {
      headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}` }
    });
    const ventas = await ventaRes.json();
    const venta = ventas[0];
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });

    // Obtener ticket
    const ticketRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/tickets?venta_id=eq.${venta_id}&limit=1`, {
      headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}` }
    });
    const tickets = await ticketRes.json();
    const codigo = tickets&&tickets[0] ? tickets[0].codigo : `AMN-${venta_id.slice(0,8).toUpperCase()}-${venta.mesa_id}`;

    const pisoLabel = venta.piso === 'pa' ? 'Planta Alta' : 'Planta Baja';
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(codigo)}&bgcolor=ffffff&color=1a0f2e&margin=10`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#1a0f2e;color:#fff;margin:0;padding:0;">
<div style="max-width:520px;margin:0 auto;padding:32px 20px;">
  <div style="text-align:center;margin-bottom:24px;"><h1 style="font-size:26px;color:#c9a8f0;margin:0;">Amnistía</h1><p style="color:rgba(255,255,255,0.5);margin:4px 0 0;font-size:13px;">Tributo a José Madero</p></div>
  <div style="background:#1c1c28;border-radius:16px;padding:24px;margin-bottom:16px;">
    <h2 style="font-size:17px;color:#5dca85;margin:0 0 12px;">Tu ticket — Reenvío</h2>
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:rgba(255,255,255,0.5);font-size:12px;border-top:1px solid rgba(255,255,255,0.07);">Evento</td><td style="padding:6px 0;color:#fff;font-size:12px;text-align:right;">Tributo a José Madero</td></tr>
      <tr><td style="padding:6px 0;color:rgba(255,255,255,0.5);font-size:12px;border-top:1px solid rgba(255,255,255,0.07);">Fecha</td><td style="padding:6px 0;color:#fff;font-size:12px;text-align:right;">Sábado 13 de junio, 2026</td></tr>
      <tr><td style="padding:6px 0;color:rgba(255,255,255,0.5);font-size:12px;border-top:1px solid rgba(255,255,255,0.07);">Lugar</td><td style="padding:6px 0;color:#fff;font-size:12px;text-align:right;">McCarthy's Irish Pub · Boca del Río</td></tr>
      <tr><td style="padding:6px 0;color:rgba(255,255,255,0.5);font-size:12px;border-top:1px solid rgba(255,255,255,0.07);">Mesa</td><td style="padding:6px 0;color:#c9a8f0;font-size:13px;font-weight:bold;text-align:right;">${venta.mesa_id} · ${pisoLabel}</td></tr>
      <tr><td style="padding:6px 0;color:rgba(255,255,255,0.5);font-size:12px;border-top:1px solid rgba(255,255,255,0.07);">Lugares</td><td style="padding:6px 0;color:#fff;font-size:12px;text-align:right;">${venta.lugares}</td></tr>
    </table>
  </div>
  <div style="background:#1c1c28;border-radius:16px;padding:24px;text-align:center;margin-bottom:16px;">
    <h3 style="font-size:14px;color:rgba(255,255,255,0.7);margin:0 0 16px;">Tu código QR de acceso</h3>
    <img src="${qrUrl}" style="width:220px;height:220px;border-radius:10px;border:4px solid #fff;"/>
    <div style="font-family:monospace;font-size:12px;color:rgba(255,255,255,0.4);margin-top:8px;">${codigo}</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:4px;">Válido para ${venta.lugares} lugar${venta.lugares>1?'es':''}</div>
  </div>
  <div style="background:rgba(255,165,0,0.1);border:1px solid rgba(255,165,0,0.3);border-radius:10px;padding:14px;">
    <p style="color:#ffa500;font-size:12px;margin:0;">⚠️ <strong>Importante:</strong> Evento +18. Presenta identificación oficial. Acceso 9:00 PM · Reservaciones hasta las 10:10 PM.</p>
  </div>
</div></body></html>`;

    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Amnistía Tickets', email: 'apolo.room10@gmail.com' },
        to: [{ email: venta.comprador_email, name: venta.comprador_nombre||'' }],
        subject: `🎵 Tu ticket (reenvío) — Mesa ${venta.mesa_id} · Tributo a José Madero`,
        htmlContent: html
      })
    });

    return res.status(200).json({ ok: true });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
