import React, { useState } from 'react';
import { Copy, Edit3, Lock, Plus, Save, Trash2 } from 'lucide-react';
import {
  FORMATOS_EXTRACTO_V2,
  SENTIDOS_MONTO_REGLA,
  TIPOS_CLASIFICACION_EXTRACTO,
  TIPOS_COINCIDENCIA_REGLA,
  type FormatoExtractoV2,
  type PerfilBancoV2,
  type ReglaClasificacionV2,
  type SentidoMontoRegla,
  type TipoClasificacionExtracto,
  type TipoCoincidenciaRegla,
} from '../../api/conciliacionV2Api';
import {
  extraerMensajeErrorConciliacion,
  useActualizarPerfilBancoV2,
  useActualizarReglaClasificacionV2,
  useCrearPerfilBancoV2,
  useCrearReglaClasificacionV2,
  useEliminarPerfilBancoV2,
  useEliminarReglaClasificacionV2,
  usePerfilesBancoV2,
  useReglasClasificacionV2,
} from '../../hooks/useConciliacionV2';
import { ColumnaTablaDensa, TablaDensa } from '../ui/TablaDensa';
import { VentanaModal } from '../ui/VentanaModal';

type TabModal = 'PERFILES' | 'REGLAS';

export interface PerfilesYReglasModalProps {
  abierto: boolean;
  onCerrar: () => void;
  empresaId: string;
  puedeEditar: boolean;
}

