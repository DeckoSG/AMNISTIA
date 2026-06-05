export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { items, comprador } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'No hay items' });
  }

  const mpItems = items.map(item => ({
    id: item.id,
    title: `Mesa ${item.id} — Tributo a José Madero`,
    description: `${item.spots} lugar${item.spots > 1 ? 'es' : ''} · ${item.piso === 'pa' ? 'Planta Alta' : 'Planta Baja'} · McCarthy's Irish Pub · Sáb 13 Jun`,
    quantity: item.spots,
    unit_price: 105,
    currency_id: 'MXN',
  }));

  const preferencia = {
    items: mpItems,
    payer: {
      name: comprador?.nombre || '',
      email: comprador?.email || '',
      phone: {
        number: comprador?.tel || ''
      }
    },
    back_urls: {
      success: 'https://project-y82um.vercel.app/exito.html',
      failure: 'https://project-y82um.vercel.app/error.html',
      pending: 'https://project-y82um.vercel.app/pendiente.html',
    },
    auto_return: 'approved',
    statement_descriptor: 'AMNISTIA TICKETS',
    external_reference: `amnistia-${Date.now()}`,
    metadata: {
      comprador_nombre: comprador?.nombre || '',
      comprador_email: comprador?.email || '',
      comprador_tel: comprador?.tel || '',
      items: JSON.stringify(items)
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
      console.error('Error MP:', data);
      return res.status(500).json({ error: 'Error MP', detalle: data });
    }

    return res.status(200).json({
      init_point: data.init_point,
      sandbox_init_point: data.sandbox_init_point,
    });

  } catch (error) {
    console.error('Error servidor:', error);
    return res.status(500).json({ error: error.message });
  }
}
