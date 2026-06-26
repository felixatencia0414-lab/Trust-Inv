import React, { useEffect, useMemo, useState, useRef } from 'react';
import { api } from '../lib/api';
// Importamos el motor puro (Html5Qrcode) para control total del hardware
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

export default function TabEjecucion() {

  // Helper: exporta Excel por zona activa usando xlsx ya integrado en TabAuditoria
  const exportarZonaExcel = async (zonaId, zonaNombre) => {
    // Lazy import para no tocar dependencias globales
    const XLSX = await import('xlsx');

    const items = Array.isArray(itemsZona) ? itemsZona : [];
    const filas = (items ?? []).map((it) => {
      const codigo = it.codigo_barras ?? it.codigo_barras_clean ?? '—';
      const referencia = it.referencia ?? '—';
      const nombre = it.nombre ?? it.producto_nombre ?? '—';
      const cantidad = it.cantidad_fisica_contada ?? it.cantidad ?? 0;
      const operario = it.operario ?? it.responsable ?? it.usuario ?? '—';

      return {
        'Código de Barras / Referencia': `${codigo} / ${referencia}`,
        'Descripción / Nombre del Producto': nombre,
        'Cantidad Física Contada': cantidad,
        'Operario / Responsable': operario,
        'Zona ID': zonaId,
        'Zona': zonaNombre ?? '',
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(filas);

    // Anchos simples
    if (filas.length > 0) {
      const maxAnchos = Object.keys(filas[0]).map((key) => ({
        wch: Math.max(key.length, ...filas.map((f) => String(f[key] ?? '').length)) + 3,
      }));
      ws['!cols'] = maxAnchos;
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Zona');
    const fechaHoy = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Zona_${zonaId}_${fechaHoy}.xlsx`);
  };
  const [backendError, setBackendError] = useState('');
  const [idMadre, setIdMadre] = useState('');
  const [zonaNombre, setZonaNombre] = useState('Zona 01 - Pasillo A');
  const [zonaActivaNombre, setZonaActivaNombre] = useState('');
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

  // REFERENCIAS DE HARDWARE Y ENFOQUE
  const qrCodeInstanceRef = useRef(null);
  const cantidadInputRef = useRef(null);

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

  // EFFECT 4: LÓGICA ULTRA-PRO DE ESCÁNER POR CÁMARA (SIN MODALES INTERMEDIOS)
  useEffect(() => {
    if (mostrarEscaner) {
      // Configuramos compatibilidad explícita y exclusiva con códigos de barras lineales (1D)
      const formatsToSupport = [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E
      ];

      // Inicializamos el lector mapeado al ID del contenedor div 'reader-cam'
      const html5QrcodeScanner = new Html5Qrcode("reader-cam", {
        formatsToSupport: formatsToSupport
      });
      qrCodeInstanceRef.current = html5QrcodeScanner;

      // Arrancamos la cámara trasera de ráfaga continua sin intermediación de interfaces extras
      html5QrcodeScanner.start(
        { facingMode: "environment" }, // Forzar cámara trasera nativa
        {
          fps: 15,
          qrbox: { width: 280, height: 130 } // Caja delgada rectangular optimizada para líneas 1D
        },
        (decodedText) => {
          // ¡CÓDIGO CAPTURADO!
          setCodigo(decodedText);
          setMostrarEscaner(false); // Cierra el visor de la cámara automáticamente
          
          // Apagamos hardware
          html5QrcodeScanner.stop().then(() => {
            // Disparar validación automática del string capturado
            validarYMostrarProducto(decodedText);
          }).catch(err => console.error("Error deteniendo el lente:", err));
        },
        (errorMessage) => {
          // Búsqueda silenciosa frame a frame
        }
      ).catch((err) => {
        console.error("Error al abrir cámara trasera nativa:", err);
        setScanError("No se pudo acceder de forma directa al lente trasero.");
        setMostrarEscaner(false);
      });

      return () => {
        if (qrCodeInstanceRef.current && qrCodeInstanceRef.current.isScanning) {
          qrCodeInstanceRef.current.stop().catch(err => console.error("Limpieza errónea:", err));
        }
      };
    }
  }, [mostrarEscaner]);

  // Auto-enfoque al input de cantidad apenas se valide un producto
  useEffect(() => {
    if (productoPreSeleccionado && cantidadInputRef.current) {
      setTimeout(() => {
        cantidadInputRef.current.focus();
        cantidadInputRef.current.select(); // Deja el '1' seleccionado para sobreescribir rápido
      }, 80);
    }
  }, [productoPreSeleccionado]);

  // FILTRADO DE SEGURIDAD
  const zonasDisponiblesParaContar = useMemo(() => {
    return zonas.filter((z) => z.estado !== 'CERRADA');
  }, [zonas]);

  const esZonaCerrada = useMemo(() => {
    const zonaActual = zonas.find(z => String(z.id) === String(idZonaActiva));
    return zonaActual?.estado === 'CERRADA';
  }, [zonas, idZonaActiva]);

  const zonaActiva = useMemo(() => {
    return zonas.find(z => String(z.id) === String(idZonaActiva));
  }, [zonas, idZonaActiva]);

  const isZonaAbierta = useMemo(() => {
    return zonaActiva?.estado === 'ABIERTA';
  }, [zonaActiva]);


  const crearMadre = async () => {
    setLoading(true);
    setScanError('');
    setBackendError('');
    try {
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

  const validarYMostrarProducto = (valorRaw) => {
    const valor = valorRaw ? valorRaw.trim() : '';
    if (!valor) return;

    setScanError('');
    setBackendError('');
    setProductoPreSeleccionado(null);

    const productoEncontrado = manualCatalog.find(p => 
      String(p.codigo_barras).trim() === valor || 
      String(p.referencia || '').trim().toLowerCase() === valor.toLowerCase()
    );

    if (productoEncontrado) {
      setProductoPreSeleccionado(productoEncontrado);
    } else {
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
        amount_fisica_contada: cantidad, 
        cantidad_fisica_contada: cantidad,
      });

      await refreshItemsZona(idZonaActiva);

      // Resetear interfaz para dejarla limpia para la siguiente ronda de captura
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

  const catalogFiltradoModal = useMemo(() => {
    const q = filtroManual.trim().toLowerCase();
    if (!q) return manualCatalog.slice(0, 25);
    return manualCatalog.filter((p) => 
      String(p.nombre || '').toLowerCase().includes(q) || 
      String(p.referencia || '').toLowerCase().includes(q) ||
      String(p.codigo_barras || '').toLowerCase().includes(q)
    );
  }, [manualCatalog, filtroManual]);

  const [editingId, setEditingId] = useState(null);
  const [editCantidad, setEditCantidad] = useState('');


  const handleUpdateCantidad = async (itemId, nuevaCantidad) => {
    console.log("🚀 [CLICK DETECTADO] Actualizar:", itemId, nuevaCantidad);
    const id = Number(itemId);
    const cantidadNum = Number(nuevaCantidad);

    if (!id || !Number.isFinite(id)) return;
    if (!Number.isFinite(cantidadNum) || cantidadNum < 0) return;
    if (zonaActiva?.estado !== 'ABIERTA') return;

    setBackendError('');
    setLoading(true); // <-- Corregido con minúscula para evitar el ReferenceError
    setScanError('');
    try {
      console.log(`🚀 [FRONTEND] Enviando PATCH -> /api/zonas/${idZonaActiva}/conteos?id_producto=${itemId}`);
      
      // OPCIÓN 1: id_producto como Query Parameter
      await api.patch(`/api/zonas/${idZonaActiva}/conteos?id_producto=${itemId}`, {
        cantidad_fisica_contada: cantidadNum,
      });

      await refreshItemsZona(idZonaActiva);
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.response?.data || e?.message || 'Error al actualizar cantidad';
      setBackendError(typeof detail === 'string' ? `❌ ${detail}` : '❌ Error al actualizar cantidad');
    } finally {
      setLoading(false);
    }
  };

  const handleDesagregarProducto = async (itemId) => {
    console.log("🚀 [FRONTEND] handleDesagregarProducto (DELETE) -> raw itemId:", itemId, typeof itemId);
    const id = Number(itemId);

    if (!id || !Number.isFinite(id)) return;
    if (zonaActiva?.estado !== 'ABIERTA') return;

    if (!window.confirm('¿Eliminar este producto del conteo de la zona?')) return;

    setBackendError('');
    setLoading(true);
    setScanError('');
    try {
      console.log(`🚀 [FRONTEND] Enviando DELETE -> /api/zonas/${idZonaActiva}/conteos?id_producto=${id}`);
      
      // OPCIÓN 1: id_producto como Query Parameter
      await api.delete(`/api/zonas/${idZonaActiva}/conteos?id_producto=${id}`);
      
      await refreshItemsZona(idZonaActiva);
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.response?.data || e?.message || 'Error al eliminar';
      setBackendError(typeof detail === 'string' ? `❌ ${detail}` : '❌ Error al eliminar');
    } finally {
      setLoading(false);
    }
  };

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
                      Toma # {toma.id} {toma.nombre ? `- ${toma.nombre}` : ''} ({toma.estado || 'CREADA'})
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

        {/* Panel de Captura Operario */}
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
                
                {/* PASO 1: LEER CÓDIGO */}
                <div className="text-xs text-slate-600 font-bold">1) Ingrese Código de Barras o Referencia:</div>
                <div className="flex gap-2 mt-1.5">
                  <input
                    className="flex-1 rounded-lg border px-3 py-2 text-sm font-mono border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    onKeyDown={handleKeyDownBuscador}
                    onDoubleClick={() => !esZonaCerrada && idZonaActiva && setShowModalManual(true)}
                    disabled={esZonaCerrada || !idZonaActiva}
                    placeholder="Escanee, digite o use 📷..."
                    type="text"
                    inputMode="alphanumeric"
                  />
                  
                  {/* BOTÓN NATIVO CAMARA HILADO FINO */}
                  <button
                    type="button"
                    title="Escanear de ráfaga con la cámara del celular"
                    className={`px-3 py-2 rounded-lg text-sm font-bold border transition-all ${mostrarEscaner ? 'bg-red-500 text-white border-red-600' : 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600'}`}
                    disabled={esZonaCerrada || !idZonaActiva}
                    onClick={() => setMostrarEscaner(!mostrarEscaner)}
                  >
                    {mostrarEscaner ? '✕' : '📷'}
                  </button>

                  <button
                    type="button"
                    className="px-4 py-2 bg-slate-700 text-white rounded-lg text-xs font-bold hover:bg-slate-800 shadow-sm"
                    disabled={!codigo.trim() || esZonaCerrada || !idZonaActiva}
                    onClick={() => validarYMostrarProducto(codigo)}
                  >
                    Validar
                  </button>
                </div>

                {/* CONTENEDOR PASIVO NATIVO DE VIDEO (NUNCA ABRE MODAL ARCHIVO) */}
                {mostrarEscaner && (
                  <div className="mt-3 p-2 bg-black rounded-xl border-2 border-indigo-500 overflow-hidden relative shadow-inner">
                    <div id="reader-cam" className="w-full overflow-hidden rounded-lg bg-black"></div>
                    {/* Línea roja decorativa emulando láser industrial */}
                    <div className="absolute top-1/2 left-0 w-full h-0.5 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)] animate-pulse"></div>
                  </div>
                )}

                {/* VISUALIZACIÓN PRE-SELECCIÓN */}
                {productoPreSeleccionado && (
                  <div className="mt-3 p-3 rounded-lg bg-indigo-50/70 border border-indigo-200 flex items-start gap-2.5 animate-in slide-in-from-top-1 duration-100">
                    <div className="text-indigo-600 text-lg mt-0.5">👁️</div>
                    <div className="text-xs flex-1">
                      <span className="font-extrabold text-indigo-900 block tracking-wider text-[10px]">PRODUCTO IDENTIFICADO:</span>
                      <span className="font-bold text-slate-900 text-sm block mt-0.5">{productoPreSeleccionado.nombre}</span>
                      <span className="text-slate-600 text-[11px] mt-0.5 block font-medium">
                        Ref: {productoPreSeleccionado.referencia || '—'} | Cód: {productoPreSeleccionado.codigo_barras}
                      </span>
                    </div>
                  </div>
                )}

                {/* PASO 2: CANTIDAD Y FOCO AUTOMÁTICO */}
                <div className="mt-4 pt-3 border-t border-slate-200 grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-500 font-medium">2) Cantidad física:</label>
                    <input
                      ref={cantidadInputRef} // Permite el foco forzado por JS
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm border-slate-300 font-bold text-slate-900 focus:border-indigo-500 focus:ring-indigo-500 text-center bg-white"
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
                      className="w-full px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-50 hover:bg-emerald-700 transition-colors shadow-sm uppercase tracking-wide text-xs"
                      disabled={!productoPreSeleccionado || cantidad <= 0 || loading || !idZonaActiva || esZonaCerrada}
                      onClick={ejecutarGuardadoConteo}
                    >
                      {loading ? 'Registrando...' : '✓ Confirmar (Enter)'}
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

            {itemsZona && itemsZona.length > 0 && (
              <button
                type="button"
                className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold hover:bg-emerald-100 transition-colors"
                onClick={() => exportarZonaExcel(idZonaActiva, (zonaActivaNombre && String(zonaActivaNombre).trim()) || zonaNombre || 'Zona')}

              >
                📊 Exportar Zona
              </button>
            )}

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
                    .map((it, idx) => {
                      const itemId = it.id;
                      const cantidadActual = it.cantidad_contada ?? it.cantidad_fisica_contada ?? it.cantidad ?? 0;

                      return (
                        <tr key={it.id_conteo || it.id_item || itemId || it.id_producto || idx} className="border-b last:border-b-0 hover:bg-slate-50">

                          <td className="px-3 py-2 font-semibold text-slate-900">{it.nombre || it.producto_nombre || 'Sin nombre'}</td>
                          <td className="px-3 py-2 text-slate-600">{it.referencia || '—'}</td>
                          <td className="px-3 py-2 font-mono text-slate-600 break-all">{it.codigo_barras}</td>

                          <td className="px-3 py-2 text-center">
                            {zonaActiva?.estado === 'ABIERTA' ? (
                              <div className="flex items-center justify-center gap-2">
                                {editingId === it.id_producto ? (
                                  <>
                                    <input
                                      type="number"
                                      min={0}
                                      id={`qty-${it.id_producto}`}
                                      className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-xs font-bold"
                                      value={editCantidad}
                                      onChange={(e) => {
                                        setEditCantidad(e.target.value);
                                      }}
                                    />
                                    <button
                                      type="button"
                                      className="text-emerald-700 hover:text-emerald-800"
                                      title="Guardar"
                                      disabled={loading}
                                      onClick={async () => {
                                        await handleUpdateCantidad(it.id_producto, editCantidad);
                                        setEditingId(null);
                                        setEditCantidad('');
                                        await refreshItemsZona(idZonaActiva);
                                      }}
                                    >
                                      💾
                                    </button>
                                    <button
                                      type="button"
                                      className="text-red-700 hover:text-red-800"
                                      title="Cancelar"
                                      disabled={loading}
                                      onClick={() => {
                                        setEditingId(null);
                                        setEditCantidad('');
                                      }}
                                    >
                                      ❌
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <span className="font-bold">{cantidadActual}</span>
                                    <button
                                      type="button"
                                      className="text-blue-600 hover:text-blue-700 disabled:opacity-50"
                                      title="Editar"
                                      onClick={() => {
                                        setEditingId(it.id_producto);
                                        setEditCantidad(String(it.cantidad_fisica_contada ?? it.cantidad_contada ?? it.cantidad ?? 0));
                                      }}
                                      disabled={zonaActiva?.estado !== 'ABIERTA'}
                                    >
                                      ✏️
                                    </button>
                                  </>
                                )}
                              </div>
                            ) : (
                              <span className="font-bold text-indigo-600 text-sm bg-indigo-50/30 px-2 py-1 rounded">
                                {cantidadActual}
                              </span>
                            )}
                          </td>

                          {zonaActiva?.estado === 'ABIERTA' ? (
                            <td className="px-2 py-2 text-right">

                               <button
                                  type="button"
                                  className="text-slate-400 hover:text-red-600 disabled:opacity-50"
                                  title="Desagregar / Eliminar"
                                  onClick={() => {
                                    // Esto nos dejará abrir y examinar todas las propiedades reales en la consola
                                    console.log("🔍 ESTRUCTURA COMPLETA DE LA FILA:", it);
                                    handleDesagregarProducto(it.id_conteo || it.id_item || it.id_producto);
                                  }}
                                >
                                  🗑️
                                </button>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })

                )}

              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL EMERGENTE DE CONTINGENCIA MANUAL */}
      {showModalManual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-60 transition-opacity">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
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

            <div className="p-3 bg-slate-50 border-b border-slate-200">
              <label className="text-xs font-semibold text-slate-600 block mb-1">Filtrar por Nombre, Código o Referencia:</label>
              <input 
                type="text"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
                placeholder="Escribe palabras clave para filtrar..."
                value={filtroManual}
                onChange={(e) => setFiltroManual(e.target.value)}
                autoFocus
              />
            </div>

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