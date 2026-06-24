import React, { useEffect, useMemo, useState } from 'react';

import TabsMobile from './components/TabsMobile';
import TreeView from './components/TreeView';
import {
  fetchProductosTree,
  importarInventarioExcel,
  importarMaestroExcel,
} from './lib/api';

import TabEjecucion from './components/TabEjecucion';

// Agrega esto en la sección de imports de App.jsx
import TabAuditoria from './components/TabAuditoria'; // Ajusta la ruta según tu estructura de carpetas

export default function App() {
  const [tab, setTab] = useState('maestros');


  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500">Toma de Inventarios</div>
            <div className="font-semibold">Auditoría lineal (unificada)</div>
          </div>
          <div className="text-xs text-slate-500">UI + API</div>
        </div>
      </header>

      <div className="pb-24">
        {tab === 'maestros' && <TabMaestros />}

        {tab === 'ejecucion' && <TabEjecucion />}

        {tab === 'auditoria' && <TabAuditoria />}




      </div>

      <TabsMobile
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'maestros', label: '1) Maestros' },
          { value: 'ejecucion', label: '2) Ejecución' },
          { value: 'auditoria', label: '3) Cierres' },
        ]}
      />
    </div>
  );
}

const MOCK_TIPO_CATEGORIAS = [

  {
    nombre: 'Lácteos',
    subcategorias: [
      {
        nombre: 'Yogurt',
        productos: [
          {
            nombre: 'Yogurt Vainilla 500g',
            referencia: 'YOG-500G-VAN',
            codigo_barras: '7791234500011',
            costo_unitario: 1250.75,
            stock_teorico: 120,
          },
          {
            nombre: 'Yogurt Frutilla 500g',
            referencia: 'YOG-500G-FRU',
            codigo_barras: '7791234500098',
            costo_unitario: 1299.0,
            stock_teorico: 80,
          },
        ],
      },
      {
        nombre: 'Quesos',
        productos: [
          {
            nombre: 'Queso Cheddar 250g',
            referencia: 'QUESO-250G-CH',
            codigo_barras: '7791234500028',
            costo_unitario: 2450.2,
            stock_teorico: 60,
          },
        ],
      },
    ],
  },
  {
    nombre: 'Despensa',
    subcategorias: [
      {
        nombre: 'Arroz',
        productos: [
          {
            nombre: 'Arroz Largo 1kg',
            referencia: 'ARROZ-1KG-LAR',
            codigo_barras: '7791234500035',
            costo_unitario: 980.5,
            stock_teorico: 200,
          },
        ],
      },
    ],
  },
];

function normalizeTreeForTreeView(categories) {
  return (categories ?? []).map((cat) => ({
    nombre: cat.nombre,
    subcategorias: (cat.subcategorias ?? []).map((sub) => ({
      nombre: sub.nombre,
      productos: (sub.productos ?? []).map((p) => ({
        // TreeView espera estos nombres:
        nombre: p.nombre,
        referencia: p.referencia,
        codigo_barras: p.codigo_barras,
        costo_unitario: p.costo_unitario,
        stock_teorico: p.stock_teorico,
        // para auditoría (mismatch):
        valor_diferencia: p.valor_diferencia,
        diferencia_cantidad: p.diferencia_cantidad,
        valor_diferencia_simple: p.valor_diferencia_simple,
        valor_diferencia_total: p.valor_diferencia_total,
        // keys internas (mock):
        id_producto: p.id_producto ?? p.codigo_barras,
        // compat:
        costo_unitario: p.costo_unitario,
      })),
    })),
  }));
}

function ExampleJsonEditor({ title, value, onChange }) {
  const [text, setText] = useState('');

  useEffect(() => {
    setText(JSON.stringify(value ?? [], null, 2));
  }, [value]);

  return (
    <div className="rounded-xl border p-3 bg-white">
      <div className="text-sm font-semibold">{title}</div>
      <textarea
        className="mt-2 w-full min-h-28 rounded-lg border px-3 py-2 text-sm font-mono"
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          try {
            const parsed = JSON.parse(v);
            onChange(Array.isArray(parsed) ? parsed : []);
          } catch {
            // keep
          }
        }}
      />
    </div>
  );
}

