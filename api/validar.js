export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { codigo } = req.body;
  if (!codigo) return res.status(400).json({ error: 'Código requerido' });

  try {
    // Buscar ticket en Supabase
    const buscarRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/tickets?codigo=eq.${encodeURIComponent(codigo.trim())}&select=*`,
      {
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        }
      }
    );

    const tickets = await buscarRes.json();

    if (!tickets || tickets.length === 0) {
      return res.status(200).json({ valido: false, mensaje: 'Ticket no encontrado' });
    }

    const ticket = tickets[0];

    if (ticket.usado) {
      return res.status(200).json({
        valido: false,
        mensaje: 'Ticket ya utilizado',
        usado_at: ticket.usado_at
      });
    }

    // Marcar como usado
    await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/tickets?codigo=eq.${encodeURIComponent(codigo.trim())}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({ usado: true, usado_at: new Date().toISOString() })
      }
    );

    // Obtener datos de la venta
    let comprador = '';
    if (ticket.venta_id) {
      const ventaRes = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/ventas?id=eq.${ticket.venta_id}&select=comprador_nombre`,
        {
          headers: {
            'apikey': process.env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          }
        }
      );
      const ventas = await ventaRes.json();
      if (ventas && ventas[0]) comprador = ventas[0].comprador_nombre || '';
    }

    return res.status(200).json({
      valido: true,
      mensaje: 'Acceso permitido',
      mesa: ticket.mesa_id,
      piso: ticket.piso === 'pa' ? 'Planta Alta' : 'Planta Baja',
      lugar: ticket.lugar_num,
      comprador,
      codigo: ticket.codigo
    });

  } catch (error) {
    console.error('Error validar:', error);
    return res.status(500).json({ error: error.message });
  }
}
