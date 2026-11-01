import React, { useState, useMemo } from 'react';
import { Plus, Edit3, UserX, Settings, ShieldCheck } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useEmpresaPeriodo } from '../../context/EmpresaPeriodoContext';
import {
  useTrabajadores,
  useCrearTrabajador,
  useActualizarTrabajador,
  useParametrosLaborales,
  useGuardarParametroLaboral
} from '../../hooks/useTesoreriaPlanilla';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { VentanaModal } from '../ui/VentanaModal';
import { CampoNumerico } from '../ui/CampoNumerico';

const CODIGOS_PARAMETROS_LABORALES = [
  'RMV',
  'UIT',
  'ASIGNACION_FAMILIAR',
  'TASA_ONP',
  'TASA_ESSALUD',
  'TASA_BONIF_EXTRA_ESSALUD',
  'TASA_BONIF_EXTRA_EPS',
  'TASA_HORA_EXTRA_25',
  'TASA_HORA_EXTRA_35',
  'DEDUCCION_5TA_UIT',
  'AFP_APORTE_OBLIGATORIO',
  'AFP_PRIMA_SEGURO',
  'TOPE_PRIMA_SEGURO_AFP',
  'AFP_INTEGRA_COMISION_FLUJO',
  'AFP_INTEGRA_COMISION_MIXTA',
  'AFP_PRIMA_COMISION_FLUJO',
  'AFP_PRIMA_COMISION_MIXTA',
  'AFP_PROFUTURO_COMISION_FLUJO',
  'AFP_PROFUTURO_COMISION_MIXTA',
  'AFP_HABITAT_COMISION_FLUJO',
  'AFP_HABITAT_COMISION_MIXTA'
];