function TabMaestros() {
  const [tree, setTree] = useState(() => normalizeTreeForTreeView(MOCK_TIPO_CATEGORIAS));
  const [backendMsg, setBackendMsg] = useState('Cargando...');
  const [loadingTree, setLoadingTree] = useState(false);

  const [archivoMaestro, setArchivoMaestro] = useState(null);
  const [archivoInventario, setArchivoInventario] = useState(null);
  
  // Estados de carga independientes por fase
  const [importandoMaestro, setImportandoMaestro] = useState(false);
  const [importandoInventario, setImportandoInventario] = useState(false);

  const recargarTree = async () => {
    try {
      setLoadingTree(true);
      const data = await fetchProductosTree();
      const rawTree = data?.data ?? [];
      setTree(rawTree);
      setBackendMsg('Datos sincronizados con PostgreSQL');
    } catch (e) {
      console.error(e);
      setBackendMsg('Error cargando /api/productos/tree');
    } finally {
      setLoadingTree(false);
    }
  };

  useEffect(() => {
    recargarTree();
  }, []);

  // FASE 1: Importar solo Catálogo Base
  const handleImportarMaestro = async () => {
    if (!archivoMaestro) {
      setBackendMsg('Selecciona el archivo del Maestro (.xlsx)');
      return;
    }
    try {
      setImportandoMaestro(true);
      setBackendMsg('Procesando Fase 1: Catálogo Base...');
      await importarMaestroExcel(archivoMaestro);
      setBackendMsg('🎉 Fase 1 Completada: Catálogo base actualizado.');
      await recargarTree();
    } catch (e) {
      console.error(e);
      setBackendMsg('❌ Error en Fase 1 (Revisa estructura del Maestro)');
    } finally {
      setImportandoMaestro(false);
    }
  };

  // FASE 2: Importar solo Existencias y Costos
  const handleImportarInventario = async () => {
    if (!archivoInventario) {
      setBackendMsg('Selecciona el archivo de Inventario Inicial (.xlsx)');
      return;
    }
    try {
      setImportandoInventario(true);
      setBackendMsg('Procesando Fase 2: Existencias y Costos...');
      await importarInventarioExcel(archivoInventario);
      setBackendMsg('🎉 Fase 2 Completada: Existencias y costos cargados.');
      await recargarTree();
    } catch (e) {
      console.error(e);
      setBackendMsg('❌ Error en Fase 2 (Revisa estructura de Inventario)');
    } finally {
      setImportandoInventario(false);
    }
  };

  return (
    <section className="px-4 py-4 space-y-3">
      {/* Encabezado del Tab */}
      <div className="rounded-xl border p-3 bg-slate-50">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">1) PARAMETRIZACIÓN Y MAESTROS</div>
            <div className="text-xs text-slate-600">Categorías → Subcategorías → Productos (POST + GET real)</div>
          </div>
          <div className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">{backendMsg}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {/* Tarjeta de Importación por Fases */}
        <div className="rounded-xl border p-4 bg-white shadow-sm">
          <div className="text-sm font-semibold text-slate-800">Importación de Datos (Flujo Secuencial)</div>
          <p className="text-xs text-slate-500 mt-0.5">Por favor, ejecute la Fase 1 por completo antes de proceder con la Fase 2.</p>
          
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* COLUMNA FASE 1 */}
            <div className="space-y-3 border-b md:border-b-0 md:border-r border-slate-100 pb-4 md:pb-0 md:pr-6 flex flex-col justify-between">
              <div>
                <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded mb-1">
                  Fase 1
                </span>
                <label className="block text-xs font-medium text-slate-700">Excel Maestro de Productos (.xlsx)</label>
                <input
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-slate-50 file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  type="file"
                  accept=".xlsx"
                  onChange={(e) => setArchivoMaestro(e.target.files?.[0] ?? null)}
                  disabled={importandoMaestro || importandoInventario}
                />
                <div className="text-[11px] text-slate-500 mt-2">
                  <b>Columnas requeridas:</b> Categoria, Subcategoria, CodigoBarras, Referencia, Nombre
                </div>
              </div>

              <button
                type="button"
                className="w-full mt-4 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
                disabled={importandoMaestro || importandoInventario || !archivoMaestro}
                onClick={handleImportarMaestro}
              >
                {importandoMaestro ? 'Procesando Catálogo...' : '📤 Cargar Catálogo Base'}
              </button>
            </div>

            {/* COLUMNA FASE 2 */}
            <div className="space-y-3 flex flex-col justify-between">
              <div>
                <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded mb-1">
                  Fase 2
                </span>
                <label className="block text-xs font-medium text-slate-700">Excel Inventario Inicial (.xlsx)</label>
                <input
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-slate-50 file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                  type="file"
                  accept=".xlsx"
                  onChange={(e) => setArchivoInventario(e.target.files?.[0] ?? null)}
                  disabled={importandoMaestro || importandoInventario}
                />
                <div className="text-[11px] text-slate-500 mt-2">
                  <b>Columnas requeridas:</b> CodigoBarras, CostoUnitario, CantidadSistema
                </div>
              </div>

              <button
                type="button"
                className="w-full mt-4 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
                disabled={importandoMaestro || importandoInventario || !archivoInventario}
                onClick={handleImportarInventario}
              >
                {importandoInventario ? 'Procesando Inventario...' : '💰 Cargar Existencias y Costos'}
              </button>
            </div>

          </div>

          {/* Botón de Refrescar Manual en la parte inferior */}
          <div className="mt-5 pt-3 border-t border-slate-100 flex justify-end">
            <button
              type="button"
              className="px-4 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-medium text-slate-700 shadow-sm transition-colors disabled:opacity-50"
              disabled={loadingTree || importandoMaestro || importandoInventario}
              onClick={recargarTree}
            >
              {loadingTree ? 'Sincronizando...' : '🔄 Refrescar vista del árbol'}
            </button>
          </div>
        </div>

        {/* Árbol Jerárquico */}
        <div className="rounded-xl border p-3 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-800">ÁRBOL JERÁRQUICO</div>
              <div className="text-xs text-slate-600">GET /api/productos/tree</div>
            </div>
            <div className="text-xs text-slate-400">Expandir/colapsar</div>
          </div>

          <div className="mt-3">
            <TreeView data={tree} />
          </div>
        </div>
      </div>
    </section>
  );
}

