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

export const conciliacionV2Routes = router;