export const TrabajadoresView: React.FC = () => {
  const { notify } = useAppContext();
  const { empresaActiva } = useEmpresaPeriodo();
  const empresaId = empresaActiva?.id || '00000000-0000-0000-0000-000000000001';

  const { data: trabajadores = [], isLoading } = useTrabajadores(empresaId);
  const crearMutation = useCrearTrabajador(empresaId);
  const actualizarMutation = useActualizarTrabajador(empresaId);

  const { data: todosParametros = [] } = useParametrosLaborales();
  const guardarParametroMutation = useGuardarParametroLaboral();

  const parametrosLaborales = useMemo(() => {
    const filtrados = todosParametros.filter(
      (p: any) =>
        CODIGOS_PARAMETROS_LABORALES.includes(p.codigoParametro) ||
        String(p.codigoParametro).startsWith('TASA_5TA_') ||
        String(p.codigoParametro).startsWith('AFP_')
    );
    return filtrados;
  }, [todosParametros]);

  const rmvActual = useMemo(() => {
    const rmvItem = parametrosLaborales.find((p: any) => p.codigoParametro === 'RMV');
    return rmvItem ? Number(rmvItem.valorNumerico) : 1130;
  }, [parametrosLaborales]);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [modoEdicionId, setModoEdicionId] = useState<string | null>(null);
  const [modalBajaAbierto, setModalBajaAbierto] = useState(false);
  const [trabajadorBaja, setTrabajadorBaja] = useState<any | null>(null);
  const [modalParametrosAbierto, setModalParametrosAbierto] = useState(false);

  // Campos del formulario de trabajador (Tarea 1)
  const [tipoDocumento, setTipoDocumento] = useState('1');
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [cargo, setCargo] = useState('ANALISTA CONTABLE');
  const [tipoContrato, setTipoContrato] = useState<'INDETERMINADO' | 'PLAZO_FIJO' | 'TIEMPO_PARCIAL'>('INDETERMINADO');
  const [fechaIngreso, setFechaIngreso] = useState('2026-01-01');
  const [fechaFinContrato, setFechaFinContrato] = useState('');
  const [regimenLaboral, setRegimenLaboral] = useState<'GENERAL' | 'MYPE_PEQUENA' | 'MYPE_MICRO'>('GENERAL');
  const [sueldoBase, setSueldoBase] = useState('2500.00');
  const [cargasFamiliares, setCargasFamiliares] = useState('0');
  const [tieneAsignacionFamiliar, setTieneAsignacionFamiliar] = useState(false);
  const [sistemaPensiones, setSistemaPensiones] = useState<'ONP' | 'AFP'>('ONP');
  const [afpAdministradora, setAfpAdministradora] = useState<'INTEGRA' | 'PRIMA' | 'PROFUTURO' | 'HABITAT'>('INTEGRA');
  const [afpTipoComision, setAfpTipoComision] = useState<'FLUJO' | 'MIXTA'>('FLUJO');
  const [cuspp, setCuspp] = useState('');
  const [bancoSueldo, setBancoSueldo] = useState('BCP');
  const [cuentaBancoSueldo, setCuentaBancoSueldo] = useState('');
  const [cciSueldo, setCciSueldo] = useState('');
  const [centroCosto, setCentroCosto] = useState('ADMINISTRACION');
  const [afiliadoEps, setAfiliadoEps] = useState(false);

  // Campos de baja
  const [fechaCese, setFechaCese] = useState('2026-09-15');
  const [motivoCese, setMotivoCese] = useState('RENUNCIA VOLUNTARIA');

  // Campos de edición de parámetro laboral (Tarea 6)
  const [paramCodigo, setParamCodigo] = useState('RMV');
  const [paramDesc, setParamDesc] = useState('Remuneración Mínima Vital Vigente');
  const [paramValor, setParamValor] = useState('1130');
  const [paramTipo, setParamTipo] = useState('MONEDA');
  const [paramDesde, setParamDesde] = useState('2026-01-01');
  const [paramHasta, setParamHasta] = useState('');

  const abrirNuevo = () => {
    setModoEdicionId(null);
    setTipoDocumento('1');
    setNumeroDocumento('');
    setNombres('');
    setApellidos('');
    setCargo('ASISTENTE CONTABLE');
    setTipoContrato('INDETERMINADO');
    setFechaIngreso('2026-01-01');
    setFechaFinContrato('');
    setRegimenLaboral('GENERAL');
    setSueldoBase(String(rmvActual.toFixed(2)));
    setCargasFamiliares('0');
    setTieneAsignacionFamiliar(false);
    setSistemaPensiones('ONP');
    setAfpAdministradora('INTEGRA');
    setAfpTipoComision('FLUJO');
    setCuspp('');
    setBancoSueldo('BCP');
    setCuentaBancoSueldo('');
    setCciSueldo('');
    setCentroCosto('ADMINISTRACION');
    setAfiliadoEps(false);
    setModalAbierto(true);
  };

  const abrirEdicion = (t: any) => {
    setModoEdicionId(t.id);
    setTipoDocumento(t.tipoDocumento || '1');
    setNumeroDocumento(t.numeroDocumento || '');
    setNombres(t.nombres || '');
    setApellidos(t.apellidos || '');
    setCargo(t.cargo || '');
    setTipoContrato(t.tipoContrato || 'INDETERMINADO');
    setFechaIngreso(t.fechaIngreso || '2024-01-01');
    setFechaFinContrato(t.fechaFinContrato || '');
    setRegimenLaboral(t.regimenLaboral || 'GENERAL');
    setSueldoBase(String(Number(t.sueldoBase || rmvActual).toFixed(2)));
    setCargasFamiliares(String(t.cargasFamiliares ?? (t.tieneAsignacionFamiliar ? 1 : 0)));
    setTieneAsignacionFamiliar(Boolean(t.tieneAsignacionFamiliar));
    setSistemaPensiones(t.sistemaPensiones || 'ONP');
    setAfpAdministradora(t.afpAdministradora || 'INTEGRA');
    setAfpTipoComision(t.afpTipoComision || 'FLUJO');
    setCuspp(t.cuspp || '');
    setBancoSueldo(t.bancoSueldo || 'BCP');
    setCuentaBancoSueldo(t.cuentaBancoSueldo || '');
    setCciSueldo(t.cciSueldo || '');
    setCentroCosto(t.centroCosto || 'ADMINISTRACION');
    setAfiliadoEps(Boolean(t.afiliadoEps));
    setModalAbierto(true);
  };

  const guardarTrabajador = async () => {
    if (!numeroDocumento.trim() || !nombres.trim() || !apellidos.trim()) {
      notify('Complete Número de documento, Nombres y Apellidos del trabajador', 'warning');
      return;
    }

    const numCargas = Math.max(0, parseInt(cargasFamiliares, 10) || 0);
    const payload = {
      tipoDocumento,
      numeroDocumento: numeroDocumento.trim(),
      nombres: nombres.trim().toUpperCase(),
      apellidos: apellidos.trim().toUpperCase(),
      cargo: cargo.trim().toUpperCase() || 'COLABORADOR',
      tipoContrato,
      fechaIngreso,
      fechaInicioContrato: fechaIngreso,
      fechaFinContrato: fechaFinContrato.trim() || undefined,
      regimenLaboral,
      sueldoBase: Number(sueldoBase) || rmvActual,
      cargasFamiliares: numCargas,
      tieneAsignacionFamiliar: tieneAsignacionFamiliar || numCargas > 0,
      sistemaPensiones,
      afpAdministradora: sistemaPensiones === 'AFP' ? afpAdministradora : undefined,
      afpTipoComision: sistemaPensiones === 'AFP' ? afpTipoComision : 'FLUJO',
      cuspp: sistemaPensiones === 'AFP' ? cuspp.trim() || undefined : undefined,
      bancoSueldo: bancoSueldo.trim() || undefined,
      cuentaBancoSueldo: cuentaBancoSueldo.trim() || undefined,
      cciSueldo: cciSueldo.trim() || undefined,
      centroCosto,
      afiliadoEps,
      activo: true
    };

    try {
      if (modoEdicionId) {
        await actualizarMutation.mutateAsync({ trabajadorId: modoEdicionId, datos: payload });
        notify(`Ficha de ${payload.apellidos}, ${payload.nombres} actualizada y registrada en T-Registro`, 'success');
      } else {
        await crearMutation.mutateAsync(payload);
        notify(`Alta de ${payload.apellidos}, ${payload.nombres} registrada en padrón y T-Registro`, 'success');
      }
      setModalAbierto(false);
    } catch (err: any) {
      notify(err?.response?.data?.error || err.message || 'Error al guardar trabajador', 'error');
    }
  };

  const confirmarBaja = async () => {
    if (!trabajadorBaja) return;
    try {
      await actualizarMutation.mutateAsync({
        trabajadorId: trabajadorBaja.id,
        datos: {
          fechaCese,
          motivoCese,
          activo: false
        }
      });
      notify(`Baja de ${trabajadorBaja.apellidos}, ${trabajadorBaja.nombres} registrada con fecha ${fechaCese}`, 'info');
      setModalBajaAbierto(false);
      setTrabajadorBaja(null);
    } catch (err: any) {
      notify(err?.response?.data?.error || err.message || 'Error al registrar baja', 'error');
    }
  };

  const guardarParametro = async () => {
    const val = parseFloat(paramValor);
    if (isNaN(val) || val < 0) {
      notify('Ingrese un valor numérico válido', 'warning');
      return;
    }
    try {
      await guardarParametroMutation.mutateAsync({
        codigoParametro: paramCodigo.trim().toUpperCase(),
        descripcion: paramDesc.trim(),
        valorNumerico: val,
        tipoDato: paramTipo,
        vigenteDesde: paramDesde,
        vigenteHasta: paramHasta.trim() ? paramHasta.trim() : null
      });
      notify(`Parámetro ${paramCodigo} actualizado con vigencia desde ${paramDesde}`, 'success');
    } catch (err: any) {
      notify(err?.response?.data?.error || err.message || 'Error al actualizar parámetro', 'error');
    }
  };

  const columnas: ColumnaTablaDensa<any>[] = [
    {
      key: 'numeroDocumento',
      header: 'Doc. Identidad',
      width: '90px',
      render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.numeroDocumento}</span>
    },
    {
      key: 'nombreCompleto',
      header: 'Apellidos y Nombres',
      render: (r) => (
        <div>
          <span className="font-bold text-[#111827]">{r.apellidos}, {r.nombres}</span>
          <span className="block text-[10px] text-[#4B5563]">{r.cargo} — C.C.: {r.centroCosto || 'ADMINISTRACION'}</span>
        </div>
      )
    },
    {
      key: 'contrato',
      header: 'Contrato / Ingreso',
      width: '135px',
      render: (r) => (
        <div className="text-[11px]">
          <span className="font-semibold text-[#111827]">{r.tipoContrato || 'INDETERMINADO'}</span>
          <span className="block font-mono text-[10px] text-[#4B5563]">Ing: {r.fechaIngreso || '-'}</span>
        </div>
      )
    },
    {
      key: 'regimenLaboral',
      header: 'Régimen Laboral',
      width: '115px',
      render: (r) => <span className="font-mono text-[11px] font-bold">{r.regimenLaboral}</span>
    },
    {
      key: 'sistemaPensiones',
      header: 'Sistema Pensión / Comisión',
      width: '165px',
      render: (r) => (
        <div className="text-[11px]">
          <span className="font-mono font-bold text-[#1E3A5F]">
            {r.sistemaPensiones === 'AFP' ? `AFP ${r.afpAdministradora || ''}` : 'ONP (13%)'}
          </span>
          {r.sistemaPensiones === 'AFP' && (
            <span className="block text-[10px] text-[#4B5563]">
              Com.: {r.afpTipoComision || 'FLUJO'} | CUSPP: {r.cuspp || '-'}
            </span>
          )}
        </div>
      )
    },
    {
      key: 'sueldoBase',
      header: 'Rem. Básica S/',
      width: '100px',
      align: 'right',
      render: (r) => <span className="font-mono font-bold">{Number(r.sueldoBase || 0).toFixed(2)}</span>
    },
    {
      key: 'asignacionFamiliar',
      header: 'Cargas / Asig. Fam.',
      width: '115px',
      align: 'center',
      render: (r) =>
        r.tieneAsignacionFamiliar || (r.cargasFamiliares || 0) > 0 ? (
          <span className="text-[#1E6F42] font-bold text-[11px]">
            SÍ ({r.cargasFamiliares || 1}) S/ {(rmvActual * 0.1).toFixed(2)}
          </span>
        ) : (
          <span className="text-[#6B7280] text-[11px]">NO (0)</span>
        )
    },
    {
      key: 'banco',
      header: 'Cuenta Abono Haberes',
      width: '150px',
      render: (r) => (
        <div className="text-[10px] font-mono">
          <span className="font-bold text-[#111827]">{r.bancoSueldo || '-'}</span>
          <span className="block text-[#4B5563]">{r.cuentaBancoSueldo || r.cciSueldo || 'Sin cuenta'}</span>
        </div>
      )
    },
    {
      key: 'estado',
      header: 'Estado',
      width: '85px',
      align: 'center',
      render: (r) =>
        r.activo ? (
          <span className="px-1.5 py-0.5 bg-[#DCFCE7] text-[#166534] font-bold text-[10px] border border-[#86EFAC]">
            ACTIVO
          </span>
        ) : (
          <span
            className="px-1.5 py-0.5 bg-[#FEE2E2] text-[#991B1B] font-bold text-[10px] border border-[#FCA5A5]"
            title={`Cese: ${r.fechaCese || ''} - ${r.motivoCese || ''}`}
          >
            CESADO ({r.fechaCese || ''})
          </span>
        )
    },
    {
      key: 'acciones',
      header: 'Acciones',
      width: '120px',
      align: 'center',
      render: (r) => (
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => abrirEdicion(r)}
            className="h-5 px-1.5 text-[10px] border border-[#D1D5DB] bg-[#FFFFFF] hover:bg-[#F3F4F6] inline-flex items-center gap-0.5"
            title="Editar datos personales, contrato, pensión o cuenta bancaria"
          >
            <Edit3 className="w-3 h-3" />
            Editar
          </button>
          {r.activo && (
            <button
              type="button"
              onClick={() => {
                setTrabajadorBaja(r);
                setFechaCese('2026-09-15');
                setMotivoCese('RENUNCIA VOLUNTARIA');
                setModalBajaAbierto(true);
              }}
              className="h-5 px-1.5 text-[10px] border border-[#FCA5A5] bg-[#FEF2F2] text-[#991B1B] hover:bg-[#FEE2E2] inline-flex items-center gap-0.5"
              title="Registrar baja / cese del trabajador"
            >
              <UserX className="w-3 h-3" />
              Baja
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Padrón Maestro de Trabajadores (T-Registro SUNAT)"
        subtitulo={`Datos personales, contrato, régimen laboral (General / MYPE), ONP/AFP (Flujo/Mixta), cargas familiares, cuenta bancaria y parámetros vigentes (RMV: S/ ${rmvActual.toFixed(2)})`}
        acciones={[
          {
            id: 'parametros-laborales',
            label: 'Parámetros Laborales (RMV / Tasas / UIT)',
            icono: Settings,
            onClick: () => setModalParametrosAbierto(true)
          },
          {
            id: 'nuevo-trab',
            label: 'Registrar Trabajador',
            icono: Plus,
            primario: true,
            onClick: abrirNuevo
          }
        ]}
      />

      <div className="px-3 py-1.5 bg-[#F8FAFC] border-b border-[#D1D5DB] flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-4">
          <span>
            <strong>Total Trabajadores:</strong> {trabajadores.length} ({trabajadores.filter((t: any) => t.activo).length} activos /{' '}
            {trabajadores.filter((t: any) => !t.activo).length} cesados)
          </span>
          <span>
            <strong>RMV Vigente:</strong> <span className="font-mono font-bold text-[#1D4ED8]">S/ {rmvActual.toFixed(2)}</span>
          </span>
          <span>
            <strong>Asignación Familiar (10% RMV):</strong>{' '}
            <span className="font-mono font-bold text-[#1E6F42]">S/ {(rmvActual * 0.1).toFixed(2)}</span>
          </span>
        </div>
        <div className="flex items-center gap-1 text-[#4B5563]">
          <ShieldCheck className="w-3.5 h-3.5 text-[#1D4ED8]" />
          <span>Aislado de declaraciones IGV-Renta · Sincronizado con T-Registro</span>
        </div>
      </div>

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="p-6 text-center text-[12px] text-[#6B7280]">Cargando padrón de trabajadores...</div>
        ) : (
          <TablaDensa columnas={columnas} datos={trabajadores} rowKey={(r) => r.id} />
        )}
      </div>

      {/* MODAL ALTA / EDICIÓN DE TRABAJADOR */}
      <VentanaModal
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        titulo={modoEdicionId ? 'Actualización de Ficha Laboral (T-Registro)' : 'Alta de Trabajador en Padrón T-Registro'}
        ancho="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setModalAbierto(false)}
              className="h-6 px-3 text-[12px] border border-[#D1D5DB] bg-[#FFFFFF]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardarTrabajador}
              disabled={crearMutation.isPending || actualizarMutation.isPending}
              className="h-6 px-3 text-[12px] border border-[#1D4ED8] bg-[#1D4ED8] text-[#FFFFFF] font-bold"
            >
              {modoEdicionId ? 'Guardar Cambios' : 'Registrar Alta'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-3 gap-3 text-[12px]">
          <div>
            <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">Tipo Doc. (Tabla 03)</label>
            <select
              value={tipoDocumento}
              onChange={(e) => setTipoDocumento(e.target.value)}
              className="w-full h-6 px-2 border border-[#D1D5DB] bg-[#FFFFFF]"
            >
              <option value="1">01 - DNI</option>
              <option value="4">04 - Carnet de Extranjería</option>
              <option value="7">07 - Pasaporte</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">N° Documento</label>
            <input
              type="text"
              value={numeroDocumento}
              onChange={(e) => setNumeroDocumento(e.target.value)}
              placeholder="44556677"
              className="w-full h-6 px-2 font-mono border border-[#D1D5DB]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">Centro de Costos (Asiento 62/94/95)</label>
            <select
              value={centroCosto}
              onChange={(e) => setCentroCosto(e.target.value)}
              className="w-full h-6 px-2 border border-[#D1D5DB] bg-[#FFFFFF]"
            >
              <option value="ADMINISTRACION">ADMINISTRACION (Cta. 941)</option>
              <option value="VENTAS">VENTAS / COMERCIAL (Cta. 951)</option>
              <option value="PRODUCCION">OPERACIONES / PRODUCCIÓN (Cta. 921)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">Apellidos Completos</label>
            <input
              type="text"
              value={apellidos}
              onChange={(e) => setApellidos(e.target.value)}
              placeholder="QUISPE MENDOZA"
              className="w-full h-6 px-2 border border-[#D1D5DB]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">Nombres Completos</label>
            <input
              type="text"
              value={nombres}
              onChange={(e) => setNombres(e.target.value)}
              placeholder="CARLOS ALBERTO"
              className="w-full h-6 px-2 border border-[#D1D5DB]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">Cargo / Ocupación</label>
            <input
              type="text"
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              className="w-full h-6 px-2 border border-[#D1D5DB]"
            />
          </div>

          {/* Contrato y Régimen Laboral */}
          <div>
            <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">Tipo de Contrato (Tabla 12)</label>
            <select
              value={tipoContrato}
              onChange={(e) => setTipoContrato(e.target.value as any)}
              className="w-full h-6 px-2 border border-[#D1D5DB] bg-[#FFFFFF]"
            >
              <option value="INDETERMINADO">Plazo Indeterminado (D.L. 728)</option>
              <option value="PLAZO_FIJO">Sujeto a Modalidad / Plazo Fijo</option>
              <option value="TIEMPO_PARCIAL">Tiempo Parcial (&lt; 4 hrs diarias)</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">Fecha de Ingreso / Inicio</label>
            <input
              type="date"
              value={fechaIngreso}
              onChange={(e) => setFechaIngreso(e.target.value)}
              className="w-full h-6 px-2 font-mono border border-[#D1D5DB]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">Fecha Fin Contrato (Opcional)</label>
            <input
              type="date"
              value={fechaFinContrato}
              onChange={(e) => setFechaFinContrato(e.target.value)}
              className="w-full h-6 px-2 font-mono border border-[#D1D5DB]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">Régimen Laboral</label>
            <select
              value={regimenLaboral}
              onChange={(e) => setRegimenLaboral(e.target.value as any)}
              className="w-full h-6 px-2 border border-[#D1D5DB] bg-[#FFFFFF]"
            >
              <option value="GENERAL">GENERAL — D.L. 728 (100% Grati / CTS / 30d Vac.)</option>
              <option value="MYPE_PEQUENA">MYPE PEQUEÑA EMPRESA (50% Grati / 50% CTS / 15d Vac.)</option>
              <option value="MYPE_MICRO">MYPE MICROEMPRESA (Sin Grati / Sin CTS / 15d Vac.)</option>
            </select>
          </div>
          <div>
            <CampoNumerico label="Remuneración Básica Mensual S/" value={sueldoBase} onChange={setSueldoBase} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">Cargas Familiares (Hijos &lt; 18 / Est.)</label>
            <input
              type="number"
              min={0}
              max={15}
              value={cargasFamiliares}
              onChange={(e) => {
                const v = e.target.value;
                setCargasFamiliares(v);
                if (parseInt(v, 10) > 0) setTieneAsignacionFamiliar(true);
              }}
              className="w-full h-6 px-2 font-mono border border-[#D1D5DB]"
            />
          </div>

          {/* Sistema Pensionario */}
          <div>
            <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">Sistema Pensionario</label>
            <select
              value={sistemaPensiones}
              onChange={(e) => setSistemaPensiones(e.target.value as 'ONP' | 'AFP')}
              className="w-full h-6 px-2 border border-[#D1D5DB] bg-[#FFFFFF]"
            >
              <option value="ONP">ONP — SNP D.L. 19990 (13%)</option>
              <option value="AFP">SPP — AFP (Aporte 10% + Seguro + Comisión)</option>
            </select>
          </div>
          {sistemaPensiones === 'AFP' ? (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">Administradora AFP</label>
                <select
                  value={afpAdministradora}
                  onChange={(e) => setAfpAdministradora(e.target.value as any)}
                  className="w-full h-6 px-2 border border-[#D1D5DB] bg-[#FFFFFF]"
                >
                  <option value="INTEGRA">AFP Integra</option>
                  <option value="PRIMA">AFP Prima</option>
                  <option value="PROFUTURO">AFP Profuturo</option>
                  <option value="HABITAT">AFP Habitat</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">Tipo de Comisión AFP</label>
                <select
                  value={afpTipoComision}
                  onChange={(e) => setAfpTipoComision(e.target.value as 'FLUJO' | 'MIXTA')}
                  className="w-full h-6 px-2 border border-[#D1D5DB] bg-[#FFFFFF]"
                >
                  <option value="FLUJO">Comisión sobre Flujo (Remuneración)</option>
                  <option value="MIXTA">Comisión Mixta (Saldo / Flujo Reducido)</option>
                </select>
              </div>
            </>
          ) : (
            <div className="col-span-2 flex items-end pb-1 text-[11px] text-[#4B5563]">
              Aporte íntegro al fondo solidario ONP (13% sobre remuneración afecta).
            </div>
          )}

          {/* Cuenta bancaria y CUSPP */}
          <div>
            <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">CUSPP (Afiliados AFP)</label>
            <input
              type="text"
              value={cuspp}
              onChange={(e) => setCuspp(e.target.value)}
              disabled={sistemaPensiones === 'ONP'}
              placeholder="598411CQMEN0"
              className="w-full h-6 px-2 font-mono border border-[#D1D5DB] disabled:bg-[#F3F4F6]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">Banco Haberes / CTS</label>
            <select
              value={bancoSueldo}
              onChange={(e) => setBancoSueldo(e.target.value)}
              className="w-full h-6 px-2 border border-[#D1D5DB] bg-[#FFFFFF]"
            >
              <option value="BCP">BCP - Banco de Crédito</option>
              <option value="BBVA">BBVA Perú</option>
              <option value="INTERBANK">Interbank</option>
              <option value="SCOTIABANK">Scotiabank</option>
              <option value="BANBIF">BanBif</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">N° Cuenta / CCI Haberes</label>
            <input
              type="text"
              value={cuentaBancoSueldo}
              onChange={(e) => setCuentaBancoSueldo(e.target.value)}
              placeholder="191-98765432-0-12"
              className="w-full h-6 px-2 font-mono border border-[#D1D5DB]"
            />
          </div>

          <div className="col-span-3 flex items-center gap-6 pt-1 border-t border-[#E5E7EB]">
            <label className="flex items-center gap-1.5 text-[12px] cursor-pointer">
              <input
                type="checkbox"
                checked={tieneAsignacionFamiliar}
                onChange={(e) => setTieneAsignacionFamiliar(e.target.checked)}
              />
              <span>Percibe Asignación Familiar (Ley N° 25129 — 10% RMV = S/ {(rmvActual * 0.1).toFixed(2)})</span>
            </label>
            <label className="flex items-center gap-1.5 text-[12px] cursor-pointer">
              <input
                type="checkbox"
                checked={afiliadoEps}
                onChange={(e) => setAfiliadoEps(e.target.checked)}
              />
              <span>Afiliado a EPS (Bonif. Extraordinaria Gratificación 6.75% en lugar de 9%)</span>
            </label>
          </div>
        </div>
      </VentanaModal>

      {/* MODAL BAJA / CESE DE TRABAJADOR */}
      <VentanaModal
        abierto={modalBajaAbierto}
        onCerrar={() => setModalBajaAbierto(false)}
        titulo="Registro de Baja / Cese en T-Registro"
        ancho="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setModalBajaAbierto(false)}
              className="h-6 px-3 text-[12px] border border-[#D1D5DB] bg-[#FFFFFF]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmarBaja}
              className="h-6 px-3 text-[12px] border border-[#991B1B] bg-[#991B1B] text-[#FFFFFF] font-bold"
            >
              Confirmar Baja
            </button>
          </>
        }
      >
        {trabajadorBaja && (
          <div className="space-y-3 text-[12px]">
            <div className="p-2 bg-[#FEF2F2] border border-[#FCA5A5] text-[#991B1B]">
              <strong>Trabajador:</strong> {trabajadorBaja.apellidos}, {trabajadorBaja.nombres} (Doc: {trabajadorBaja.numeroDocumento})
              <span className="block text-[11px] mt-0.5">
                Si la fecha de cese ocurre a mitad de mes, la Planilla Mensual calculará automáticamente los días efectivamente laborados y podrá emitir su Liquidación de Beneficios Sociales (Vacaciones, CTS y Gratificación truncas).
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">Fecha de CeseEfectivo</label>
                <input
                  type="date"
                  value={fechaCese}
                  onChange={(e) => setFechaCese(e.target.value)}
                  className="w-full h-6 px-2 font-mono border border-[#D1D5DB]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">Motivo de Baja (Tabla 17 PLAME)</label>
                <select
                  value={motivoCese}
                  onChange={(e) => setMotivoCese(e.target.value)}
                  className="w-full h-6 px-2 border border-[#D1D5DB] bg-[#FFFFFF]"
                >
                  <option value="RENUNCIA VOLUNTARIA">01 - Renuncia Voluntaria</option>
                  <option value="TERMINO DE CONTRATO">07 - Término de Contrato / Vencimiento</option>
                  <option value="MUTUO DISENSO">04 - Mutuo Disenso</option>
                  <option value="DESPIDO CAUSADO">06 - Despido por Causa Justa</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </VentanaModal>

      {/* MODAL PARÁMETROS LABORALES EDITABLES CON VIGENCIA (TAREA 6) */}
      <VentanaModal
        abierto={modalParametrosAbierto}
        onCerrar={() => setModalParametrosAbierto(false)}
        titulo="Parámetros Laborales y Previsionales Editables con Vigencia (RMV, UIT, Tasas AFP/ONP/EsSalud)"
        ancho="xl"
        footer={
          <button
            type="button"
            onClick={() => setModalParametrosAbierto(false)}
            className="h-6 px-3 text-[12px] border border-[#D1D5DB] bg-[#FFFFFF]"
          >
            Cerrar
          </button>
        }
      >
        <div className="space-y-3 text-[12px]">
          <div className="p-2.5 bg-[#F8FAFC] border border-[#D1D5DB] grid grid-cols-6 gap-2 items-end">
            <div>
              <label className="block text-[10px] font-bold text-[#374151]">Código Parámetro</label>
              <select
                value={paramCodigo}
                onChange={(e) => {
                  const code = e.target.value;
                  setParamCodigo(code);
                  const existente = parametrosLaborales.find((p: any) => p.codigoParametro === code);
                  if (existente) {
                    setParamDesc(existente.descripcion);
                    setParamValor(String(existente.valorNumerico));
                    setParamTipo(existente.tipoDato || 'MONEDA');
                    setParamDesde(existente.vigenteDesde || '2026-01-01');
                  }
                }}
                className="w-full h-6 px-1.5 font-mono text-[11px] border border-[#D1D5DB] bg-[#FFFFFF]"
              >
                {CODIGOS_PARAMETROS_LABORALES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-bold text-[#374151]">Descripción Oficial / Base Legal</label>
              <input
                type="text"
                value={paramDesc}
                onChange={(e) => setParamDesc(e.target.value)}
                className="w-full h-6 px-2 text-[11px] border border-[#D1D5DB]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#374151]">Valor Numérico</label>
              <input
                type="number"
                step="0.0001"
                value={paramValor}
                onChange={(e) => setParamValor(e.target.value)}
                className="w-full h-6 px-2 font-mono text-[11px] border border-[#D1D5DB]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#374151]">Vigente Desde</label>
              <input
                type="date"
                value={paramDesde}
                onChange={(e) => setParamDesde(e.target.value)}
                className="w-full h-6 px-1.5 font-mono text-[11px] border border-[#D1D5DB]"
              />
            </div>
            <div>
              <button
                type="button"
                onClick={guardarParametro}
                disabled={guardarParametroMutation.isPending}
                className="w-full h-6 px-2 bg-[#1D4ED8] text-[#FFFFFF] font-bold text-[11px] hover:bg-[#1E40AF]"
              >
                Guardar Vigencia
              </button>
            </div>
          </div>

          <div className="max-h-72 overflow-auto border border-[#D1D5DB]">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead className="bg-[#E8ECF1] text-[#111827] border-b border-[#D1D5DB] sticky top-0">
                <tr>
                  <th className="py-1 px-2 border-r border-[#D1D5DB]">Código</th>
                  <th className="py-1 px-2 border-r border-[#D1D5DB]">Descripción</th>
                  <th className="py-1 px-2 border-r border-[#D1D5DB] text-right">Valor</th>
                  <th className="py-1 px-2 border-r border-[#D1D5DB] text-center">Tipo</th>
                  <th className="py-1 px-2 border-r border-[#D1D5DB] text-center">Vigente Desde</th>
                  <th className="py-1 px-2 text-center">Vigente Hasta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {parametrosLaborales.map((p: any, idx: number) => (
                  <tr
                    key={`${p.codigoParametro}-${p.vigenteDesde}-${idx}`}
                    className="hover:bg-[#F3F4F6] cursor-pointer"
                    onClick={() => {
                      setParamCodigo(p.codigoParametro);
                      setParamDesc(p.descripcion);
                      setParamValor(String(p.valorNumerico));
                      setParamTipo(p.tipoDato || 'DECIMAL');
                      setParamDesde(p.vigenteDesde || '2026-01-01');
                      setParamHasta(p.vigenteHasta || '');
                    }}
                  >
                    <td className="py-1 px-2 font-mono font-bold text-[#1E3A5F] border-r border-[#E5E7EB]">
                      {p.codigoParametro}
                    </td>
                    <td className="py-1 px-2 border-r border-[#E5E7EB]">{p.descripcion}</td>
                    <td className="py-1 px-2 font-mono font-bold text-right border-r border-[#E5E7EB]">
                      {p.tipoDato === 'PORCENTAJE'
                        ? `${(Number(p.valorNumerico) * 100).toFixed(2)}% (${p.valorNumerico})`
                        : Number(p.valorNumerico).toFixed(2)}
                    </td>
                    <td className="py-1 px-2 text-center font-mono text-[10px] border-r border-[#E5E7EB]">
                      {p.tipoDato}
                    </td>
                    <td className="py-1 px-2 text-center font-mono border-r border-[#E5E7EB]">{p.vigenteDesde}</td>
                    <td className="py-1 px-2 text-center font-mono">{p.vigenteHasta || 'VIGENTE'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </VentanaModal>
    </div>
  );
};
