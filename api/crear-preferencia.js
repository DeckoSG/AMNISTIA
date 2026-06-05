export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { items, comprador } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'No hay items' });
  }
  if (!comprador?.email || !comprador?.nombre) {
    return res.status(400).json({ error: 'Datos del comprador requeridos' });
  }

  // Guardar en Supabase ANTES de redirigir a MP
  const ventasGuardadas = [];
  for (const item of items) {
    try {
      const sbRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/ventas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          comprador_nombre: comprador.nombre,
          comprador_email: comprador.email,
          comprador_tel: comprador.tel || '',
          mesa_id: item.id,
          piso: item.piso,
          lugares: item.spots,
          total: item.spots * 109,
          estado: 'pendiente',
          reservado_hasta: new Date(Date.now() + 10 * 60 * 1000).toISOString()
        })
      });
      const venta = await sbRes.json();
      if (venta[0]) ventasGuardadas.push(venta[0].id);
    } catch (e) {
      console.error('Error guardando en Supabase:', e);
    }
  }

  // Crear preferencia en MP
  const mpItems = items.map(item => ({
    id: item.id,
    title: `Mesa ${item.id} — Tributo a José Madero`,
    description: `${item.spots} lugar${item.spots > 1 ? 'es' : ''} · ${item.piso === 'pa' ? 'Planta Alta' : 'Planta Baja'} · McCarthy's Irish Pub · Sáb 13 Jun`,
    quantity: item.spots,
    unit_price: 109,
    currency_id: 'MXN',
  }));

  const preferencia = {
    items: mpItems,
    payer: {
      name: comprador.nombre,
      email: comprador.email,
      phone: { number: comprador.tel || '' }
    },
    back_urls: {
      success: 'https://project-y82um.vercel.app/exito.html',
      failure: 'https://project-y82um.vercel.app/error.html',
      pending: 'https://project-y82um.vercel.app/pendiente.html',
    },
    auto_return: 'approved',
    statement_descriptor: 'AMNISTIA TICKETS',
    external_reference: ventasGuardadas.join(','),
    metadata: {
      comprador_nombre: comprador.nombre,
      comprador_email: comprador.email,
      comprador_tel: comprador.tel || '',
      venta_ids: ventasGuardadas.join(',')
    }
  };

  try {
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(preferencia),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Error MP:', JSON.stringify(data));
      return res.status(500).json({ error: 'Error MP', detalle: data });
    }

    // PRODUCCIÓN PRIMERO — sandbox solo como fallback
    const url = data.init_point || data.sandbox_init_point;
    return res.status(200).json({ url, init_point: data.init_point, sandbox_init_point: data.sandbox_init_point });

  } catch (error) {
    console.error('Error servidor:', error);
    return res.status(500).json({ error: error.message });
  }
}
