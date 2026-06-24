import { useState } from 'react';
import PanelAdmin from './pages/PanelAdmin';
import OperarioConteoZona from './pages/OperarioConteoZona';
import HelloBackend from './pages/HelloBackend';

export default function App() {
  const [view, setView] = useState<'admin' | 'operario' | 'hello'>('admin');

  if (view === 'operario') {
    return (
      <div>
        <div className="px-4 py-3 sticky top-0 bg-white/90 backdrop-blur z-20 border-b">
          <button
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold"
            onClick={() => setView('admin')}
          >
            ← Volver al panel
          </button>
        </div>
        <OperarioConteoZona />
      </div>
    );
  }

  if (view === 'hello') {
    return (
      <div>
        <div className="px-4 py-3 sticky top-0 bg-white/90 backdrop-blur z-20 border-b">
          <button
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold"
            onClick={() => setView('admin')}
          >
            ← Volver al panel
          </button>
        </div>
        <HelloBackend />
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 py-3 sticky top-0 bg-white/90 backdrop-blur z-20 border-b flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500">Toma de Inventarios</div>
        <div className="flex gap-2">
          <button
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold"
            onClick={() => setView('hello')}
          >
            Hello
          </button>
          <button
            className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold"
            onClick={() => setView('operario')}
          >
            Operario
          </button>
        </div>
      </div>

      <PanelAdmin />
    </div>
  );
}

