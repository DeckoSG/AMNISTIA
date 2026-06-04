import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import QRCode from 'https://esm.sh/qrcode@1.5.3';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { type, data } = req.body;

  // Solo procesar pagos aprobados
  if (type !== 'payment' || !data?.id) {
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

    const ref = pago.external_reference;
    const email = pago.payer?.email || '';
    const nombre = pago.payer?.first_name || '';

    // Parsear items del pago
    const items = pago.additional_info?.items || [];

    for (const item of items) {
      const mesaId = item.id;
      const piso = item.description?.includes('Planta Alta') ? 'pa' : 'pb';
      const lugares = parseInt(item.quantity);
      const total = parseFloat(item.unit_price) * lugares;

      // Guardar venta
      const { data: venta, error: ventaErr } = await supabase
        .from('ventas')
        .insert({
          mp_payment_id: String(data.id),
          mp_preference_id: pago.order?.id || '',
          comprador_email: email,
          comprador_nombre: nombre,
          mesa_id: mesaId,
          piso,
          lugares,
          total,
          estado: 'aprobado'
        })
        .select()
        .single();

      if (ventaErr) {
        console.error('Error guardando venta:', ventaErr);
        continue;
      }

      // Generar tickets y QRs
      const ticketCodes = [];
      for (let i = 1; i <= lugares; i++) {
        const codigo = `AMN-${venta.id.slice(0,8).toUpperCase()}-${mesaId}-${i}`;
        
        const { error: ticketErr } = await supabase
          .from('tickets')
          .insert({
            venta_id: venta.id,
            codigo,
            mesa_id: mesaId,
            piso,
            lugar_num: i,
            usado: false
          });

        if (!ticketErr) ticketCodes.push(codigo);
      }

      // Generar QR como imagen base64
      const qrDataUrl = await QRCode.toDataURL(ticketCodes.join('\n'), {
        width: 300,
        margin: 2,
        color: { dark: '#1a0f2e', light: '#ffffff' }
      });

      // Mandar correo con QR
      if (email) {
        await enviarCorreo(email, nombre, mesaId, piso, lugares, ticketCodes, qrDataUrl, total);
      }
    }

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('Error webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function enviarCorreo(email, nombre, mesaId, piso, lugares, codigos, qrDataUrl, total) {
  const pisoLabel = piso === 'pa' ? 'Planta Alta' : 'Planta Baja';
  const qrBase64 = qrDataUrl.replace('data:image/png;base64,', '');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#1a0f2e;color:#fff;margin:0;padding:0;">
  <div style="max-width:500px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;margin-bottom:28px;">
      <h1 style="font-size:28px;color:#c9a8f0;margin:0;">Amnistía</h1>
      <p style="color:rgba(255,255,255,0.5);margin:4px 0 0;">Tributo a José Madero</p>
    </div>
    <div style="background:#1c1c28;border-radius:16px;padding:28px;margin-bottom:20px;">
      <h2 style="font-size:18px;color:#5dca85;margin:0 0 16px;">¡Tu ticket está listo!</h2>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 20px;">Hola ${nombre || 'amig@'}, tu compra fue procesada exitosamente.</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:rgba(255,255,255,0.5);font-size:13px;">Evento</td><td style="padding:8px 0;color:#fff;font-size:13px;text-align:right;">Tributo a José Madero</td></tr>
        <tr><td style="padding:8px 0;color:rgba(255,255,255,0.5);font-size:13px;">Fecha</td><td style="padding:8px 0;color:#fff;font-size:13px;text-align:right;">Sábado 13 de junio, 2025</td></tr>
        <tr><td style="padding:8px 0;color:rgba(255,255,255,0.5);font-size:13px;">Lugar</td><td style="padding:8px 0;color:#fff;font-size:13px;text-align:right;">McCarthy's Irish Pub · Boca del Río</td></tr>
        <tr><td style="padding:8px 0;color:rgba(255,255,255,0.5);font-size:13px;">Mesa</td><td style="padding:8px 0;color:#c9a8f0;font-size:13px;text-align:right;">${mesaId} · ${pisoLabel}</td></tr>
        <tr><td style="padding:8px 0;color:rgba(255,255,255,0.5);font-size:13px;">Lugares</td><td style="padding:8px 0;color:#fff;font-size:13px;text-align:right;">${lugares}</td></tr>
        <tr><td style="padding:8px 0;color:rgba(255,255,255,0.5);font-size:13px;">Total pagado</td><td style="padding:8px 0;color:#5dca85;font-size:13px;font-weight:bold;text-align:right;">$${total.toLocaleString('es-MX')} MXN</td></tr>
      </table>
    </div>
    <div style="background:#1c1c28;border-radius:16px;padding:28px;text-align:center;margin-bottom:20px;">
      <p style="color:rgba(255,255,255,0.6);font-size:13px;margin:0 0 16px;">Presenta este código QR en la entrada</p>
      <img src="cid:qr-ticket" alt="Código QR" style="width:220px;height:220px;border-radius:12px;"/>
      <p style="color:rgba(255,255,255,0.3);font-size:11px;margin:12px 0 0;">${codigos.join(' · ')}</p>
    </div>
    <div style="background:rgba(255,165,0,0.1);border:1px solid rgba(255,165,0,0.3);border-radius:10px;padding:16px;margin-bottom:20px;">
      <p style="color:#ffa500;font-size:12px;margin:0;line-height:1.6;">
        ⚠️ <strong>Importante:</strong> Evento +18. Presenta identificación oficial a la entrada. Acceso 9:00 PM · Inicio 10:00 PM.
      </p>
    </div>
    <p style="text-align:center;color:rgba(255,255,255,0.25);font-size:11px;">
      McCarthy's Irish Pub · Boca del Río, Veracruz<br>
      © 2025 Amnistía. Todos los derechos reservados.
    </p>
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
      from: 'Amnistía Tickets <tickets@amnistia.com>',
      to: [email],
      subject: `🎵 Tu ticket para Tributo a José Madero — Mesa ${mesaId}`,
      html,
      attachments: [{
        filename: `ticket-${mesaId}.png`,
        content: qrBase64,
        content_id: 'qr-ticket'
      }]
    })
  });
}
