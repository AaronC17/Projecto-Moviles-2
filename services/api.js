const API_BASE = 'http://TU_BACKEND:PORT'; // reemplazar

export async function registrarMovimiento(data) {
    const response = await fetch(`${API_BASE}/movimientos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return response.json();
}
