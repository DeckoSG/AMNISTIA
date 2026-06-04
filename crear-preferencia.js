export default async function handler(req, res) {
  // Solo aceptar POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { items, piso } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'No hay items en el carrito' });
  }

  // Construir items para Mercado Pago
  const mpItems = items.map(item => ({
    id: item.id,
    title: `Mesa ${item.id} — Tributo a José Madero (${item.piso === 'pb' ? 'Planta Baja' : 'Planta Alta'})`,
    description: `${item.spots} lugar${item.spots > 1 ? 'es' : ''} · McCarthy's Irish Pub · Sáb 13 Jun`,
    quantity: item.spots,
    unit_price: 105, // $100 + 5% cargo por servicio
    currency_id: 'MXN',
  }));

  const preferencia = {
    items: mpItems,
    back_urls: {
      success: 'https://project-y82um.vercel.app/exito.html',
      failure: 'https://project-y82um.vercel.app/error.html',
      pending: 'https://project-y82um.vercel.app/pendiente.html',
    },
    auto_return: 'approved',
    statement_descriptor: 'AMNISTIA TICKETS',
    external_reference: `amnistia-${Date.now()}`,
    notification_url: 'https://project-y82um.vercel.app/api/webhook',
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
      return res.status(500).json({ error: 'Error creando preferencia', detalle: data });
    }

    // Devolver el link de pago
    return res.status(200).json({
      id: data.id,
      init_point: data.init_point,       // producción
      sandbox_init_point: data.sandbox_init_point, // pruebas
    });

  } catch (error) {
    console.error('Error servidor:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
