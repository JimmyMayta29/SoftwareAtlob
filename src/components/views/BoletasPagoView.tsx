import React, { useState, useEffect } from 'react';
import { Printer, FileText, Calculator, Eye } from 'lucide-react';
import { useEmpresaPeriodo } from '../../context/EmpresaPeriodoContext';
import { useToast } from '../../context/ToastContext';
import {
  useTrabajadores,
  usePlanillas,
  useCalcularPlanilla
} from '../../hooks/useTesoreriaPlanilla';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { VentanaModal } from '../ui/VentanaModal';
import {
  exportarBoletaPagoEstandarPdf,
  exportarLoteBoletasPagoEstandarPdf,
  BoletaPagoPdfItem
} from '../../services/reports/formato_estandar/formatoEstandarEngine';

export const BoletasPagoView: React.FC = () => {
  const { empresaActiva, periodo: ctxPeriodo } = useEmpresaPeriodo();
  const empresaId = empresaActiva?.id || '00000000-0000-0000-0000-000000000001';
  const [mes, setMes] = useState(ctxPeriodo || '2026-09');
  const { success, error } = useToast();

  const { data: trabajadores = [] } = useTrabajadores(empresaId);
  const { data: planillas = [] } = usePlanillas(empresaId, mes);
  const calcularMutation = useCalcularPlanilla(empresaId);

  const [planilla, setPlanilla] = useState<any | null>(null);
  const [boletaPreview, setBoletaPreview] = useState<BoletaPagoPdfItem | null>(null);

  useEffect(() => {
    if (planillas && planillas.length > 0 && planillas[0]) {
      setPlanilla(planillas[0]);
    }
  }, [planillas]);

  const handleGenerarPlanillaSiFalta = async () => {
    try {
      const p = await calcularMutation.mutateAsync({
        periodoId: `per-${mes}`,
        mes
      });
      setPlanilla(p);
      success(`Boletas de pago generadas para el período ${mes}.`, 'Boletas Listas');
    } catch (err: any) {
      error(err?.response?.data?.error || err.message || 'Error al generar boletas', 'Error');
    }
  };

  const construirBoleta = (l: any): BoletaPagoPdfItem => {
    const trab = trabajadores.find((t: any) => t.id === l.trabajadorId);
    return {
      trabajadorNombre: l.trabajadorNombre,
      trabajadorDocumento: l.trabajadorDocumento,
      cargo: trab?.cargo || 'COLABORADOR',
      regimenLaboral: trab?.regimenLaboral || 'GENERAL',
      fechaIngreso: trab?.fechaIngreso || '2024-01-01',
      cuspp: trab?.cuspp,
      sistemaPensiones: l.sistemaPensiones,
      afpAdministradora: trab?.afpAdministradora,
      afpTipoComision: trab?.afpTipoComision,
      centroCosto: trab?.centroCosto || 'ADMINISTRACION',
      bancoSueldo: trab?.bancoSueldo,
      cuentaBancoSueldo: trab?.cuentaBancoSueldo,
      diasTrabajados: l.diasTrabajados || 30,
      diasFaltas: l.diasFaltas || 0,
      horasOrdinarias: l.horasOrdinarias || 240,
      horasExtras25: l.horasExtras25 || 0,
      horasExtras35: l.horasExtras35 || 0,
      sueldoBasico: l.sueldoBasico || 0,
      asignacionFamiliar: l.asignacionFamiliar || 0,
      montoHorasExtras25: l.montoHorasExtras25 || 0,
      montoHorasExtras35: l.montoHorasExtras35 || 0,
      bonificacionesGravadas: l.bonificacionesGravadas || 0,
      conceptosNoGravados: l.conceptosNoGravados || 0,
      totalRemuneracion: l.totalRemuneracion || 0,
      aporteObligatorioPension: l.aporteObligatorioPension || 0,
      comisionAfp: l.comisionAfp || 0,
      primaSeguroAfp: l.primaSeguroAfp || 0,
      retencionQuintaCategoria: l.retencionQuintaCategoria || 0,
      descuentoFaltasTardanzas: l.descuentoFaltasTardanzas || 0,
      adelantosPrestamos: l.adelantosPrestamos || 0,
      totalDescuentos: l.totalDescuentos || 0,
      aporteEssalud: l.aporteEssalud || 0,
      netoPagar: l.netoPagar || 0
    };
  };

  const lineas = planilla?.lineas || [];

  const columnas: ColumnaTablaDensa<any>[] = [
    {
      key: 'doc',
      header: 'DNI / C.E.',
      width: '90px',
      render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.trabajadorDocumento}</span>
    },
    {
      key: 'nombre',
      header: 'Trabajador',
      render: (r) => <span className="font-bold text-[#111827]">{r.trabajadorNombre}</span>
    },
    {
      key: 'dias',
      header: 'Días / Horas',
      width: '95px',
      align: 'center',
      render: (r) => <span className="font-mono text-[11px]">{r.diasTrabajados}d / {r.horasOrdinarias}h</span>
    },
    {
      key: 'ingresos',
      header: 'Total Ingresos S/',
      width: '120px',
      align: 'right',
      render: (r) => <span className="font-mono font-bold">{Number(r.totalRemuneracion || 0).toFixed(2)}</span>
    },
    {
      key: 'descuentos',
      header: 'Total Descuentos S/',
      width: '130px',
      align: 'right',
      render: (r) => <span className="font-mono text-[#B91C1C]">- {Number(r.totalDescuentos || 0).toFixed(2)}</span>
    },
    {
      key: 'essalud',
      header: 'EsSalud Emp. S/',
      width: '115px',
      align: 'right',
      render: (r) => <span className="font-mono text-[#B45309]">{Number(r.aporteEssalud || 0).toFixed(2)}</span>
    },
    {
      key: 'neto',
      header: 'Neto a Pagar S/',
      width: '120px',
      align: 'right',
      render: (r) => <span className="font-mono font-bold text-[#1E6F42]">{Number(r.netoPagar || 0).toFixed(2)}</span>
    },
    {
      key: 'acciones',
      header: 'Boleta de Pago (D.S. 009-2011-TR)',
      width: '190px',
      align: 'center',
      render: (r) => (
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => setBoletaPreview(construirBoleta(r))}
            className="h-5 px-2 text-[10px] border border-[#D1D5DB] bg-[#FFFFFF] hover:bg-[#F3F4F6] inline-flex items-center gap-1"
          >
            <Eye className="w-3 h-3 text-[#1D4ED8]" />
            Vista Previa
          </button>
          <button
            type="button"
            onClick={() => {
              exportarBoletaPagoEstandarPdf({
                empresa: {
                  ruc: empresaActiva?.ruc || '20601234567',
                  razonSocial: empresaActiva?.razonSocial || 'ATLOB CONSULTORES S.A.C.'
                },
                periodo: mes,
                boleta: construirBoleta(r)
              });
              success(`Boleta PDF de ${r.trabajadorNombre} descargada.`, 'Boleta PDF');
            }}
            className="h-5 px-2 text-[10px] bg-[#1E3A5F] text-[#FFFFFF] hover:bg-[#162C49] inline-flex items-center gap-1 font-bold"
          >
            <FileText className="w-3 h-3" />
            PDF Estándar
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Emisión de Boletas de Pago de Remuneraciones (D.S. N° 009-2011-TR)"
        subtitulo="Generación individual y masiva de Boletas de Pago en PDF con el Formato estándar Atlob (codificación oficial PLAME)"
        derecha={
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold text-[#374151]">Período:</label>
            <input
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="h-6 px-2 font-mono text-[12px] border border-[#D1D5DB]"
            />
          </div>
        }
        acciones={[
          {
            id: 'procesar-boletas',
            label: 'Actualizar desde Planilla del Mes',
            icono: Calculator,
            onClick: handleGenerarPlanillaSiFalta
          },
          {
            id: 'imprimir-todas',
            label: 'Descargar Lote Completo PDF',
            icono: Printer,
            primario: true,
            disabled: lineas.length === 0,
            onClick: () => {
              exportarLoteBoletasPagoEstandarPdf({
                empresa: {
                  ruc: empresaActiva?.ruc || '20601234567',
                  razonSocial: empresaActiva?.razonSocial || 'ATLOB CONSULTORES S.A.C.'
                },
                periodo: mes,
                boletas: lineas.map(construirBoleta)
              });
              success('Archivo PDF con todas las boletas del período descargado.', 'Impresión Masiva');
            }
          }
        ]}
      />

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        {lineas.length === 0 ? (
          <div className="p-8 text-center border border-[#D1D5DB] bg-[#F8FAFC] text-[12px] text-[#4B5563]">
            No hay boletas procesadas para el período <strong>{mes}</strong>. Pulse{' '}
            <strong>"Actualizar desde Planilla del Mes"</strong> para generar las boletas de pago de los trabajadores activos.
          </div>
        ) : (
          <TablaDensa columnas={columnas} datos={lineas} rowKey={(r) => r.id} />
        )}
      </div>

      {/* MODAL DE VISTA PREVIA DE BOLETA EN PANTALLA */}
      <VentanaModal
        abierto={Boolean(boletaPreview)}
        onCerrar={() => setBoletaPreview(null)}
        titulo="Vista Previa — Boleta de Pago (Formato estándar Atlob)"
        ancho="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setBoletaPreview(null)}
              className="h-6 px-3 text-[12px] border border-[#D1D5DB] bg-[#FFFFFF]"
            >
              Cerrar
            </button>
            {boletaPreview && (
              <button
                type="button"
                onClick={() => {
                  exportarBoletaPagoEstandarPdf({
                    empresa: {
                      ruc: empresaActiva?.ruc || '20601234567',
                      razonSocial: empresaActiva?.razonSocial || 'ATLOB CONSULTORES S.A.C.'
                    },
                    periodo: mes,
                    boleta: boletaPreview
                  });
                }}
                className="h-6 px-3 text-[12px] bg-[#1D4ED8] text-[#FFFFFF] font-bold inline-flex items-center gap-1"
              >
                <FileText className="w-3.5 h-3.5" />
                Descargar PDF
              </button>
            )}
          </>
        }
      >
        {boletaPreview && (
          <div className="p-3 border border-[#111827] bg-[#FFFFFF] text-[11px] font-mono space-y-2">
            <div className="flex justify-between border-b border-[#111827] pb-2">
              <div>
                <div className="font-bold text-[12px]">{empresaActiva?.razonSocial || 'ATLOB CONSULTORES S.A.C.'}</div>
                <div>R.U.C.: {empresaActiva?.ruc || '20601234567'}</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-[13px]">BOLETA DE PAGO DE REMUNERACIONES</div>
                <div>PERÍODO: {mes} — D.S. N° 009-2011-TR</div>
              </div>
              <div className="text-right">
                <div>Formato estándar Atlob</div>
                <div>C. COSTO: {boletaPreview.centroCosto}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1 py-1 border-b border-[#D1D5DB]">
              <div><strong>TRABAJADOR:</strong> {boletaPreview.trabajadorNombre}</div>
              <div><strong>DOC. IDENTIDAD:</strong> {boletaPreview.trabajadorDocumento}</div>
              <div><strong>CARGO:</strong> {boletaPreview.cargo}</div>
              <div><strong>SIST. PENSIÓN:</strong> {boletaPreview.sistemaPensiones} {boletaPreview.afpAdministradora || ''}</div>
              <div><strong>DÍAS LAB.:</strong> {boletaPreview.diasTrabajados} días ({boletaPreview.horasOrdinarias} hrs)</div>
              <div><strong>RÉGIMEN:</strong> {boletaPreview.regimenLaboral}</div>
            </div>

            <table className="w-full border border-[#111827] border-collapse text-[11px]">
              <thead className="bg-[#E8ECF1] border-b border-[#111827]">
                <tr>
                  <th className="p-1 text-left">CÓD.</th>
                  <th className="p-1 text-left">CONCEPTO PLAME</th>
                  <th className="p-1 text-right">INGRESOS S/</th>
                  <th className="p-1 text-right">DESCUENTOS S/</th>
                  <th className="p-1 text-right">APORTES EMP. S/</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-1">0121</td>
                  <td className="p-1">REMUNERACIÓN O JORNAL BÁSICO</td>
                  <td className="p-1 text-right">{boletaPreview.sueldoBasico.toFixed(2)}</td>
                  <td className="p-1 text-right"></td>
                  <td className="p-1 text-right"></td>
                </tr>
                {boletaPreview.asignacionFamiliar > 0 && (
                  <tr>
                    <td className="p-1">0201</td>
                    <td className="p-1">ASIGNACIÓN FAMILIAR (10% RMV)</td>
                    <td className="p-1 text-right">{boletaPreview.asignacionFamiliar.toFixed(2)}</td>
                    <td className="p-1 text-right"></td>
                    <td className="p-1 text-right"></td>
                  </tr>
                )}
                {boletaPreview.aporteObligatorioPension > 0 && (
                  <tr>
                    <td className="p-1">{boletaPreview.sistemaPensiones === 'ONP' ? '0607' : '0608'}</td>
                    <td className="p-1">APORTE OBLIGATORIO SISTEMA DE PENSIONES ({boletaPreview.sistemaPensiones})</td>
                    <td className="p-1 text-right"></td>
                    <td className="p-1 text-right">{boletaPreview.aporteObligatorioPension.toFixed(2)}</td>
                    <td className="p-1 text-right"></td>
                  </tr>
                )}
                {boletaPreview.comisionAfp > 0 && (
                  <tr>
                    <td className="p-1">0601</td>
                    <td className="p-1">COMISIÓN PORCENTUAL AFP</td>
                    <td className="p-1 text-right"></td>
                    <td className="p-1 text-right">{boletaPreview.comisionAfp.toFixed(2)}</td>
                    <td className="p-1 text-right"></td>
                  </tr>
                )}
                {boletaPreview.primaSeguroAfp > 0 && (
                  <tr>
                    <td className="p-1">0606</td>
                    <td className="p-1">PRIMA DE SEGURO AFP</td>
                    <td className="p-1 text-right"></td>
                    <td className="p-1 text-right">{boletaPreview.primaSeguroAfp.toFixed(2)}</td>
                    <td className="p-1 text-right"></td>
                  </tr>
                )}
                {boletaPreview.retencionQuintaCategoria > 0 && (
                  <tr>
                    <td className="p-1">0605</td>
                    <td className="p-1">RENTA DE QUINTA CATEGORÍA RETENCIONES</td>
                    <td className="p-1 text-right"></td>
                    <td className="p-1 text-right">{boletaPreview.retencionQuintaCategoria.toFixed(2)}</td>
                    <td className="p-1 text-right"></td>
                  </tr>
                )}
                <tr>
                  <td className="p-1">0804</td>
                  <td className="p-1">ESSALUD SEGURO REGULAR TRABAJADOR (9%)</td>
                  <td className="p-1 text-right"></td>
                  <td className="p-1 text-right"></td>
                  <td className="p-1 text-right">{boletaPreview.aporteEssalud.toFixed(2)}</td>
                </tr>
              </tbody>
              <tfoot className="bg-[#F3F4F6] font-bold border-t border-[#111827]">
                <tr>
                  <td colSpan={2} className="p-1">TOTALES S/</td>
                  <td className="p-1 text-right">{boletaPreview.totalRemuneracion.toFixed(2)}</td>
                  <td className="p-1 text-right">{boletaPreview.totalDescuentos.toFixed(2)}</td>
                  <td className="p-1 text-right">{boletaPreview.aporteEssalud.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>

            <div className="p-1.5 bg-[#E8ECF1] border border-[#111827] flex justify-between font-bold text-[12px]">
              <span>NETO A PAGAR AL TRABAJADOR:</span>
              <span>S/ {boletaPreview.netoPagar.toFixed(2)}</span>
            </div>
          </div>
        )}
      </VentanaModal>
    </div>
  );
};
