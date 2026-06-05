export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/disponibilidad`, {
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      }
    });

    const data = await response.json();

    // Convertir a objeto para fácil acceso: { "pb_C1": 2, "pa_B9": 4 }
    const ocupados = {};
    if (Array.isArray(data)) {
      data.forEach(row => {
        const key = `${row.piso}_${row.mesa_id}`;
        ocupados[key] = parseInt(row.lugares_ocupados) || 0;
      });
    }

    return res.status(200).json({ ocupados });

  } catch (error) {
    console.error('Error disponibilidad:', error);
    return res.status(500).json({ error: error.message });
  }
}
