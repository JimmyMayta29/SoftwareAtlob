import { Router } from 'express';
import { conciliacionV2Controller } from '../controllers/conciliacionV2Controller';
import { requireEmpresaMembership, ROLES_LECTURA } from '../middlewares/auth';

const router = Router({ mergeParams: true });

router.get('/config', requireEmpresaMembership(ROLES_LECTURA), conciliacionV2Controller.obtenerConfig);
router.put('/config', requireEmpresaMembership(['ADMINISTRADOR']), conciliacionV2Controller.actualizarConfig);

router.get('/cuentas', requireEmpresaMembership(ROLES_LECTURA), conciliacionV2Controller.listarCuentas);
router.get(
  '/cuentas-contables-disponibles',
  requireEmpresaMembership(ROLES_LECTURA),
  conciliacionV2Controller.listarCuentasContablesDisponibles
);
router.put(
  '/cuentas/:cuentaId/vincular-contable',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR']),
  conciliacionV2Controller.vincularCuentaContable
);

router.get('/resumen', requireEmpresaMembership(ROLES_LECTURA), conciliacionV2Controller.obtenerResumen);

router.post(
  '/partidas/conciliar',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR', 'ASISTENTE_CONTABLE']),
  conciliacionV2Controller.conciliarPartida
);
router.post(
  '/partidas/desconciliar',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR', 'ASISTENTE_CONTABLE']),
  conciliacionV2Controller.desconciliarPartida
);

router.post(
  '/cerrar',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR']),
  conciliacionV2Controller.cerrarConciliacion
);
router.post(
  '/reabrir',
  requireEmpresaMembership(['ADMINISTRADOR']),
  conciliacionV2Controller.reabrirConciliacion
);

// Perfiles de banco (Fase 2)
router.get('/perfiles', requireEmpresaMembership(ROLES_LECTURA), conciliacionV2Controller.listarPerfiles);
router.post(
  '/perfiles',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR']),
  conciliacionV2Controller.crearPerfil
);
router.put(
  '/perfiles/:perfilId',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR']),
  conciliacionV2Controller.actualizarPerfil
);
router.delete(
  '/perfiles/:perfilId',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR']),
  conciliacionV2Controller.eliminarPerfil
);

// Reglas de clasificación de glosas bancarias (Fase 2)
router.get(
  '/reglas-clasificacion',
  requireEmpresaMembership(ROLES_LECTURA),
  conciliacionV2Controller.listarReglasClasificacion
);
router.post(
  '/reglas-clasificacion',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR']),
  conciliacionV2Controller.crearReglaClasificacion
);
router.put(
  '/reglas-clasificacion/:reglaId',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR']),
  conciliacionV2Controller.actualizarReglaClasificacion
);
router.delete(
  '/reglas-clasificacion/:reglaId',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR']),
  conciliacionV2Controller.eliminarReglaClasificacion
);

// Importación de extractos bancarios (Fase 2)
router.get(
  '/importaciones/plantilla-csv',
  requireEmpresaMembership(ROLES_LECTURA),
  conciliacionV2Controller.descargarPlantillaCsv
);
router.get('/importaciones', requireEmpresaMembership(ROLES_LECTURA), conciliacionV2Controller.listarImportaciones);
router.post(
  '/importaciones/previsualizar',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR', 'ASISTENTE_CONTABLE']),
  conciliacionV2Controller.previsualizarImportacion
);
router.post(
  '/importaciones/confirmar',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR', 'ASISTENTE_CONTABLE']),
  conciliacionV2Controller.confirmarImportacion
);
router.post(
  '/importaciones/:importId/revertir',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR']),
  conciliacionV2Controller.revertirImportacion
);