export const PerfilesYReglasModal: React.FC<PerfilesYReglasModalProps> = ({
  abierto,
  onCerrar,
  empresaId,
  puedeEditar,
}) => {
  const [tab, setTab] = useState<TabModal>('PERFILES');

  // Queries
  const perfilesQuery = usePerfilesBancoV2(empresaId, abierto);
  const reglasQuery = useReglasClasificacionV2(empresaId, abierto);

  // Mutaciones Perfiles
  const crearPerfilMut = useCrearPerfilBancoV2(empresaId);
  const actualizarPerfilMut = useActualizarPerfilBancoV2(empresaId);
  const eliminarPerfilMut = useEliminarPerfilBancoV2(empresaId);

  // Mutaciones Reglas
  const crearReglaMut = useCrearReglaClasificacionV2(empresaId);
  const actualizarReglaMut = useActualizarReglaClasificacionV2(empresaId);
  const eliminarReglaMut = useEliminarReglaClasificacionV2(empresaId);

  // Estado formulario Perfil
  const [formPerfilVisible, setFormPerfilVisible] = useState(false);
  const [editandoPerfilId, setEditandoPerfilId] = useState<string | null>(null);
  const [perfilCodigo, setPerfilCodigo] = useState('');
  const [perfilNombre, setPerfilNombre] = useState('');
  const [perfilBanco, setPerfilBanco] = useState('');
  const [perfilFormato, setPerfilFormato] = useState<FormatoExtractoV2>('CSV');
  const [perfilDelimitador, setPerfilDelimitador] = useState(',');
  const [perfilCodificacion, setPerfilCodificacion] = useState('UTF-8');
  const [perfilFilaEncabezado, setPerfilFilaEncabezado] = useState('1');
  const [perfilFormatoFecha, setPerfilFormatoFecha] = useState('DD/MM/YYYY');
  const [perfilSeparadorDecimal, setPerfilSeparadorDecimal] = useState<'.' | ','>('.');
  const [colFecha, setColFecha] = useState('Fecha');
  const [colDescripcion, setColDescripcion] = useState('Descripcion');
  const [colReferencia, setColReferencia] = useState('Referencia');
  const [colMonto, setColMonto] = useState('');
  const [colAbono, setColAbono] = useState('Abono');
  const [colCargo, setColCargo] = useState('Cargo');
  const [colSaldo, setColSaldo] = useState('Saldo');
  const [signoCargoNegativo, setSignoCargoNegativo] = useState(true);
  const [perfilActivo, setPerfilActivo] = useState(true);
  const [errorFormPerfil, setErrorFormPerfil] = useState<string | null>(null);

  // Estado formulario Regla
  const [formReglaVisible, setFormReglaVisible] = useState(false);
  const [editandoReglaId, setEditandoReglaId] = useState<string | null>(null);
  const [reglaNombre, setReglaNombre] = useState('');
  const [reglaBanco, setReglaBanco] = useState('');
  const [reglaTipoClasificacion, setReglaTipoClasificacion] =
    useState<TipoClasificacionExtracto>('COMISION_BANCARIA');
  const [reglaPatron, setReglaPatron] = useState('');
  const [reglaTipoCoincidencia, setReglaTipoCoincidencia] =
    useState<TipoCoincidenciaRegla>('CONTIENE');
  const [reglaSentidoMonto, setReglaSentidoMonto] = useState<SentidoMontoRegla>('CARGO');
  const [reglaPrioridad, setReglaPrioridad] = useState('100');
  const [reglaActivo, setReglaActivo] = useState(true);
  const [errorFormRegla, setErrorFormRegla] = useState<string | null>(null);

  const abrirNuevoPerfil = () => {
    setEditandoPerfilId(null);
    setPerfilCodigo('');
    setPerfilNombre('');
    setPerfilBanco('');
    setPerfilFormato('CSV');
    setPerfilDelimitador(',');
    setPerfilCodificacion('UTF-8');
    setPerfilFilaEncabezado('1');
    setPerfilFormatoFecha('DD/MM/YYYY');
    setPerfilSeparadorDecimal('.');
    setColFecha('Fecha');
    setColDescripcion('Descripcion');
    setColReferencia('Referencia');
    setColMonto('');
    setColAbono('Abono');
    setColCargo('Cargo');
    setColSaldo('Saldo');
    setSignoCargoNegativo(true);
    setPerfilActivo(true);
    setErrorFormPerfil(null);
    setFormPerfilVisible(true);
  };

  const abrirEditarPerfil = (p: PerfilBancoV2, comoCopia = false) => {
    setEditandoPerfilId(comoCopia ? null : p.id);
    setPerfilCodigo(comoCopia ? `${p.codigo}_CUSTOM` : p.codigo);
    setPerfilNombre(comoCopia ? `${p.nombre} (Copia)` : p.nombre);
    setPerfilBanco(p.banco);
    setPerfilFormato(p.formato);
    setPerfilDelimitador(p.delimitador ?? '');
    setPerfilCodificacion(p.codificacion || 'UTF-8');
    setPerfilFilaEncabezado(String(p.filaEncabezado || 1));
    setPerfilFormatoFecha(p.formatoFecha || 'DD/MM/YYYY');
    setPerfilSeparadorDecimal(p.separadorDecimal || '.');
    setColFecha(String(p.mapeoColumnas.fecha ?? ''));
    setColDescripcion(String(p.mapeoColumnas.descripcion ?? ''));
    setColReferencia(
      p.mapeoColumnas.referencia !== null && p.mapeoColumnas.referencia !== undefined
        ? String(p.mapeoColumnas.referencia)
        : ''
    );
    setColMonto(
      p.mapeoColumnas.monto !== null && p.mapeoColumnas.monto !== undefined
        ? String(p.mapeoColumnas.monto)
        : ''
    );
    setColAbono(
      p.mapeoColumnas.abono !== null && p.mapeoColumnas.abono !== undefined
        ? String(p.mapeoColumnas.abono)
        : ''
    );
    setColCargo(
      p.mapeoColumnas.cargo !== null && p.mapeoColumnas.cargo !== undefined
        ? String(p.mapeoColumnas.cargo)
        : ''
    );
    setColSaldo(
      p.mapeoColumnas.saldo !== null && p.mapeoColumnas.saldo !== undefined
        ? String(p.mapeoColumnas.saldo)
        : ''
    );
    setSignoCargoNegativo(p.mapeoColumnas.signoCargoNegativo ?? true);
    setPerfilActivo(p.activo);
    setErrorFormPerfil(null);
    setFormPerfilVisible(true);
  };

  const handleGuardarPerfil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeEditar) return;

    const filaInt = Number.parseInt(perfilFilaEncabezado, 10);
    if (!Number.isInteger(filaInt) || filaInt < 1) {
      setErrorFormPerfil('La fila de encabezado debe ser un entero >= 1.');
      return;
    }
    if (!perfilNombre.trim() || !perfilBanco.trim() || (!editandoPerfilId && !perfilCodigo.trim())) {
      setErrorFormPerfil('Código, nombre y banco son obligatorios.');
      return;
    }
    if (!colFecha.trim() || !colDescripcion.trim()) {
      setErrorFormPerfil('Las columnas Fecha y Descripción son obligatorias.');
      return;
    }
    if (!colMonto.trim() && !colAbono.trim() && !colCargo.trim()) {
      setErrorFormPerfil('Debe definir columna Monto o al menos Abono/Cargo.');
      return;
    }

    setErrorFormPerfil(null);
    const mapeoColumnas = {
      fecha: colFecha.trim(),
      descripcion: colDescripcion.trim(),
      referencia: colReferencia.trim() || null,
      monto: colMonto.trim() || null,
      abono: colAbono.trim() || null,
      cargo: colCargo.trim() || null,
      saldo: colSaldo.trim() || null,
      signoCargoNegativo,
    };

    try {
      if (editandoPerfilId) {
        await actualizarPerfilMut.mutateAsync({
          perfilId: editandoPerfilId,
          payload: {
            nombre: perfilNombre.trim(),
            banco: perfilBanco.trim(),
            formato: perfilFormato,
            delimitador: perfilDelimitador.trim() || null,
            codificacion: perfilCodificacion.trim() || 'UTF-8',
            filaEncabezado: filaInt,
            formatoFecha: perfilFormatoFecha.trim() || 'DD/MM/YYYY',
            separadorDecimal: perfilSeparadorDecimal,
            mapeoColumnas,
            activo: perfilActivo,
          },
        });
      } else {
        await crearPerfilMut.mutateAsync({
          codigo: perfilCodigo.trim().toUpperCase(),
          nombre: perfilNombre.trim(),
          banco: perfilBanco.trim(),
          formato: perfilFormato,
          delimitador: perfilDelimitador.trim() || null,
          codificacion: perfilCodificacion.trim() || 'UTF-8',
          filaEncabezado: filaInt,
          formatoFecha: perfilFormatoFecha.trim() || 'DD/MM/YYYY',
          separadorDecimal: perfilSeparadorDecimal,
          mapeoColumnas,
          activo: perfilActivo,
        });
      }
      setFormPerfilVisible(false);
    } catch {
      // Notificado vía toast
    }
  };

  const abrirNuevaRegla = () => {
    setEditandoReglaId(null);
    setReglaNombre('');
    setReglaBanco('');
    setReglaTipoClasificacion('COMISION_BANCARIA');
    setReglaPatron('');
    setReglaTipoCoincidencia('CONTIENE');
    setReglaSentidoMonto('CARGO');
    setReglaPrioridad('100');
    setReglaActivo(true);
    setErrorFormRegla(null);
    setFormReglaVisible(true);
  };

  const abrirEditarRegla = (r: ReglaClasificacionV2) => {
    setEditandoReglaId(r.id);
    setReglaNombre(r.nombre);
    setReglaBanco(r.banco ?? '');
    setReglaTipoClasificacion(r.tipoClasificacion);
    setReglaPatron(r.patronTexto);
    setReglaTipoCoincidencia(r.tipoCoincidencia);
    setReglaSentidoMonto(r.sentidoMonto);
    setReglaPrioridad(String(r.prioridad));
    setReglaActivo(r.activo);
    setErrorFormRegla(null);
    setFormReglaVisible(true);
  };

  const handleGuardarRegla = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeEditar) return;

    const prioInt = Number.parseInt(reglaPrioridad, 10);
    if (!Number.isInteger(prioInt) || prioInt < 1 || prioInt > 9999) {
      setErrorFormRegla('La prioridad debe ser un número entero entre 1 y 9999.');
      return;
    }
    if (!reglaNombre.trim() || !reglaPatron.trim()) {
      setErrorFormRegla('El nombre y el patrón de texto son obligatorios.');
      return;
    }

    setErrorFormRegla(null);
    const payload = {
      nombre: reglaNombre.trim(),
      banco: reglaBanco.trim() ? reglaBanco.trim() : null,
      tipoClasificacion: reglaTipoClasificacion,
      patronTexto: reglaPatron.trim(),
      tipoCoincidencia: reglaTipoCoincidencia,
      sentidoMonto: reglaSentidoMonto,
      prioridad: prioInt,
      activo: reglaActivo,
    };

    try {
      if (editandoReglaId) {
        await actualizarReglaMut.mutateAsync({ reglaId: editandoReglaId, payload });
      } else {
        await crearReglaMut.mutateAsync(payload);
      }
      setFormReglaVisible(false);
    } catch {
      // Notificado vía toast
    }
  };

  const columnasPerfiles: ColumnaTablaDensa<PerfilBancoV2>[] = [
    {
      key: 'codigo',
      header: 'Código',
      width: '140px',
      render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.codigo}</span>,
    },
    { key: 'banco', header: 'Banco', width: '125px' },
    { key: 'nombre', header: 'Nombre del Perfil' },
    {
      key: 'formato',
      header: 'Formato',
      width: '75px',
      align: 'center',
      render: (r) => <span className="font-mono">{r.formato}</span>,
    },
    {
      key: 'origen',
      header: 'Origen',
      width: '105px',
      align: 'center',
      render: (r) =>
        r.esSistema || r.predefinido ? (
          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[#EFF6FF] text-[#1E3A5F] border border-[#1E3A5F]">
            PREDEFINIDO
          </span>
        ) : (
          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[#ECFDF5] text-[#1E6F42] border border-[#1E6F42]">
            EMPRESA
          </span>
        ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      width: '130px',
      align: 'center',
      render: (r) => {
        const esPersonalizado = !r.esSistema && !r.predefinido && Boolean(r.id);
        return (
          <div className="inline-flex items-center gap-1">
            {!esPersonalizado && (
              <button
                type="button"
                disabled={!puedeEditar}
                onClick={() => abrirEditarPerfil(r, true)}
                title="Duplicar como perfil personalizado"
                className="h-6 px-1.5 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#1E3A5F] border border-[#D1D5DB] text-[10px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-40 rounded-none"
              >
                <Copy className="w-3 h-3" />
                <span>Copiar</span>
              </button>
            )}
            {esPersonalizado && r.id && (
              <>
                <button
                  type="button"
                  disabled={!puedeEditar}
                  onClick={() => abrirEditarPerfil(r, false)}
                  title="Editar perfil"
                  className="h-6 px-1.5 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#111827] border border-[#D1D5DB] cursor-pointer disabled:opacity-40 rounded-none"
                >
                  <Edit3 className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  disabled={!puedeEditar || eliminarPerfilMut.isPending}
                  onClick={() => {
                    if (r.id) void eliminarPerfilMut.mutateAsync(r.id);
                  }}
                  title="Eliminar perfil personalizado"
                  className="h-6 px-1.5 bg-[#FFFFFF] hover:bg-[#FEF2F2] text-[#B91C1C] border border-[#D1D5DB] cursor-pointer disabled:opacity-40 rounded-none"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  const columnasReglas: ColumnaTablaDensa<ReglaClasificacionV2>[] = [
    {
      key: 'prioridad',
      header: 'Prio.',
      width: '55px',
      align: 'center',
      render: (r) => <span className="font-mono font-bold">{r.prioridad}</span>,
    },
    { key: 'nombre', header: 'Nombre Regla' },
    {
      key: 'banco',
      header: 'Banco',
      width: '105px',
      render: (r) => <span className="text-[11px]">{r.banco || 'Todos'}</span>,
    },
    {
      key: 'tipoClasificacion',
      header: 'Clasificación',
      width: '140px',
      render: (r) => (
        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[#EFF6FF] text-[#1E3A5F] border border-[#1E3A5F]">
          {r.tipoClasificacion}
        </span>
      ),
    },
    {
      key: 'patronTexto',
      header: 'Patrón / Coincidencia',
      render: (r) => (
        <div className="font-mono text-[11px] truncate">
          <span className="text-[#4B5563]">[{r.tipoCoincidencia} · {r.sentidoMonto}]</span>{' '}
          {r.patronTexto}
        </div>
      ),
    },
    {
      key: 'origen',
      header: 'Origen',
      width: '90px',
      align: 'center',
      render: (r) =>
        r.esSistema ? (
          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[#F3F4F6] text-[#4B5563] border border-[#9CA3AF]">
            BASE
          </span>
        ) : (
          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[#ECFDF5] text-[#1E6F42] border border-[#1E6F42]">
            EMPRESA
          </span>
        ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      width: '85px',
      align: 'center',
      render: (r) =>
        !r.esSistema && r.id ? (
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              disabled={!puedeEditar}
              onClick={() => abrirEditarRegla(r)}
              title="Editar regla"
              className="h-6 px-1.5 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#111827] border border-[#D1D5DB] cursor-pointer disabled:opacity-40 rounded-none"
            >
              <Edit3 className="w-3 h-3" />
            </button>
            <button
              type="button"
              disabled={!puedeEditar || eliminarReglaMut.isPending}
              onClick={() => {
                if (r.id) void eliminarReglaMut.mutateAsync(r.id);
              }}
              title="Eliminar regla"
              className="h-6 px-1.5 bg-[#FFFFFF] hover:bg-[#FEF2F2] text-[#B91C1C] border border-[#D1D5DB] cursor-pointer disabled:opacity-40 rounded-none"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <span className="text-[10px] text-[#9CA3AF]">Sistema</span>
        ),
    },
  ];

  return (
    <VentanaModal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Perfiles Bancarios y Reglas de Clasificación V2"
      subtitulo="Plantillas de importación y clasificación automática de glosas"
      ancho="2xl"
      footer={
        <button
          type="button"
          onClick={onCerrar}
          className="h-7 px-3 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#111827] border border-[#D1D5DB] text-[12px] cursor-pointer rounded-none"
        >
          Cerrar
        </button>
      }
    >
      <div className="space-y-3">
        {!puedeEditar && (
          <div className="p-2 bg-[#FEF3C7] border border-[#B45309] text-[#7C2D12] text-[11px] flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span>
              Modo solo lectura. Crear, editar o eliminar perfiles y reglas está reservado a
              ADMINISTRADOR y CONTADOR.
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-b border-[#D1D5DB] pb-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTab('PERFILES')}
              className={`h-7 px-3 text-[12px] border cursor-pointer rounded-none ${
                tab === 'PERFILES'
                  ? 'bg-[#1E3A5F] text-[#FFFFFF] border-[#1E3A5F] font-bold'
                  : 'bg-[#F5F7FA] text-[#111827] border-[#D1D5DB]'
              }`}
            >
              Perfiles Bancarios ({perfilesQuery.data?.length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setTab('REGLAS')}
              className={`h-7 px-3 text-[12px] border cursor-pointer rounded-none ${
                tab === 'REGLAS'
                  ? 'bg-[#1E3A5F] text-[#FFFFFF] border-[#1E3A5F] font-bold'
                  : 'bg-[#F5F7FA] text-[#111827] border-[#D1D5DB]'
              }`}
            >
              Reglas de Clasificación ({reglasQuery.data?.length ?? 0})
            </button>
          </div>

          {puedeEditar && tab === 'PERFILES' && (
            <button
              type="button"
              onClick={abrirNuevoPerfil}
              className="h-7 px-2.5 bg-[#1E3A5F] hover:bg-[#162C49] text-[#FFFFFF] border border-[#1E3A5F] text-[12px] inline-flex items-center gap-1 cursor-pointer rounded-none"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuevo Perfil</span>
            </button>
          )}

          {puedeEditar && tab === 'REGLAS' && (
            <button
              type="button"
              onClick={abrirNuevaRegla}
              className="h-7 px-2.5 bg-[#1E3A5F] hover:bg-[#162C49] text-[#FFFFFF] border border-[#1E3A5F] text-[12px] inline-flex items-center gap-1 cursor-pointer rounded-none"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nueva Regla</span>
            </button>
          )}
        </div>

        {/* TAB PERFILES */}
        {tab === 'PERFILES' && (
          <div className="space-y-3">
            {formPerfilVisible && (
              <form
                onSubmit={handleGuardarPerfil}
                className="p-3 bg-[#F5F7FA] border border-[#1E3A5F] space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#1E3A5F] text-[12px]">
                    {editandoPerfilId ? 'Editar Perfil Personalizado' : 'Crear Perfil Personalizado'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFormPerfilVisible(false)}
                    className="text-[11px] text-[#4B5563] hover:text-[#111827] cursor-pointer"
                  >
                    Cancelar edición
                  </button>
                </div>

                {errorFormPerfil && (
                  <div className="p-2 bg-[#FEF2F2] border border-[#B91C1C] text-[#B91C1C] text-[11px]">
                    {errorFormPerfil}
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Código *</label>
                    <input
                      type="text"
                      required
                      disabled={Boolean(editandoPerfilId)}
                      value={perfilCodigo}
                      onChange={(e) => setPerfilCodigo(e.target.value)}
                      placeholder="BCP_CUSTOM"
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] font-mono disabled:bg-[#F3F4F6] rounded-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Banco *</label>
                    <input
                      type="text"
                      required
                      value={perfilBanco}
                      onChange={(e) => setPerfilBanco(e.target.value)}
                      placeholder="BCP"
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] rounded-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Nombre *</label>
                    <input
                      type="text"
                      required
                      value={perfilNombre}
                      onChange={(e) => setPerfilNombre(e.target.value)}
                      placeholder="BCP Cuenta Corriente"
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] rounded-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Formato *</label>
                    <select
                      value={perfilFormato}
                      onChange={(e) => setPerfilFormato(e.target.value as FormatoExtractoV2)}
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] rounded-none"
                    >
                      {FORMATOS_EXTRACTO_V2.map((fmt) => (
                        <option key={fmt} value={fmt}>
                          {fmt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Delimitador</label>
                    <input
                      type="text"
                      maxLength={5}
                      value={perfilDelimitador}
                      onChange={(e) => setPerfilDelimitador(e.target.value)}
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] font-mono rounded-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Fila Encab.</label>
                    <input
                      type="number"
                      min={1}
                      value={perfilFilaEncabezado}
                      onChange={(e) => setPerfilFilaEncabezado(e.target.value)}
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] font-mono rounded-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Formato Fecha</label>
                    <input
                      type="text"
                      value={perfilFormatoFecha}
                      onChange={(e) => setPerfilFormatoFecha(e.target.value)}
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] font-mono rounded-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Sep. Decimal</label>
                    <select
                      value={perfilSeparadorDecimal}
                      onChange={(e) => setPerfilSeparadorDecimal(e.target.value as '.' | ',')}
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] rounded-none"
                    >
                      <option value=".">Punto (.)</option>
                      <option value=",">Coma (,)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Codificación</label>
                    <input
                      type="text"
                      value={perfilCodificacion}
                      onChange={(e) => setPerfilCodificacion(e.target.value)}
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] font-mono rounded-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Col. Fecha *</label>
                    <input
                      type="text"
                      value={colFecha}
                      onChange={(e) => setColFecha(e.target.value)}
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] rounded-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Col. Descripción *</label>
                    <input
                      type="text"
                      value={colDescripcion}
                      onChange={(e) => setColDescripcion(e.target.value)}
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] rounded-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Col. Referencia</label>
                    <input
                      type="text"
                      value={colReferencia}
                      onChange={(e) => setColReferencia(e.target.value)}
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] rounded-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Col. Saldo</label>
                    <input
                      type="text"
                      value={colSaldo}
                      onChange={(e) => setColSaldo(e.target.value)}
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] rounded-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Col. Monto (única)</label>
                    <input
                      type="text"
                      value={colMonto}
                      onChange={(e) => setColMonto(e.target.value)}
                      placeholder="Opcional si usa Abono/Cargo"
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] rounded-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Col. Abono</label>
                    <input
                      type="text"
                      value={colAbono}
                      onChange={(e) => setColAbono(e.target.value)}
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] rounded-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Col. Cargo</label>
                    <input
                      type="text"
                      value={colCargo}
                      onChange={(e) => setColCargo(e.target.value)}
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] rounded-none"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={signoCargoNegativo}
                        onChange={(e) => setSignoCargoNegativo(e.target.checked)}
                        className="accent-[#1E3A5F]"
                      />
                      <span>Cargo neg.</span>
                    </label>
                    <button
                      type="submit"
                      disabled={crearPerfilMut.isPending || actualizarPerfilMut.isPending}
                      className="h-7 px-3 bg-[#1E3A5F] hover:bg-[#162C49] text-[#FFFFFF] border border-[#1E3A5F] text-[12px] inline-flex items-center gap-1 cursor-pointer rounded-none"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Guardar</span>
                    </button>
                  </div>
                </div>
              </form>
            )}

            <div className="max-h-[340px] overflow-y-auto">
              <TablaDensa
                columnas={columnasPerfiles}
                datos={perfilesQuery.data ?? []}
                rowKey={(r) => r.id || r.codigo}
                cargando={perfilesQuery.isLoading}
                mensajeError={
                  perfilesQuery.error
                    ? extraerMensajeErrorConciliacion(
                        perfilesQuery.error,
                        'Error cargando perfiles bancarios.'
                      )
                    : null
                }
              />
            </div>
          </div>
        )}

        {/* TAB REGLAS */}
        {tab === 'REGLAS' && (
          <div className="space-y-3">
            {formReglaVisible && (
              <form
                onSubmit={handleGuardarRegla}
                className="p-3 bg-[#F5F7FA] border border-[#1E3A5F] space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#1E3A5F] text-[12px]">
                    {editandoReglaId ? 'Editar Regla de Clasificación' : 'Nueva Regla de Clasificación'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFormReglaVisible(false)}
                    className="text-[11px] text-[#4B5563] hover:text-[#111827] cursor-pointer"
                  >
                    Cancelar edición
                  </button>
                </div>

                {errorFormRegla && (
                  <div className="p-2 bg-[#FEF2F2] border border-[#B91C1C] text-[#B91C1C] text-[11px]">
                    {errorFormRegla}
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Nombre *</label>
                    <input
                      type="text"
                      required
                      value={reglaNombre}
                      onChange={(e) => setReglaNombre(e.target.value)}
                      placeholder="Comisión mantenimiento BCP"
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] rounded-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Banco (opcional)</label>
                    <input
                      type="text"
                      value={reglaBanco}
                      onChange={(e) => setReglaBanco(e.target.value)}
                      placeholder="Todos si vacío"
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] rounded-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Tipo Clasificación *</label>
                    <select
                      value={reglaTipoClasificacion}
                      onChange={(e) =>
                        setReglaTipoClasificacion(e.target.value as TipoClasificacionExtracto)
                      }
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] rounded-none"
                    >
                      {TIPOS_CLASIFICACION_EXTRACTO.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Prioridad (1-9999)</label>
                    <input
                      type="number"
                      min={1}
                      max={9999}
                      value={reglaPrioridad}
                      onChange={(e) => setReglaPrioridad(e.target.value)}
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] font-mono rounded-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold mb-0.5">Patrón de Texto *</label>
                    <input
                      type="text"
                      required
                      value={reglaPatron}
                      onChange={(e) => setReglaPatron(e.target.value)}
                      placeholder="COMISION MANTENIMIENTO"
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] font-mono rounded-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Coincidencia</label>
                    <select
                      value={reglaTipoCoincidencia}
                      onChange={(e) =>
                        setReglaTipoCoincidencia(e.target.value as TipoCoincidenciaRegla)
                      }
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] rounded-none"
                    >
                      {TIPOS_COINCIDENCIA_REGLA.map((tc) => (
                        <option key={tc} value={tc}>
                          {tc}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-[11px] font-bold mb-0.5">Sentido Monto</label>
                      <select
                        value={reglaSentidoMonto}
                        onChange={(e) => setReglaSentidoMonto(e.target.value as SentidoMontoRegla)}
                        className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] rounded-none"
                      >
                        {SENTIDOS_MONTO_REGLA.map((sm) => (
                          <option key={sm} value={sm}>
                            {sm}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={crearReglaMut.isPending || actualizarReglaMut.isPending}
                      className="h-7 px-3 bg-[#1E3A5F] hover:bg-[#162C49] text-[#FFFFFF] border border-[#1E3A5F] text-[12px] inline-flex items-center gap-1 cursor-pointer shrink-0 rounded-none"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Guardar</span>
                    </button>
                  </div>
                </div>
              </form>
            )}

            <div className="max-h-[340px] overflow-y-auto">
              <TablaDensa
                columnas={columnasReglas}
                datos={reglasQuery.data ?? []}
                rowKey={(r, idx) => r.id || `${r.nombre}-${idx}`}
                cargando={reglasQuery.isLoading}
                mensajeError={
                  reglasQuery.error
                    ? extraerMensajeErrorConciliacion(
                        reglasQuery.error,
                        'Error cargando reglas de clasificación.'
                      )
                    : null
                }
              />
            </div>
          </div>
        )}
      </div>
    </VentanaModal>
  );
};
