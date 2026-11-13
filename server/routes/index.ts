import { Router } from 'express';
import { empresaRoutes } from './empresaRoutes';
import { parametroRoutes } from './parametroRoutes';
import { migrationRoutes } from './migrationRoutes';
import { asientoRoutes } from './asientoRoutes';
import { operacionesRoutes } from './operacionesRoutes';
import { tesoreriaPlanillaRoutes } from './tesoreriaPlanillaRoutes';
import { sireRoutes } from './sireRoutes';
import { pleRoutes } from './pleRoutes';
import { tributarioAnualRoutes } from './tributarioAnualRoutes';
import { activosKardexRoutes } from './activosKardexRoutes';
import { sistemaAuditRoutes } from './sistemaAuditRoutes';
import { liquidacionIgvRoutes } from './liquidacionIgvRoutes';
import { prorrataIgvRoutes } from './prorrataIgvRoutes';
import { djRentaAnualRoutes } from './djRentaAnualRoutes';
import { daotRoutes } from './daotRoutes';
import { cronogramaVencimientosRoutes } from './cronogramaVencimientosRoutes';
import { authRoutes } from './authRoutes';
import { setupRoutes } from './setupRoutes';
import { usuariosRoutes } from './usuariosRoutes';
import { importacionRoutes } from './importacionRoutes';
import { backupEmpresaRoutes } from './backupEmpresaRoutes';
import { consolidacionRoutes } from './consolidacionRoutes';
import { pcgeRoutes } from './pcgeRoutes';
import { subdiarioRoutes } from './subdiarioRoutes';
import { tipoCambioRoutes } from './tipoCambioRoutes';
import { analisisCuentaRoutes } from './analisisCuentaRoutes';
import { requireAuth, requireEmpresaMembership } from '../middlewares/auth';
import { empresaGuard } from '../middlewares/empresaGuard';
import { db } from '../config/database';
import {
  MODULOS_SOLO_MEMORIA,
  esPeticionEscrituraBloqueableMemoria,
  estaBloqueoMemoriaActivo,
  obtenerEstadoPersistencia
} from '../config/persistencia';

const router = Router();

router.get('/health', (req, res) => {
  const isPostgres = db.isPostgresConnected();
  const disponible = isPostgres || (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test');
  res.status(disponible ? 200 : 503).json({
    status: disponible ? 'UP' : 'DOWN',
    database: isPostgres ? 'POSTGRESQL_CONNECTED' : (disponible ? 'IN_MEMORY_FALLBACK' : 'UNAVAILABLE'),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '0.0.0',
    persistenciaCompleta: MODULOS_SOLO_MEMORIA.length === 0,
    timestamp: new Date().toISOString()
  });
});

// Guard de acceso por empresa para rutas /e/:empresaId/...
router.get('/e/:empresaId/verificar-acceso', requireAuth, empresaGuard(), (req, res) => {
  res.json({
    permitida: true,
    empresaId: req.empresaId,
    rolEnEmpresa: req.userRolEnEmpresa,
    usuarioId: req.user?.id
  });
});

router.use('/auth', authRoutes);
router.use('/setup', setupRoutes);
router.use(requireAuth);
router.get('/sistema/persistencia', (_req, res) => {
  res.json(obtenerEstadoPersistencia());
});
router.use((req, res, next) => {
  if (!estaBloqueoMemoriaActivo()) {
    return next();
  }
  const modulo = esPeticionEscrituraBloqueableMemoria(req.method, req.path);
  if (!modulo) {
    return next();
  }
  return res.status(503).json({
    success: false,
    codigo: 'MODULO_SIN_PERSISTENCIA',
    modulo: modulo.id,
    error: `El módulo '${modulo.nombreVisible}' opera temporalmente en memoria y las escrituras están bloqueadas en producción (ATLOB_BLOQUEAR_MEMORIA=1).`
  });
});
router.use('/', usuariosRoutes);
router.use('/empresas/:empresaId', requireEmpresaMembership());
router.use('/empresas/:empresaId/plan-cuentas', pcgeRoutes);
router.use('/empresas/:empresaId/subdiarios', subdiarioRoutes);
router.use('/empresas/:empresaId/analisis-cuentas', analisisCuentaRoutes);
router.use('/importacion', importacionRoutes);
router.use('/tipo-cambio', tipoCambioRoutes);
router.use('/', backupEmpresaRoutes);
router.use('/empresas', empresaRoutes);
router.use('/parametros', parametroRoutes);
router.use('/tributos/pdt621', liquidacionIgvRoutes);
router.use('/tributos/prorrata-igv', prorrataIgvRoutes);
router.use('/tributos/renta-anual', djRentaAnualRoutes);
router.use('/tributos/daot', daotRoutes);
router.use('/tributos/cronograma', cronogramaVencimientosRoutes);
router.use('/migration', migrationRoutes);
router.use('/', consolidacionRoutes);
router.use('/', asientoRoutes);
router.use('/', operacionesRoutes);
router.use('/', tesoreriaPlanillaRoutes);
router.use('/', sireRoutes);
router.use('/', pleRoutes);
router.use('/', tributarioAnualRoutes);
router.use('/', activosKardexRoutes);
router.use('/', sistemaAuditRoutes);

export const apiRoutes = router;
