import { useEffect, useMemo, useState } from 'react';

import { api } from '../lib/api';

type Estado = 'CREADA' | 'ABIERTA' | 'CERRADA';

type ConteoItem = {
  id_producto: number;
  codigo_barras: string;
  referencia?: string;
  nombre: string;
  cantidad_fisica_contada: number;
};

type ConteosZonaResponse = {
  status: 'ok';
  id_zona: number;
  nombre_zona: string;
  items: ConteoItem[];
};

export default function OperarioConteoZona() {
  const [idMadre, setIdMadre] = useState<number | ''>('');
  const [idZona, setIdZona] = useState<number | ''>('');
  const [nombreZona, setNombreZona] = useState<string>('');
  const [estadoZona, setEstadoZona] = useState<Estado | ''>('');

  const [scanReady, setScanReady] = useState(false);
  const [scanError, setScanError] = useState<string>('');
  const [codigo, setCodigo] = useState<string>('');

  const [cantidad, setCantidad] = useState<number>(1);
  const [manualQuery, setManualQuery] = useState<string>('');

  const [items, setItems] = useState<ConteoItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Variable de error del backend integrada correctamente
  const [backendError, setBackendError] = useState<string>('');

  const [scanner, setScanner] = useState<any>(null);

  const refreshConteos = async (zonaId: number) => {
    const res = await api.get<ConteosZonaResponse>(`/api/zonas/${zonaId}/conteos`);
    setNombreZona(res.data.nombre_zona);
    setItems(res.data.items);
  };

  const refreshCameraPermissions = async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return { ok: true };
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      stream.getTracks().forEach((t) => t.stop());
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Permiso de cámara denegado' };
    }
  };

  useEffect(() => {
    // Cleanup: apagar cámara si el usuario cambia de pantalla
    return () => {
      try {
        scanner?.clear();
      } catch {
        // ignore
      }
    };
  }, [scanner]);

  const startScan = async () => {
    setScanError('');
    setScanReady(false);

    const res = await refreshCameraPermissions();
    if (!res.ok) {
      setScanError(res.error || 'No se pudo habilitar la cámara');
      return;
    }

    // Si ya hay un scanner previo, lo apagamos.
    try {
      scanner?.clear();
    } catch {
      // ignore
    }

    const newScanner = new (window as any).Html5QrcodeScanner(
      'qr-reader',
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        rememberLastUsedCamera: true,
      },
      false
    );

    (newScanner as any).render(
      (decodedText: string) => {
        setCodigo(decodedText);
      },
      () => {
        // ignora errores por frame
      },
      (err: any) => {
        if (err) setScanError(String(err));
      }
    );

    setScanner(newScanner);
    setScanReady(true);
  };

  const crearTomaYZona = async () => {
    setLoading(true);
    try {
      const creada = await api.post<{ id_madre: number }>('/api/tomas');
      const idMadreNew = creada.data.id_madre;
      setIdMadre(idMadreNew);

      const nombre = 'Zona 1';
      const z = await api.post<{ id_zona: number }>(`/api/tomas/${idMadreNew}/zonas`, {
        nombre_zona: nombre,
      });
      const idZonaNew = z.data.id_zona;
      setIdZona(idZonaNew);
      await refreshConteos(idZonaNew);

      await api.post(`/api/tomas/${idMadreNew}/abrir`);
      await api.post(`/api/zonas/${idZonaNew}/abrir`);

      setNombreZona(nombre);
      setEstadoZona('ABIERTA');
      await refreshConteos(idZonaNew);
    } finally {
      setLoading(false);
    }
  };

  const enviarConteo = async () => {
    if (typeof idZona !== 'number') return;
    const codigo_barras = codigo.trim();
    if (!codigo_barras) return;

    setLoading(true);
    setBackendError(''); 
    try {
      const payload = {
        codigo_barras,
        cantidad_fisica_contada: Number(cantidad),
      };
      await api.post(`/api/zonas/${idZona}/conteos`, payload);
      setCodigo('');
      setCantidad(1);
      await refreshConteos(idZona);
    } catch (error: any) {
      console.error("Error capturado en el conteo:", error);
      const responseData = error.response?.data || error.data;
      
      if (responseData && responseData.error) {
        setBackendError(`❌ No se pudo registrar: ${responseData.error}. Estado de la toma: ${responseData.estado_actual || 'Desconocido'}`);
      } else {
        setBackendError(`❌ Error al guardar conteo: ${error.message || 'Error interno del servidor'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = manualQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const hay = `${it.nombre} ${it.referencia || ''} ${it.codigo_barras}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, manualQuery]);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500">Modo Operario</div>
            <div className="font-semibold">Conteo por Zona</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Zona</div>
            <div className="font-semibold">{nombreZona || '—'}</div>
            {idZona !== '' && <div className="text-xs text-slate-500">ID: {idZona}</div>}
          </div>
        </div>
      </header>

      <main className="px-4 py-4">
        <div className="grid grid-cols-1 gap-3">
          <div className="rounded-xl border p-3 bg-slate-50">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Sesión</div>
                <div className="text-xs text-slate-500">Toma madre + zona lista para registrar conteos</div>
              </div>
              <button
                className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
                onClick={crearTomaYZona}
                disabled={loading}
              >
                {loading ? 'Creando...' : 'Iniciar toma + zona'}
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500">ID Madre</label>
                <div className="text-sm font-semibold">{idMadre !== '' ? idMadre : '—'}</div>
              </div>
              <div>
                <label className="text-xs text-slate-500">Estado zona</label>
                <div className="text-sm font-semibold">{estadoZona || '—'}</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border overflow-hidden">
            <div className="p-3 bg-slate-100">
              <div className="text-sm font-semibold">Escaneo</div>
              <div className="text-xs text-slate-600">Escanea el código de barras para registrar conteo</div>
            </div>

            <div className="p-3">
              <div
                id="qr-reader"
                className="w-full aspect-[4/3] rounded-lg border bg-black/5 overflow-hidden"
              ></div>

              {scanError && (
                <div className="mt-3 text-sm text-red-600">
                  <div className="font-semibold">Cámara</div>
                  <div>{scanError}</div>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
                  onClick={startScan}
                  disabled={loading || idZona === ''}
                >
                  {scanReady ? 'Escaneando...' : 'Abrir cámara'}
                </button>

                <div className="text-right">
                  <label className="text-xs text-slate-500">Código detectado</label>
                  <div className="text-xs font-semibold break-all">{codigo || '—'}</div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500">Cantidad física contada</label>
                  <input
                    inputMode="numeric"
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    value={cantidad}
                    onChange={(e) => setCantidad(Number(e.target.value))}
                  />
                </div>
                <div className="flex items-end justify-end">
                  <button
                    className="w-full px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
                    onClick={enviarConteo}
                    disabled={loading || idZona === '' || !codigo.trim()}
                  >
                    {loading ? 'Guardando...' : 'Registrar conteo'}
                  </button>
                </div>
              </div>

              {/* RENDERIZADO VISUAL DEL ERROR EN PANTALLA (No rompe el ciclo de React) */}
              {backendError && (
                <div className="mt-3 text-xs font-semibold p-2.5 rounded-lg bg-red-50 text-red-700 border border-red-200">
                  {backendError}
                </div>
              )}

              <div className="mt-3 rounded-lg border bg-white p-3">
                <div className="text-xs text-slate-500">Manual (alternativo)</div>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="Buscar en productos contados por nombre/referencia/código"
                  value={manualQuery}
                  onChange={(e) => setManualQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border">
            <div className="p-3 bg-slate-100">
              <div className="text-sm font-semibold">Productos contados (sesión)</div>
              <div className="text-xs text-slate-600">Listado inferior scrolleable</div>
            </div>

            <div className="max-h-[44vh] overflow-auto p-3">
              {filtered.length === 0 ? (
                <div className="text-sm text-slate-600">Aún no hay productos contados.</div>
              ) : (
                <ul className="space-y-2">
                  {filtered
                    .slice()
                    .sort((a, b) => a.nombre.localeCompare(b.nombre))
                    .map((it) => (
                      <li key={it.id_producto} className="rounded-lg border bg-white p-3">
                        <div className="font-semibold text-sm">{it.nombre}</div>
                        <div className="text-xs text-slate-500">{it.referencia || '—'}</div>
                        <div className="text-xs text-slate-500 break-all">{it.codigo_barras}</div>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="text-xs text-slate-500">Cantidad contada</div>
                          <div className="text-sm font-bold">{it.cantidad_fisica_contada}</div>
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>

          <div className="rounded-xl border p-3 bg-slate-50">
            <div className="text-sm font-semibold">Consolidación + Export</div>
            <div className="text-xs text-slate-600">(Requiere zona cerrada)</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold"
                onClick={async () => {
                  if (typeof idZona !== 'number') return;
                  await api.post(`/api/zonas/${idZona}/cerrar`);
                  setEstadoZona('CERRADA');
                }}
                disabled={loading || idZona === ''}
              >
                Cerrar zona
              </button>
              <button
                className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
                onClick={async () => {
                  if (typeof idMadre !== 'number') return;
                  await api.post(`/api/tomas/${idMadre}/consolidar`);
                  const resp = await api.get(`/api/tomas/${idMadre}/exportar`, {
                    responseType: 'blob',
                  });
                  const url = window.URL.createObjectURL(new Blob([resp.data]));
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `toma_${idMadre}_consolidado.xlsx`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  window.URL.revokeObjectURL(url);
                }}
                disabled={loading || idMadre === ''}
              >
                Consolidar + Exportar
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}