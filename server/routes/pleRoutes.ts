import { Router } from 'express';
import { pleController } from '../controllers/pleController';
import { requireEmpresaMembership } from '../middlewares/auth';
import { pleExportService } from '../services/pleExportService';
import { errorResponse } from '../utils/response';
import { sanitizarMensaje } from '../utils/seguridadDatos';

const router = Router();

// Submódulo Independiente: PLE (Programa de Libros Electrónicos 5.2)

// 0. Generación directa compatible (/api/sunat/ple/generar)
router.all('/sunat/ple/generar', async (req: any, res: any) => {
  try {
    const empresaId = req.empresaId || req.query.empresaId || (req.user?.empresas && req.user.empresas[0]?.empresaId);
    if (!empresaId) return errorResponse(res, 'EMPRESA_NO_ESPECIFICADA', 400);
    const periodo = (req.query.periodo as string) || (req.body.periodo as string) || '2026-03';
    const codigoLibro = (req.query.codigoLibro as string) || (req.body.codigoLibro as string) || '080100';
    const userId = req.user?.id || '00000000-0000-0000-0000-000000000001';

    const exp = await pleExportService.exportarLibro(
      empresaId as string,
      periodo,
      codigoLibro,
      '20601234567',
      userId,
      { sinMovimiento: false, esOficial: true }
    );

    return res.status(200).json({
      status: 'success',
      data: {
        contenidoTxt: exp.contenidoTxt,
        nombreArchivo: exp.nombreArchivo
      }
    });
  } catch (err: any) {
    return errorResponse(res, sanitizarMensaje(err));
  }
});

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

