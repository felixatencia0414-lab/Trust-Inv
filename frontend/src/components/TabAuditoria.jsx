import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx'; // Importamos la librería para compilación de Excel

import { api } from '../lib/api';
import TreeView from './TreeView';

export default function TabAuditoria() {
  const [idMadre, setIdMadre] = useState('');
  const [loading, setLoading] = useState(false);

  const [zonasMonitoreo, setZonasMonitoreo] = useState([]);
  const [treeData, setTreeData] = useState([]);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const parsedIdMadre = useMemo(() => {
    const n = Number(String(idMadre || '').trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [idMadre]);

  const refreshMonitoreo = async (id) => {
    if (!id) return;
    const { data } = await api.get(`/api/tomas/${id}/zonas-monitoreo`);
    setZonasMonitoreo(data?.zonas ?? data?.data ?? data?.items ?? []);
  };

  const refreshReporteArbol = async (id) => {
    if (!id) return;
    const { data } = await api.get(`/api/tomas/${id}/reporte-arbol`);
    setTreeData(data?.data ?? data?.tree ?? []);
  };

  useEffect(() => {
    if (!parsedIdMadre) return;
    refreshMonitoreo(parsedIdMadre).catch(() => {});
    refreshReporteArbol(parsedIdMadre).catch(() => {});
    setError('');
    setSuccessMsg('');
  }, [parsedIdMadre]);

  const onConsolidar = async () => {
    if (!parsedIdMadre) {
      setError('Ingresa un id_madre válido');
      return;
    }

    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      await api.post(`/api/tomas/${parsedIdMadre}/consolidar`);
      setSuccessMsg('🔒 ¡Toma consolidada con éxito en PostgreSQL!');
      await refreshMonitoreo(parsedIdMadre);
      await refreshReporteArbol(parsedIdMadre);
    } catch (e) {
      console.error("Error al consolidar:", e);
      
      // Capturamos la respuesta del servidor
      const responseData = e?.response?.data;

      if (responseData && typeof responseData === 'object') {
        // 1. Si el backend responde con { detail: { error: "...", estado_actual: "..." } }
        // o directamente { error: "...", estado_actual: "..." }
        const contexto = responseData.detail || responseData;
        
        if (typeof contexto === 'object') {
          const msgError = contexto.error || contexto.message || JSON.stringify(contexto);
          const estadoActual = contexto.estado_actual ? ` | Estado actual: ${contexto.estado_actual}` : '';
          const permitidos = contexto.permitidos ? ` | Permitidos: ${JSON.stringify(contexto.permitidos)}` : '';
          
          setError(`❌ ${msgError}${estadoActual}${permitidos}`);
        } else {
          // Si detail es un string plano
          setError(`❌ ${contexto}`);
        }
      } else {
        // Fallback si es un error de red o texto plano sin estructura de objeto
        setError(`❌ ${e?.response?.data ?? e?.message ?? 'Error desconocido al consolidar.'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // FUNCIÓN ACTUALIZADA: Aplana la estructura recursiva del árbol analítico a filas de Excel (.xlsx)
const onExportExcel = () => {
    if (!parsedIdMadre) return;
    if (!treeData || treeData.length === 0) {
      setError('❌ No hay datos analíticos en el árbol para exportar.');
      return;
    }

    setError('');
    setSuccessMsg('');

    try {
      const filasExcel = [];

      treeData.forEach((categoria) => {
        const nombreCat = categoria.nombre || categoria.categoria || categoria.nombre_categoria || 'Sin Categoría';

        const subcategorias = categoria.subcategorias || categoria.sublineas || categoria.subcategorias_items || [];
        subcategorias.forEach((subcat) => {
          const nombreSub = subcat.nombre || subcat.subcategoria || subcat.nombre_subcategoria || 'Sin Subcategoría';

          const productos = subcat.productos || subcat.items || subcat.productos_items || [];
          productos.forEach((prod) => {
            
            // 1. COSTO UNITARIO (Mapeado exacto a tu API)
            const costoUnitario = Number(prod.costo_unitario || 0);
            
            // 2. STOCK SISTEMA (Usando tu llave real de la respuesta de PostgreSQL)
            const stockSistema = Number(prod.stock_teorico ?? 0);
            
            // 3. DIFERENCIA EN UNIDADES (Usando tu llave real)
            const diferenciaUnidades = Number(prod.diferencia_cantidad ?? 0);
            
            // 4. CONTEO FÍSICO DEDUCTIVO
            // (Si tienes stock_teorico: 400 y diferencia_cantidad: -381, significa que contaron 19)
            const conteoFisico = stockSistema + diferenciaUnidades;
            
            // 5. PÉRDIDA VALORIZADA TOTAL (Usando tu llave real)
            const perdidaValorizada = Number(prod.valor_diferencia_total ?? prod.valor_diferencia ?? 0);

            filasExcel.push({
              "Toma Madre ID": parsedIdMadre,
              "Categoría / Línea": nombreCat,
              "Subcategoría / Sublínea": nombreSub,
              "Código de Barras": prod.codigo_barras || '—',
              "Referencia": prod.referencia || '—',
              "Producto": prod.nombre || '—',
              "Costo Unitario": costoUnitario,
              "Stock Sistema": stockSistema,
              "Conteo Físico": conteoFisico,
              "Diferencia Unidades": diferenciaUnidades,
              "Pérdida / Descuadre Valorizado": perdidaValorizada
            });
          });
        });
      });

      if (filasExcel.length === 0) {
        setError('⚠️ El árbol no contiene productos válidos para exportar.');
        return;
      }

      // Generación del archivo Excel nativo
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(filasExcel);

      // Autoajuste dinámico de las columnas para evitar los molestos "###"
      const maxAnchos = Object.keys(filasExcel[0]).map((key) => ({
        wch: Math.max(
          key.length,
          ...filasExcel.map((item) => String(item[key] ?? '').length)
        ) + 3,
      }));
      ws['!cols'] = maxAnchos;

      // Adjuntar hoja al libro y descargar directamente
      XLSX.utils.book_append_sheet(wb, ws, "Auditoría Valorizada");
      const fechaHoy = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `Reporte_Auditoria_Toma_${parsedIdMadre}_${fechaHoy}.xlsx`);

      setSuccessMsg('📊 ¡Reporte de pérdidas valorizadas exportado a Excel con éxito!');
    } catch (e) {
      console.error("Error al compilar el libro de Excel:", e);
      setError('Ocurrió un error lógico al procesar la exportación a Excel.');
    }
  };

  const zonasCards = useMemo(() => {
    return (zonasMonitoreo ?? []).map((z) => {
      const estado = String(z.estado ?? z.zona_estado ?? '').toUpperCase();
      const isCerrada = estado.includes('CERRADA');
      const isAbierta = estado.includes('ABIERTA');

      const bg = isAbierta ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200';
      const text = isAbierta ? 'text-emerald-800' : 'text-slate-700';
      const tag = isAbierta ? 'ABIERTA' : isCerrada ? 'CERRADA' : estado || '—';
      const tagBg = isAbierta ? 'bg-emerald-600' : isCerrada ? 'bg-slate-500' : 'bg-slate-400';

      return { ...z, _estado_norm: estado, _bg: bg, _text: text, _tag: tag, _tagBg: tagBg };
    });
  }, [zonasMonitoreo]);

  return (
    <section className="px-4 py-4 space-y-3">
      <div className="rounded-xl border p-3 bg-slate-50">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">3) AUDITORÍA, SEGUIMIENTO Y CIERRES</div>
            <div className="text-xs text-slate-600">Monitor + Consolidación + Árbol analítico</div>
          </div>
          <div className="text-xs text-slate-500">Conectado a PostgreSQL</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="rounded-xl border p-3 bg-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Control de auditoría</div>
              <div className="text-xs text-slate-600 mt-1">Selecciona una Toma Madre para monitorear y consolidar.</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-slate-500">id_madre</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                value={idMadre}
                onChange={(e) => setIdMadre(e.target.value)}
                placeholder="Ej: 1"
              />
            </div>

            <div className="flex gap-2 md:justify-end items-end">
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold disabled:opacity-50 bg-white hover:bg-slate-50"
                disabled={!parsedIdMadre || loading}
                onClick={() => {
                  setError('');
                  setSuccessMsg('');
                  if (!parsedIdMadre) return;
                  refreshMonitoreo(parsedIdMadre).catch(() => {});
                  refreshReporteArbol(parsedIdMadre).catch(() => {});
                }}
              >
                {loading ? 'Refrescando...' : 'Refrescar'}
              </button>

              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50 hover:bg-indigo-700"
                disabled={!parsedIdMadre || loading}
                onClick={onConsolidar}
              >
                {loading ? 'Consolidando...' : 'Cierre + Consolidación'}
              </button>
            </div>
          </div>

          {!!error && <div className="mt-3 text-xs font-semibold p-2.5 rounded-lg bg-red-50 text-red-700 border border-red-200">{error}</div>}
          {!!successMsg && <div className="mt-3 text-xs font-semibold p-2.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">{successMsg}</div>}

          <div className="mt-4">
            <div className="text-xs text-slate-600 font-medium">Zonas de la toma (estado en tiempo real)</div>

            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {zonasCards.length === 0 ? (
                <div className="text-xs text-slate-400 italic py-2">Sin zonas vinculadas a esta toma madre.</div>
              ) : (
                zonasCards.map((z) => (
                  <div key={z.id_zona ?? z.id} className={`rounded-xl border p-3 ${z._bg} ${z._text}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold break-words">{z.nombre_zona ?? z.nombre ?? 'Zona'}</div>
                        <div className="text-xs text-slate-500">id: {String(z.id_zona ?? z.id ?? '')}</div>
                      </div>
                      <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs text-white font-medium ${z._tagBg}`}>
                        {z._tag}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border p-3 bg-white">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Árbol analítico (pérdidas valorizadas)</div>
              <div className="text-xs text-slate-600 mt-1">Categoría (Línea) → Subcategoría (Sublínea) → Producto.</div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50 hover:bg-emerald-700 flex items-center gap-1.5 shadow-sm"
                disabled={!parsedIdMadre || loading || treeData.length === 0}
                onClick={onExportExcel}
              >
                <span>📊</span> Exportar reporte
              </button>
            </div>
          </div>

          <div className="mt-3 border rounded-xl p-2 bg-slate-50/50">
            <TreeView data={treeData} />
          </div>
        </div>
      </div>
    </section>
  );
}