import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { codigo } = req.body;
  if (!codigo) return res.status(400).json({ error: 'Código requerido' });

  const { data: ticket, error } = await supabase
    .from('tickets')
    .select('*, ventas(*)')
    .eq('codigo', codigo.trim())
    .single();

  if (error || !ticket) {
    return res.status(200).json({ valido: false, mensaje: 'Ticket no encontrado' });
  }

  if (ticket.usado) {
    return res.status(200).json({
      valido: false,
      mensaje: 'Ticket ya utilizado',
      usado_at: ticket.usado_at
    });
  }

  // Marcar como usado
  await supabase
    .from('tickets')
    .update({ usado: true, usado_at: new Date().toISOString() })
    .eq('codigo', codigo.trim());

  return res.status(200).json({
    valido: true,
    mensaje: 'Acceso permitido',
    mesa: ticket.mesa_id,
    piso: ticket.piso === 'pa' ? 'Planta Alta' : 'Planta Baja',
    lugar: ticket.lugar_num,
    comprador: ticket.ventas?.comprador_nombre || '',
    codigo: ticket.codigo
  });
}
