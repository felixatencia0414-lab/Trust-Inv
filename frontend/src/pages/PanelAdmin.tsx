import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function PanelAdmin() {
  const [hello, setHello] = useState<string>('');
  const [idMadre, setIdMadre] = useState<number | ''>('');
  const [zonaNombre, setZonaNombre] = useState('Zona 1');
  const [idZona, setIdZona] = useState<number | ''>('');

  useEffect(() => {
    api
      .get('/')
      .then((res) => setHello(res.data.message || ''))
      .catch(() => setHello(''));
  }, []);

  const ping = async () => {
    const res = await api.get('/');
    setHello(res.data.message || '');
  };

  const crearToma = async () => {
    const res = await api.post<{ id_madre: number }>('/api/tomas');
    setIdMadre(res.data.id_madre);
    await api.post(`/api/tomas/${res.data.id_madre}/abrir`);
  };

  const crearZona = async () => {
    if (typeof idMadre !== 'number') return;
    const res = await api.post<{ id_zona: number }>(`/api/tomas/${idMadre}/zonas`, {
      nombre_zona: zonaNombre,
    });
    setIdZona(res.data.id_zona);
    await api.post(`/api/zonas/${res.data.id_zona}/abrir`);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500">App de Toma de Inventarios</div>
            <div className="font-semibold">Panel Admin (mobile-first)</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Backend</div>
            <div className="text-sm font-semibold">{hello ? 'Conectado' : '—'}</div>
          </div>
        </div>
      </header>

      <main className="px-4 py-4">
        <div className="grid grid-cols-1 gap-3">
          <div className="rounded-xl border p-3 bg-slate-50">
            <div className="text-sm font-semibold">1) Verificar conexión</div>
            <div className="text-xs text-slate-600">Hello World + estado del API</div>
            <div className="mt-3 flex gap-2">
              <button
                className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
                onClick={ping}
              >
                Probar / (Hello)
              </button>
              <button
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold"
                onClick={async () => {
                  await api.get('/health');
                  setHello('ok');
                }}
              >
                /health
              </button>
            </div>
          </div>

          <div className="rounded-xl border p-3 bg-slate-50">
            <div className="text-sm font-semibold">2) Gestión de toma madre y zonas</div>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <button
                className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
                onClick={crearToma}
              >
                Crear + Abrir Toma Madre
              </button>

              <div>
                <label className="text-xs text-slate-500">Nombre de zona</label>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  value={zonaNombre}
                  onChange={(e) => setZonaNombre(e.target.value)}
                />
              </div>

              <button
                className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
                onClick={crearZona}
                disabled={idMadre === ''}
              >
                Crear + Abrir Zona
              </button>

              <div className="text-xs text-slate-600">
                <div>
                  id_madre: <span className="font-semibold">{idMadre || '—'}</span>
                </div>
                <div>
                  id_zona: <span className="font-semibold">{idZona || '—'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-3 bg-slate-50">
            <div className="text-sm font-semibold">3) Ir al modo operario</div>
            <div className="text-xs text-slate-600">Pantalla para contar por zona (usa cámara)</div>
            <div className="mt-3 text-xs text-slate-600">
              En este MVP, el botón “Operario” está en el componente raíz (App).
            </div>
            <div className="mt-2 text-xs text-slate-600">
              Si vas desde el móvil, abre el modo Operario y crea/abre una toma y zona desde allí.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

