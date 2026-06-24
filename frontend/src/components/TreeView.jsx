import React, { useMemo, useState } from 'react';

function normalizeKey(s) {
  return String(s ?? '').trim();
}

export default function TreeView({ data, defaultExpanded = true, onSelectProduct }) {
  const [open, setOpen] = useState(() => new Set(defaultExpanded ? flattenKeys(data) : []));

  const items = useMemo(() => data ?? [], [data]);

  return (
    <div className="text-sm">
      {items.length === 0 ? (
        <div className="text-slate-500">Sin datos.</div>
      ) : (
        <ul className="space-y-1">
          {items.map((categoria) => {
            const k = `cat:${normalizeKey(categoria.nombre)}`;
            const isOpen = open.has(k);
            return (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen((prev) => {
                      const next = new Set(prev);
                      if (next.has(k)) next.delete(k);
                      else next.add(k);
                      return next;
                    });
                  }}
                  className="w-full flex items-center gap-2 font-semibold text-slate-900"
                >
                  <span aria-hidden>{isOpen ? '📂' : '📁'}</span>
                  <span className="text-left">{categoria.nombre || '—'}</span>
                </button>

                {isOpen && (
                  <ul className="ml-4 mt-1 space-y-1">
                    {(categoria.subcategorias ?? []).map((sub) => {
                      const k2 = `sub:${normalizeKey(categoria.nombre)}:${normalizeKey(sub.nombre)}`;
                      const isOpen2 = open.has(k2);
                      return (
                        <li key={k2}>
                          <button
                            type="button"
                            onClick={() => {
                              setOpen((prev) => {
                                const next = new Set(prev);
                                if (next.has(k2)) next.delete(k2);
                                else next.add(k2);
                                return next;
                              });
                            }}
                            className="w-full flex items-center gap-2 font-semibold text-slate-800"
                          >
                            <span aria-hidden>{isOpen2 ? '📂' : '📁'}</span>
                            <span className="text-left">{sub.nombre || '—'}</span>
                          </button>

                          {isOpen2 && (
                            <ul className="ml-4 mt-1 space-y-1">
                              {(sub.productos ?? []).map((p) => {
                                const k3 = `prod:${normalizeKey(categoria.nombre)}:${normalizeKey(sub.nombre)}:${normalizeKey(p.codigo_barras)}`;
                                return (
                                  <li key={k3}>
                                    <button
                                      type="button"
                                      onClick={() => onSelectProduct?.(p)}
                                      className="w-full text-left flex items-start gap-2 rounded-lg hover:bg-slate-50 p-2 border border-transparent"
                                    >
                                      <span className="text-base" aria-hidden>
                                        📄
                                      </span>
                                      <div>
                                        <div className="font-semibold">{p.nombre || '—'}</div>
                                        <div className="text-xs text-slate-600 break-all">Ref: {p.referencia || '—'}</div>
                                        <div className="text-xs text-slate-600 break-all">Código: {p.codigo_barras || '—'}</div>
                                        <div className="text-xs text-slate-600">
                                          Costo: {formatMoney(p.costo_unitario)} · Stock: {formatNumber(p.stock_teorico)}
                                        </div>
                                        {p.valor_diferencia != null && (
                                          <div className="text-xs text-red-700">
                                            Diferencia: {formatNumber(p.diferencia_cantidad)} · Δ $ {formatMoney(p.valor_diferencia)}
                                          </div>
                                        )}
                                      </div>
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function flattenKeys(data) {
  const set = new Set();
  (data ?? []).forEach((cat) => {
    const kc = `cat:${normalizeKey(cat.nombre)}`;
    set.add(kc);
    (cat.subcategorias ?? []).forEach((sub) => {
      const ks = `sub:${normalizeKey(cat.nombre)}:${normalizeKey(sub.nombre)}`;
      set.add(ks);
    });
  });
  return set;
}

function formatMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}

function formatNumber(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('es-AR');
}

