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

export const conciliacionV2Routes = router;
