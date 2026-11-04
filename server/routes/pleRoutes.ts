import { Router } from 'express';
import { pleController } from '../controllers/pleController';
import { requireEmpresaMembership } from '../middlewares/auth';

const router = Router();

// Submódulo Independiente: PLE (Programa de Libros Electrónicos 5.2)

// 1. Catálogo y prevalidación de libros PLE
router.get('/empresas/:id/ple/libros', pleController.listarLibros);
router.get('/empresas/:id/ple/prevalidar', pleController.prevalidar);

// 2. Exportación directa y en cola asíncrona
router.post('/empresas/:id/ple/exportar', pleController.exportar);
router.post('/empresas/:id/ple/exportar-job', pleController.exportarJob);
router.get('/sunat-jobs/:id', requireEmpresaMembership(), pleController.consultarJob);

// 3. Consulta de archivos generados
router.get('/empresas/:id/ple/exportaciones', pleController.listarExportaciones);
router.get('/ple-exportaciones/:id', requireEmpresaMembership(), pleController.obtenerExportacion);

// 4. Lector y validador de archivos TXT PLE informando errores por línea y columna
router.post('/ple/validar-txt', pleController.validarTxt);

// 5. Historial de generaciones PLE con hash SHA-256
router.get('/empresas/:id/ple/historial', pleController.listarHistorial);

export const pleRoutes = router;