function TabEjecucionMock() {


  const [idMadre, setIdMadre] = useState('1');
  const [zonaNombre, setZonaNombre] = useState('Zona 01 - Pasillo A');
  const [idZonaActiva, setIdZonaActiva] = useState('101');

  const [zonas, setZonas] = useState(() => [
    { id_zona: 101, nombre_zona: 'Zona 01 - Pasillo A', estado: 'ABIERTA' },
    { id_zona: 102, nombre_zona: 'Zona 02 - Pasillo B', estado: 'CREADA' },
  ]);

  const [scanError, setScanError] = useState('');
  const [codigo, setCodigo] = useState('7791234500011');
  const [cantidad, setCantidad] = useState(3);
  const [manualQuery, setManualQuery] = useState('');

  const [itemsZona, setItemsZona] = useState(() => [
    {
      id_producto: '7791234500011',
      codigo_barras: '7791234500011',
      referencia: 'YOG-500G-VAN',
      nombre: 'Yogurt Vainilla 500g',
      cantidad_fisica_contada: 123,
    },
  ]);

  const manualCatalog = useMemo(() => {
    const all = [];
    for (const cat of MOCK_TIPO_CATEGORIAS) {
      for (const sub of cat.subcategorias) {
        for (const p of sub.productos) {
          all.push({
            id_producto: p.codigo_barras,
            codigo_barras: p.codigo_barras,
            referencia: p.referencia,
            nombre: p.nombre,
            costo_unitario: p.costo_unitario,
            stock_teorico: p.stock_teorico,
          });
        }
      }
    }
    return all;
  }, []);

  const filteredManual = useMemo(() => {
    const q = manualQuery.trim().toLowerCase();
    if (!q) return manualCatalog;
    return manualCatalog.filter((p) => `${p.nombre} ${p.referencia}`.toLowerCase().includes(q));
  }, [manualCatalog, manualQuery]);

  const calcularProductoPorCodigo = (c) => manualCatalog.find((p) => p.codigo_barras === c);

  return (
    <section className="px-4 py-4 space-y-3">
      <div className="rounded-xl border p-3 bg-slate-50">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">2) EJECUCIÓN (CONTEOS EN VIVO)</div>
            <div className="text-xs text-slate-600">Toma → Zonas → Conteos → Cierre (mock)</div>
          </div>
          <div className="text-xs text-slate-500">Operación simulada</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="rounded-xl border p-3 bg-white">
          <div className="text-sm font-semibold">Control de toma (mock)</div>
          <div className="mt-3 grid grid-cols-1 gap-3">
            <div>
              <label className="text-xs text-slate-500">id_madre</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={idMadre}
                onChange={(e) => setIdMadre(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Nueva zona</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={zonaNombre}
                onChange={(e) => setZonaNombre(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold"
              onClick={() => {
                const nextId = String(200 + zonas.length + 1);
                setZonas((prev) => [
                  ...prev,
                  { id_zona: Number(nextId), nombre_zona: zonaNombre, estado: 'CREADA' },
                ]);
                setIdZonaActiva(nextId);
              }}
            >
              Crear Zona (mock)
            </button>
          </div>
        </div>

        <div className="rounded-xl border p-3 bg-white">
          <div className="text-sm font-semibold">Zona activa</div>
          <div className="mt-2">
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={idZonaActiva}
              onChange={(e) => setIdZonaActiva(e.target.value)}
            >
              {zonas.map((z) => (
                <option key={z.id_zona} value={String(z.id_zona)}>
                  {z.nombre_zona}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 text-xs text-slate-600">
            Zona activa: <span className="font-semibold">{idZonaActiva}</span>
          </div>
        </div>

        <div className="rounded-xl border p-3 bg-white">
          <div className="text-sm font-semibold">Panel de Captura Operario (mock)</div>

          <div className="mt-3 grid grid-cols-1 gap-3">
            <div>
              <div className="text-xs text-slate-600 mb-2">Escáner (simulado)</div>
              <div className="rounded-lg border bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Código (mock):</div>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                />
                {scanError && <div className="mt-2 text-sm text-red-600">{scanError}</div>}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500">Cantidad física</label>
                  <input
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    type="number"
                    min={0}
                    value={cantidad}
                    onChange={(e) => setCantidad(Number(e.target.value))}
                  />
                </div>
                <div className="flex items-end justify-end">
                  <button
                    type="button"
                    className="w-full px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
                    disabled={!codigo.trim() || cantidad <= 0}
                    onClick={() => {
                      const p = calcularProductoPorCodigo(codigo.trim());
                      if (!p) {
                        setScanError('Código no existe en el catálogo mock');
                        return;
                      }
                      setScanError('');

                      setItemsZona((prev) => {
                        const idx = prev.findIndex((it) => it.id_producto === p.id_producto);
                        if (idx >= 0) {
                          const next = prev.slice();
                          next[idx] = {
                            ...next[idx],
                            cantidad_fisica_contada: Number(next[idx].cantidad_fisica_contada) + Number(cantidad),
                          };
                          return next;
                        }
                        return [
                          ...prev,
                          {
                            id_producto: p.id_producto,
                            codigo_barras: p.codigo_barras,
                            referencia: p.referencia,
                            nombre: p.nombre,
                            cantidad_fisica_contada: Number(cantidad),
                          },
                        ];
                      });
                    }}
                  >
                    Registrar conteo
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border p-3 bg-white">
              <div className="text-sm font-semibold">Contingencia manual (Nombre/Referencia)</div>
              <div className="mt-2 grid grid-cols-1 gap-2">
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="Buscar por Nombre o Referencia"
                  value={manualQuery}
                  onChange={(e) => setManualQuery(e.target.value)}
                />

                <div className="max-h-44 overflow-auto rounded-lg border">
                  {filteredManual.length === 0 ? (
                    <div className="p-3 text-xs text-slate-600">Sin coincidencias.</div>
                  ) : (
                    <ul className="p-2 space-y-2">
                      {filteredManual.map((p) => (
                        <li key={p.id_producto} className="rounded-lg border bg-white p-2">
                          <div className="font-semibold text-sm">{p.nombre}</div>
                          <div className="text-xs text-slate-600 break-all">{p.referencia} · {p.codigo_barras}</div>
                          <button
                            type="button"
                            className="mt-2 w-full px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold"
                            disabled={cantidad <= 0}
                            onClick={() => {
                              setCodigo(p.codigo_barras);
                              setItemsZona((prev) => {
                                const idx = prev.findIndex((it) => it.id_producto === p.id_producto);
                                if (idx >= 0) {
                                  const next = prev.slice();
                                  next[idx] = {
                                    ...next[idx],
                                    cantidad_fisica_contada: Number(next[idx].cantidad_fisica_contada) + Number(cantidad),
                                  };
                                  return next;
                                }
                                return [
                                  ...prev,
                                  {
                                    id_producto: p.id_producto,
                                    codigo_barras: p.codigo_barras,
                                    referencia: p.referencia,
                                    nombre: p.nombre,
                                    cantidad_fisica_contada: Number(cantidad),
                                  },
                                ];
                              });
                            }}
                          >
                            Registrar (manual)
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border p-3 bg-white">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Listado inferior</div>
              <div className="text-xs text-slate-600">Historial de ítems contados (mock)</div>
            </div>
            <button
              type="button"
              className="px-3 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold"
              onClick={() => {
                setZonas((prev) =>
                  prev.map((z) => (String(z.id_zona) === String(idZonaActiva) ? { ...z, estado: 'CERRADA' } : z))
                );
              }}
            >
              Cerrar Zona
            </button>
          </div>

          <div className="mt-3 max-h-56 overflow-auto rounded-lg border">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Ref</th>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {itemsZona.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-3 text-slate-600">Aún no hay conteos.</td>
                  </tr>
                ) : (
                  itemsZona.map((it) => (
                    <tr key={it.id_producto} className="border-b last:border-b-0">
                      <td className="px-3 py-2 font-semibold">{it.nombre}</td>
                      <td className="px-3 py-2">{it.referencia || '—'}</td>
                      <td className="px-3 py-2 break-all">{it.codigo_barras}</td>
                      <td className="px-3 py-2 font-semibold">{it.cantidad_fisica_contada}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function TabAuditoriaMock() {
  const [idMadre, setIdMadre] = useState('1');

  const [tomasZonas, setTomasZonas] = useState(() => [
    { id_zona: 101, nombre_zona: 'Zona 01 - Pasillo A', estado: 'CERRADA' },
    { id_zona: 102, nombre_zona: 'Zona 02 - Pasillo B', estado: 'CERRADA' },
  ]);

  // En mock, creamos un árbol de auditoría con diferencias.
  const auditoriaTree = useMemo(() => {
    // Tomamos stock_teorico como sistema, y fabricamos conteos para diferencias.
    const conteosMock = {
      '7791234500011': { cantidad: 123 },
      '7791234500098': { cantidad: 70 },
      '7791234500028': { cantidad: 58 },
      '7791234500035': { cantidad: 195 },
    };

    const toAuditProductos = (p) => {
      const c = conteosMock[p.codigo_barras]?.cantidad;
      const cantidad_contada = c ?? p.stock_teorico;
      const diferencia = Number(cantidad_contada) - Number(p.stock_teorico);
      const valor_dif = diferencia * Number(p.costo_unitario);

      return {
        nombre: p.nombre,
        referencia: p.referencia,
        codigo_barras: p.codigo_barras,
        costo_unitario: p.costo_unitario,
        stock_teorico: p.stock_teorico,
        diferencia_cantidad: diferencia,
        valor_diferencia: valor_dif,
        id_producto: p.id_producto ?? p.codigo_barras,
      };
    };

    return MOCK_TIPO_CATEGORIAS.map((cat) => ({
      nombre: cat.nombre,
      subcategorias: cat.subcategorias.map((sub) => ({
        nombre: sub.nombre,
        productos: sub.productos.map((p) => toAuditProductos(p)),
      })),
    }));
  }, []);

  const [treeDiff, setTreeDiff] = useState(() => auditoriaTree);

  const [loading, setLoading] = useState(false);

  const consolidarMock = () => {
    setLoading(true);
    setTimeout(() => {
      setTreeDiff(auditoriaTree);
      setLoading(false);
    }, 650);
  };

  return (
    <section className="px-4 py-4 space-y-3">
      <div className="rounded-xl border p-3 bg-slate-50">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">3) AUDITORÍA, SEGUIMIENTO Y CIERRES</div>
            <div className="text-xs text-slate-600">Consolidación + Árbol de pérdidas (mock)</div>
          </div>
          <div className="text-xs text-slate-500">UI sin backend</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="rounded-xl border p-3 bg-white">
          <div className="text-sm font-semibold">Monitor de control</div>
          <div className="mt-2 grid grid-cols-1 gap-2">
            <div>
              <label className="text-xs text-slate-500">id_madre</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={idMadre}
                onChange={(e) => setIdMadre(e.target.value)}
                placeholder="Ej: 1"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold"
                onClick={() => {
                  // noop (mock)
                }}
              >
                Refrescar
              </button>

              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
                onClick={consolidarMock}
                disabled={loading}
              >
                {loading ? 'Consolidando...' : 'Consolidar General'}
              </button>
            </div>

            <div className="max-h-56 overflow-auto rounded-lg border">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="px-3 py-2">Zona</th>
                    <th className="px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {tomasZonas.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-3 py-3 text-slate-600">Sin zonas.</td>
                    </tr>
                  ) : (
                    tomasZonas.map((z) => (
                      <tr key={z.id_zona} className="border-b last:border-b-0">
                        <td className="px-3 py-2 font-semibold">{z.nombre_zona}</td>
                        <td className="px-3 py-2">{z.estado}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="rounded-xl border p-3 bg-white">
          <div className="text-sm font-semibold">Reporte analítico en árbol</div>
          <div className="text-xs text-slate-600 mt-1">Sistema vs Conteo · pérdida valorizada (mock)</div>

          <div className="mt-3">
            <TreeView data={treeDiff} />
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
              onClick={() => {
                // Mock: descarga no real
                const blob = new Blob(
                  [
                    'Mock Excel (no real).\n\nRuta esperada en producción:\nGET /api/tomas/{id}/exportar',
                    `\nID madre: ${idMadre}`,
                  ],
                  { type: 'text/plain;charset=utf-8' }
                );
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `toma_${idMadre}_consolidado_mock.xlsx.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Exportar Informe
            </button>

            <button
              type="button"
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold"
              onClick={() => {
                // Mock: cierre definitivo
              }}
            >
              Cierre definitivo
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

