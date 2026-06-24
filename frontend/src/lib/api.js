import axios from 'axios';

// Base URL configurable via Vite env.
// Ej:
// VITE_API_BASE_URL=http://localhost:8000
const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL,
  withCredentials: false,
});

export async function fetchProductosTree() {
  const { data } = await api.get('/api/productos/tree');
  return data;
}

export async function importarMaestroExcel(file) {
  const form = new FormData();
  form.append('archivo', file);
  const { data } = await api.post('/api/importar-maestro', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function importarInventarioExcel(file) {
  const form = new FormData();
  form.append('archivo', file);
  const { data } = await api.post('/api/importar-inventario', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