// Motor de matching, grupos y trazabilidad (Fase 3)
router.post(
  '/matching/ejecutar',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR', 'ASISTENTE_CONTABLE']),
  conciliacionV2Controller.ejecutarMatching
);
router.get(
  '/matching/grupos',
  requireEmpresaMembership(ROLES_LECTURA),
  conciliacionV2Controller.listarGruposMatching
);
router.post(
  '/matching/sugerencias/aceptar',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR', 'ASISTENTE_CONTABLE']),
  conciliacionV2Controller.aceptarSugerencias
);
router.post(
  '/matching/sugerencias/:grupoId/rechazar',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR', 'ASISTENTE_CONTABLE']),
  conciliacionV2Controller.rechazarSugerencia
);
router.post(
  '/matching/manual',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR', 'ASISTENTE_CONTABLE']),
  conciliacionV2Controller.conciliarManualGrupo
);
router.post(
  '/matching/grupos/:grupoId/desconciliar',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR', 'ASISTENTE_CONTABLE']),
  conciliacionV2Controller.desconciliarGrupo
);
router.get(
  '/matching/historial-desconciliacion',
  requireEmpresaMembership(ROLES_LECTURA),
  conciliacionV2Controller.listarHistorialDesconciliacion
);

// Reglas aprendidas de conciliación (Fase 3)
router.get(
  '/reglas-aprendidas',
  requireEmpresaMembership(ROLES_LECTURA),
  conciliacionV2Controller.listarReglasAprendidas
);
router.post(
  '/reglas-aprendidas',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR']),
  conciliacionV2Controller.crearReglaAprendida
);
router.put(
  '/reglas-aprendidas/:reglaId',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR']),
  conciliacionV2Controller.actualizarReglaAprendida
);
router.delete(
  '/reglas-aprendidas/:reglaId',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR']),
  conciliacionV2Controller.eliminarReglaAprendida
);

// Cartera CxC/CxP y operaciones peruanas (Fase 4)
router.get(
  '/cartera/sugerencias/:extractoLineaId',
  requireEmpresaMembership(ROLES_LECTURA),
  conciliacionV2Controller.sugerirDocumentosCartera
);
router.post(
  '/cartera/aplicar',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR', 'ASISTENTE_CONTABLE']),
  conciliacionV2Controller.aplicarLineaCartera
);

// Plantillas y generación de asientos desde extracto (Fase 4)
router.get(
  '/plantillas-asiento',
  requireEmpresaMembership(ROLES_LECTURA),
  conciliacionV2Controller.listarPlantillasAsiento
);
router.post(
  '/plantillas-asiento',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR']),
  conciliacionV2Controller.crearPlantillaAsiento
);
router.put(
  '/plantillas-asiento/:plantillaId',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR']),
  conciliacionV2Controller.actualizarPlantillaAsiento
);
router.delete(
  '/plantillas-asiento/:plantillaId',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR']),
  conciliacionV2Controller.eliminarPlantillaAsiento
);
router.post(
  '/asientos/previsualizar',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR', 'ASISTENTE_CONTABLE']),
  conciliacionV2Controller.previsualizarAsientoLinea
);
router.post(
  '/asientos/generar',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR', 'ASISTENTE_CONTABLE']),
  conciliacionV2Controller.generarAsientoLinea
);

// Cheques bancarios y alertas de control tributario (Fase 4)
router.get(
  '/cheques',
  requireEmpresaMembership(ROLES_LECTURA),
  conciliacionV2Controller.listarCheques
);
router.post(
  '/cheques',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR', 'ASISTENTE_CONTABLE']),
  conciliacionV2Controller.registrarCheque
);
router.put(
  '/cheques/:chequeId/estado',
  requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR', 'ASISTENTE_CONTABLE']),
  conciliacionV2Controller.actualizarEstadoCheque
);
router.get(
  '/alertas-control',
  requireEmpresaMembership(ROLES_LECTURA),
  conciliacionV2Controller.obtenerAlertasControl
);

// Reportes oficiales, historial de cierres y PLE 010200 (Fase 6)
router.get(
  '/cierres/historial',
  requireEmpresaMembership(ROLES_LECTURA),
  conciliacionV2Controller.listarHistorialCierres
);
router.get(
  '/reporte/oficial',
  requireEmpresaMembership(ROLES_LECTURA),
  conciliacionV2Controller.obtenerReporteOficial
);
router.get(
  '/ple-010200',
  requireEmpresaMembership(ROLES_LECTURA),
  conciliacionV2Controller.exportarPle010200
);

export const conciliacionV2Routes = router;
