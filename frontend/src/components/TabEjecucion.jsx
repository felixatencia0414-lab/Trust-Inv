import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
// Importamos el escáner de la librería html5-qrcode
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from "html5-qrcode";

export default function TabEjecucion() {
  const [backendError, setBackendError] = useState('');
  const [idMadre, setIdMadre] = useState('');
  const [zonaNombre, setZonaNombre] = useState('Zona 01 - Pasillo A');
  const [idZonaActiva, setIdZonaActiva] = useState('');

  const [tomas, setTomas] = useState([]); 
  const [zonas, setZonas] = useState([]);
  const [itemsZona, setItemsZona] = useState([]);

  const [scanError, setScanError] = useState('');
  const [codigo, setCodigo] = useState('');
  const [cantidad, setCantidad] = useState(1);

  const [manualCatalog, setManualCatalog] = useState([]);
  const [loading, setLoading] = useState(false);

  // NUEVOS ESTADOS: Crear toma personalizada y Escáner de Cámara Teléfono
  const [nuevoNombreToma, setNuevoNombreToma] = useState('');
  const [mostrarEscaner, setMostrarEscaner] = useState(false);

  // MODAL DE CONTINGENCIA MANUAL
  const [showModalManual, setShowModalManual] = useState(false);
  const [filtroManual, setFiltroManual] = useState('');
  
  // NUEVO ESTADO: Almacena el producto validado que está en espera de que le ingresen la cantidad
  const [productoPreSeleccionado, setProductoPreSeleccionado] = useState(null);

  // 1. CARGA DE CATÁLOGO E HISTÓRICOS DE BASE DE DATOS
  const refreshManualCatalogFromProductos = async () => {
    try {
      const { data } = await api.get('/api/productos/tree');
      const flat = [];
      for (const cat of data?.data ?? []) {
        for (const sub of cat.subcategorias ?? []) {
          for (const p of sub.productos ?? []) {
            flat.push({
              id_producto: p.id_producto,
              codigo_barras: p.codigo_barras,
              referencia: p.referencia,
              nombre: p.nombre,
            });
          }
        }
      }
      setManualCatalog(flat);
    } catch (e) {
      console.error("Error al mapear catálogo de productos:", e);
    }
  };

  const refreshTomasExistentes = async () => {
    try {
      const { data } = await api.get('/api/api/tomas');
      console.log("Datos exitosos desde Swagger:", data);
      
      if (Array.isArray(data)) {
        setTomas(data);
      } else {
        setTomas([]);
      }
    } catch (e) {
      console.error("Error cargando el listado histórico de tomas:", e);
      setTomas([]); 
    }
  };

  const refreshZonasPorToma = async (idTomaMadre) => {
    if (!idTomaMadre) {
      setZonas([]);
      return;
    }
    try {
      const { data } = await api.get(`/api/api/tomas/${idTomaMadre}/zonas`);
      console.log("Zonas cargadas desde la API unificada:", data);
      
      if (Array.isArray(data)) {
        setZonas(data);
      } else {
        setZonas([]);
      }
    } catch (e) {
      console.error("Error al traer zonas:", e);
      setZonas([]);
    }
  };

  const refreshItemsZona = async (idZona) => {
    if (!idZona) {
      setItemsZona([]);
      return;
    }
    try {
      const { data } = await api.get(`/api/zonas/${idZona}/conteos`);
      console.log("📦 Estructura completa recibida del servidor:", data);
      
      if (data && Array.isArray(data.items)) {
        setItemsZona(data.items); 
      } else if (Array.isArray(data)) {
        setItemsZona(data);
      } else {
        setItemsZona([]);
      }
    } catch (e) {
      console.error("Error cargando los productos de la zona:", e);
      setItemsZona([]);
    }
  };

  // EFFECT 1: CARGA SECUENCIAL BLINDADA
  useEffect(() => {
    const inicializarModulo = async () => {
      setLoading(true);
      try {
        await refreshManualCatalogFromProductos();
        await refreshTomasExistentes();
      } catch (error) {
        console.error("Error en la inicialización:", error);
      } finally {
        setLoading(false);
      }
    };
    inicializarModulo();
  }, []);

  // EFFECT 2: REACCIÓN AL CAMBIO DE TOMA MADRE
  useEffect(() => {
    const idLimpiado = idMadre ? String(idMadre).trim() : '';
    if (idLimpiado) {
      refreshZonasPorToma(idLimpiado);
    } else {
      setZonas([]);
    }
    setIdZonaActiva('');
    setItemsZona([]);
    setProductoPreSeleccionado(null);
  }, [idMadre]);

  // EFFECT 3: REACCIÓN AL CAMBIO DE ZONA ACTIVA
  useEffect(() => {
    const idZonaLimpio = idZonaActiva ? String(idZonaActiva).trim() : '';
    if (idZonaLimpio) {
      refreshItemsZona(idZonaLimpio);
    } else {
      setItemsZona([]);
    }
    setProductoPreSeleccionado(null);
  }, [idZonaActiva]);

  // EFFECT 4: LÓGICA Y ASIGNACIÓN DEL ESCÁNER DE CÁMARA
  useEffect(() => {
    if (mostrarEscaner) {
      // Configuramos compatibilidad explícita con códigos de barras de productos
      const formatsToSupport = [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.QR_CODE
      ];

      const scanner = new Html5QrcodeScanner("reader-cam", {
        fps: 10,
        qrbox: { width: 260, height: 140 },
        formatsToSupport: formatsToSupport
      });

      scanner.render(
        (decodedText) => {
          setCodigo(decodedText);
          setMostrarEscaner(false);
          scanner.clear();
          // Lanza inmediatamente la verificación en cascada del producto detectado
          validarYMostrarProducto(decodedText);
        },
        (error) => {
          // Captura silenciosa de ciclos de búsqueda de foco de la cámara
        }
      );

      return () => {
        scanner.clear().catch(err => console.error("Error apagando cámara:", err));
      };
    }
  }, [mostrarEscaner]);

  // FILTRADO DE SEGURIDAD
  const zonasDisponiblesParaContar = useMemo(() => {
    return zonas.filter((z) => z.estado !== 'CERRADA');
  }, [zonas]);

  const esZonaCerrada = useMemo(() => {
    const zonaActual = zonas.find(z => String(z.id) === String(idZonaActiva));
    return zonaActual?.estado === 'CERRADA';
  }, [zonas, idZonaActiva]);

  const crearMadre = async () => {
    setLoading(true);
    setScanError('');
    setBackendError('');
    try {
      // Si tienes un payload con nombre, puedes pasarlo, o dejarlo por defecto si el backend no lo requiere todavía
      const payload = nuevoNombreToma.trim() ? { nombre: nuevoNombreToma.trim() } : {};
      const { data } = await api.post('/api/tomas', payload);
      const idM = String(data?.id_madre ?? '');
      setIdMadre(idM);
      await api.post(`/api/tomas/${idM}/abrir`).catch(() => {});
      await refreshTomasExistentes();
      setNuevoNombreToma('');
    } catch (e) {
      setScanError('Error al crear la toma madre.');
    } finally {
      setLoading(false);
    }
  };

  const crearZona = async () => {
    if (!idMadre) {
      setScanError('Primero selecciona o ingresa id_madre.');
      return;
    }
    setLoading(true);
    setScanError('');
    setBackendError('');
    try {
      const res = await api.post(`/api/tomas/${idMadre}/zonas`, { nombre_zona: zonaNombre });
      const id_zona = String(res.data?.id_zona ?? '');
      
      await api.post(`/api/zonas/${id_zona}/abrir`);
      
      setIdZonaActiva(id_zona);
      await refreshZonasPorToma(idMadre);
      await refreshItemsZona(id_zona);
    } catch (e) {
      setScanError(e?.response?.data?.detail || 'Error en el flujo de creación/apertura de zona');
    } finally {
      setLoading(false);
    }
  };

  // PASO 1: BUSCAR Y VALIDAR EL PRODUCTO (SÓLO MUESTRA EN PANTALLA)
  const validarYMostrarProducto = (valorRaw) => {
    const valor = valorRaw ? valorRaw.trim() : '';
    if (!valor) return;

    setScanError('');
    setBackendError('');
    setProductoPreSeleccionado(null);

    // Buscamos coincidencia por código de barras O por referencia exacta
    const productoEncontrado = manualCatalog.find(p => 
      String(p.codigo_barras).trim() === valor || 
      String(p.referencia || '').trim().toLowerCase() === valor.toLowerCase()
    );

    if (productoEncontrado) {
      setProductoPreSeleccionado(productoEncontrado);
    } else {
      // Contingencia: si no está en catálogo, pre-seleccionamos una plantilla genérica con el código digitado
      setProductoPreSeleccionado({ 
        id_producto: null,
        nombre: 'Producto Nuevo / No en Catálogo Local', 
        codigo_barras: valor, 
        referencia: '—' 
      });
    }
  };

  const handleKeyDownBuscador = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      validarYMostrarProducto(codigo);
    }
  };

  // PASO 2: GUARDAR DEFINITIVAMENTE EL CONTEO EN LA BASE DE DATOS
  const ejecutarGuardadoConteo = async () => {
    if (!idZonaActiva) {
      setBackendError('❌ Selecciona una zona activa primero.');
      return;
    }
    if (!productoPreSeleccionado) {
      setBackendError('❌ Debes escanear o buscar un producto válido primero.');
      return;
    }
    if (cantidad <= 0) {
      setBackendError('❌ La cantidad debe ser mayor a 0.');
      return;
    }

    setLoading(true);
    setScanError('');
    setBackendError('');
    try {
      await api.post(`/api/zonas/${idZonaActiva}/conteos`, {
        codigo_barras: productoPreSeleccionado.codigo_barras,
        amount_fisica_contada: cantidad, // Ajusta si tu backend usa cantidad_fisica_contada
        cantidad_fisica_contada: cantidad,
      });

      // Refrescamos la tabla del listado inferior con los datos del servidor
      await refreshItemsZona(idZonaActiva);

      // Limpiamos los campos del panel de captura para el siguiente registro
      setCodigo('');
      setCantidad(1);
      setProductoPreSeleccionado(null);
    } catch (e) {
      console.error("Error capturado en el conteo:", e);
      const responseData = e?.response?.data || e?.data;

      if (responseData && typeof responseData === 'object') {
        if (responseData.error) {
          setBackendError(`❌ No se pudo registrar: ${responseData.error}.`);
        } else if (responseData.detail) {
          setBackendError(`❌ Error: ${typeof responseData.detail === 'object' ? JSON.stringify(responseData.detail) : responseData.detail}`);
        } else {
          setBackendError(`❌ Error en respuesta del servidor: ${JSON.stringify(responseData)}`);
        }
      } else {
        setBackendError(`❌ Error al guardar conteo: ${e?.message || 'Error interno'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDownCantidad = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      ejecutarGuardadoConteo();
    }
  };

  // Filtrado interno del catálogo para la ventana emergente de búsqueda por Nombre
  const catalogFiltradoModal = useMemo(() => {
    const q = filtroManual.trim().toLowerCase();
    if (!q) return manualCatalog.slice(0, 25);
    return manualCatalog.filter((p) => 
      String(p.nombre || '').toLowerCase().includes(q) || 
      String(p.referencia || '').toLowerCase().includes(q) ||
      String(p.codigo_barras || '').toLowerCase().includes(q)
    );
  }, [manualCatalog, filtroManual]);

  return (
    <section className="px-4 py-4 space-y-3">
      <div className="rounded-xl border p-3 bg-slate-50">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">2) EJECUCIÓN (CONTEOS EN VIVO)</div>
            <div className="text-xs text-slate-600">Toma → Zonas → Conteos → Persistencia PostgreSQL</div>
          </div>
          <div className="text-xs text-slate-500">Backend API conectada</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {/* Control de toma */}
        <div className="rounded-xl border p-3 bg-white space-y-3">
          <div className="text-sm font-semibold text-slate-900 border-b pb-1">Control de toma</div>

          {/* PARTE A: CREACIÓN INDEPENDIENTE DE LA TOMA (NUEVO ENFOQUE DE PROCESO) */}
          <div className="bg-indigo-50/50 rounded-lg p-2.5 border border-indigo-100">
            <label className="text-xs font-bold text-indigo-900">1. Crear Nueva Toma de Inventario</label>
            <div className="mt-1 flex gap-2">
              <input
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                value={nuevoNombreToma}
                onChange={(e) => setNuevoNombreToma(e.target.value)}
                placeholder="Ej: Auditoría Junio Bloque A"
              />
              <button
                type="button"
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                disabled={loading}
                onClick={crearMadre}
              >
                {loading ? 'Creando...' : 'Crear Toma'}
              </button>
            </div>
          </div>

          {/* PARTE B: SELECCIÓN Y APERTURA DE ZONA */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-xs text-slate-500 font-medium">2. Seleccionar Toma Existente o Ingresar ID</label>
              <div className="mt-1 flex gap-2">
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-white border-slate-300"
                  value={idMadre || ""} 
                  onChange={(e) => setIdMadre(e.target.value)}
                >
                  <option value="">-- Elige una Toma --</option>
                  {Array.isArray(tomas) && tomas.map((toma) => (
                    <option key={toma.id} value={toma.id}>
                      Toma # {toma.id} ({toma.estado || 'CREADA'})
                    </option>
                  ))}
                </select>
                <input
                  className="w-1/3 rounded-lg border px-3 py-2 text-sm text-center font-mono border-slate-300"
                  value={idMadre}
                  onChange={(e) => setIdMadre(e.target.value)}
                  placeholder="ID"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-500 font-medium">3. Crear Zona dentro de la Toma Seleccionada</label>
              <div className="mt-1 flex gap-2">
                <input
                  className="flex-1 rounded-lg border px-3 py-2 text-sm border-slate-300"
                  value={zonaNombre}
                  onChange={(e) => setZonaNombre(e.target.value)}
                  placeholder="Nombre de la zona"
                />
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                  disabled={loading || !zonaNombre.trim() || !idMadre.trim()}
                  onClick={crearZona}
                >
                  {loading ? 'Abriendo...' : '+ Zona'}
                </button>
              </div>
            </div>
          </div>

          {!!scanError && <div className="text-xs text-red-600 font-bold bg-red-50 p-2 rounded-md border border-red-200">{scanError}</div>}
        </div>

        {/* Zona activa */}
        <div className="rounded-xl border p-3 bg-white">
          <div className="text-sm font-semibold">Zona activa para Auditoría</div>
          <div className="mt-2">
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm bg-white border-slate-300"
              value={idZonaActiva || ""}
              onChange={(e) => setIdZonaActiva(e.target.value)}
            >
              <option value="">Selecciona la zona donde vas a contar...</option>
              {Array.isArray(zonasDisponiblesParaContar) && zonasDisponiblesParaContar.map((zona) => (
                <option key={zona.id} value={zona.id}>
                  {zona.nombre || `Zona ${zona.id}`}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 text-xs text-slate-600">
            Trabajando en la Zona ID: <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-indigo-700 font-bold">{idZonaActiva || 'Ninguna'}</span>
          </div>
        </div>

        {/* Panel de Captura Operario (Flujo de Dos Pasos) */}
        <div className={`rounded-xl border p-3 bg-white relative ${esZonaCerrada ? "opacity-60 pointer-events-none bg-slate-50" : ""}`}>
          <div className="flex justify-between items-center flex-wrap gap-1">
            <div className="text-sm font-semibold text-slate-900">Panel de Captura Operario</div>
            <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded">
              💡 Doble Clic en el input para desplegar catálogo completo
            </span>
          </div>

          {esZonaCerrada && (
            <div className="mt-2 text-xs font-bold text-center p-2 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
              🔒 ESTA ZONA SE ENCUENTRA CERRADA. NO EDITABLE.
            </div>
          )}

          <div className="mt-3 grid grid-cols-1 gap-3">
            <div>
              <div className="rounded-lg border bg-slate-50 p-3 shadow-sm">
                
                {/* PASO 1: LEER CÓDIGO CON TECLADO TÁCTIL O CÁMARA */}
                <div className="text-xs text-slate-600 font-bold">1) Ingrese Código de Barras o Referencia:</div>
                <div className="flex gap-2 mt-1.5">
                  <input
                    className="flex-1 rounded-lg border px-3 py-2 text-sm font-mono border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    onKeyDown={handleKeyDownBuscador}
                    onDoubleClick={() => !esZonaCerrada && idZonaActiva && setShowModalManual(true)}
                    disabled={esZonaCerrada || !idZonaActiva}
                    placeholder="Escanee, digite o use 📷..."
                    type="text"
                    inputMode="alphanumeric" // Habilita de forma nativa el teclado del celular al enfocarse
                  />
                  
                  {/* BOTÓN 📷 ESCÁNER REMOTO (MÓVIL) */}
                  <button
                    type="button"
                    title="Escanear con la cámara del celular"
                    className={`px-3 py-2 rounded-lg text-sm font-bold border transition-all ${mostrarEscaner ? 'bg-amber-500 text-white border-amber-600' : 'bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300'}`}
                    disabled={esZonaCerrada || !idZonaActiva}
                    onClick={() => setMostrarEscaner(!mostrarEscaner)}
                  >
                    {mostrarEscaner ? '✕' : '📷'}
                  </button>

                  <button
                    type="button"
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-sm"
                    disabled={!codigo.trim() || esZonaCerrada || !idZonaActiva}
                    onClick={() => validarYMostrarProducto(codigo)}
                  >
                    Validar
                  </button>
                </div>

                {/* VISUALIZADOR DE CÁMARA EN VIVO */}
                {mostrarEscaner && (
                  <div className="mt-3 p-2 bg-white rounded-lg border-2 border-indigo-400 animate-in fade-in duration-150">
                    <div id="reader-cam" className="w-full overflow-hidden rounded-md"></div>
                    <button 
                      type="button"
                      onClick={() => setMostrarEscaner(false)}
                      className="mt-2 w-full bg-slate-600 hover:bg-slate-700 text-white text-xs py-1.5 rounded font-bold"
                    >
                      Apagar Cámara
                    </button>
                  </div>
                )}

                {/* VISUALIZACIÓN EN PANTALLA ANTES DE CONFIRMAR LA CANTIDAD */}
                {productoPreSeleccionado && (
                  <div className="mt-3 p-3 rounded-lg bg-indigo-50/70 border border-indigo-200 flex items-start gap-2.5">
                    <div className="text-indigo-600 text-lg mt-0.5">👁️</div>
                    <div className="text-xs flex-1">
                      <span className="font-extrabold text-indigo-900 block tracking-wider text-[10px]">PRODUCTO IDENTIFICADO (VALIDAR):</span>
                      <span className="font-bold text-slate-900 text-sm block mt-0.5">{productoPreSeleccionado.nombre}</span>
                      <span className="text-slate-600 text-[11px] mt-0.5 block font-medium">
                        Ref: {productoPreSeleccionado.referencia || '—'} | Cód: {productoPreSeleccionado.codigo_barras}
                      </span>
                    </div>
                  </div>
                )}

                {/* PASO 2: INGRESAR CANTIDAD Y GUARDAR */}
                <div className="mt-4 pt-3 border-t border-slate-200 grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-500 font-medium">2) Cantidad física:</label>
                    <input
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm border-slate-300"
                      type="number"
                      min={1}
                      disabled={esZonaCerrada || !idZonaActiva || !productoPreSeleccionado}
                      value={cantidad}
                      onKeyDown={handleKeyDownCantidad}
                      onChange={(e) => setCantidad(Number(e.target.value))}
                    />
                  </div>
                  <div className="flex items-end justify-end">
                    <button
                      type="button"
                      className="w-full px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-50 hover:bg-emerald-700 transition-colors shadow-sm"
                      disabled={!productoPreSeleccionado || cantidad <= 0 || loading || !idZonaActiva || esZonaCerrada}
                      onClick={ejecutarGuardadoConteo}
                    >
                      {loading ? 'Registrando...' : '✓ Registrar conteo'}
                    </button>
                  </div>
                </div>

                {backendError && (
                  <div className="mt-3 text-xs font-semibold p-2.5 rounded-lg bg-red-50 text-red-700 border border-red-200 whitespace-pre-line">
                    {backendError}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Listado inferior */}
        <div className="rounded-xl border p-3 bg-white">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Listado inferior</div>
              <div className="text-xs text-slate-600">Historial en vivo de conteos por zona</div>
            </div>

            <button
              type="button"
              className="px-3 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold disabled:opacity-50 hover:bg-rose-700 transition-colors"
              disabled={loading || !idZonaActiva}
              onClick={async () => {
                if (!idZonaActiva) return;
                if (!window.confirm("¿Estás seguro de que deseas cerrar esta zona? Ya no se podrá editar.")) return;
                setLoading(true);
                setScanError('');
                setBackendError('');
                try {
                  await api.post(`/api/zonas/${idZonaActiva}/cerrar`);
                  await refreshZonasPorToma(idMadre);
                  setIdZonaActiva('');
                  setItemsZona([]);
                } catch (e) {
                  setScanError(e?.response?.data?.detail ?? 'Error cerrando zona');
                } finally {
                  setLoading(false);
                }
              }}
            >
              Cerrar Zona
            </button>
          </div>

          <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="px-3 py-2 bg-slate-50">Producto</th>
                  <th className="px-3 py-2 bg-slate-50">Ref</th>
                  <th className="px-3 py-2 bg-slate-50">Código</th>
                  <th className="px-3 py-2 bg-slate-50 text-center">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {itemsZona.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-slate-500 text-center font-medium">
                      Aún no hay conteos en esta zona.
                    </td>
                  </tr>
                ) : (
                  itemsZona
                    .slice()
                    .sort((a, b) => String(a.nombre ?? '').localeCompare(String(b.nombre ?? '')))
                    .map((it, idx) => (
                      <tr key={it.id_producto || idx} className="border-b last:border-b-0 hover:bg-slate-50">
                        <td className="px-3 py-2 font-semibold text-slate-900">{it.nombre || it.producto_nombre || 'Sin nombre'}</td>
                        <td className="px-3 py-2 text-slate-600">{it.referencia || '—'}</td>
                        <td className="px-3 py-2 font-mono text-slate-600 break-all">{it.codigo_barras}</td>
                        <td className="px-3 py-2 font-bold text-center text-indigo-600 text-sm bg-indigo-50/30">{it.cantidad_fisica_contada}</td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL EMERGENTE DE CONTINGENCIA MANUAL (TAILWIND) */}
      {showModalManual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-60 transition-opacity">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            
            {/* Header */}
            <div className="p-3.5 bg-indigo-600 text-white rounded-t-xl flex justify-between items-center">
              <h3 className="text-sm font-bold flex items-center gap-1.5">
                <span>🔍</span> Contingencia Manual (Buscador del Catálogo)
              </h3>
              <button 
                type="button" 
                className="text-white hover:text-slate-200 text-lg font-bold px-2 focus:outline-none" 
                onClick={() => { setShowModalManual(false); setFiltroManual(''); }}
              >
                ✕
              </button>
            </div>

            {/* Input Filtro */}
            <div className="p-3 bg-slate-50 border-b border-slate-200">
              <label className="text-xs font-semibold text-slate-600 block mb-1">Filtrar por Nombre, Código o Referencia:</label>
              <input 
                type="text"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="Escribe palabras clave para filtrar..."
                value={filtroManual}
                onChange={(e) => setFiltroManual(e.target.value)}
                autoFocus
              />
            </div>

            {/* Listado de Resultados */}
            <div className="flex-1 overflow-y-auto p-2 divide-y divide-slate-100">
              {catalogFiltradoModal.map((prod) => (
                <div 
                  key={prod.id_producto || prod.codigo_barras}
                  className="p-2.5 flex justify-between items-center gap-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="text-left flex-1 min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate">{prod.nombre}</div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
                      Ref: {prod.referencia || '—'} · Cód: {prod.codigo_barras}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 px-2.5 py-1.5 rounded-md bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white text-xs font-bold transition-all border border-indigo-200"
                    onClick={() => {
                      setProductoPreSeleccionado(prod);
                      setCodigo(prod.codigo_barras); 
                      setShowModalManual(false);
                      setFiltroManual('');
                    }}
                  >
                    Seleccionar
                  </button>
                </div>
              ))}

              {catalogFiltradoModal.length === 0 && (
                <div className="text-center py-8 text-xs text-slate-500 font-medium">
                  No se encontraron productos coincidentes en el catálogo.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-2 bg-slate-50 rounded-b-xl border-t border-slate-200 flex justify-end">
              <button 
                type="button" 
                className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold transition-colors" 
                onClick={() => { setShowModalManual(false); setFiltroManual(''); }}
              >
                Cerrar Buscador
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}