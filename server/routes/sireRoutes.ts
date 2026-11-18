import { Router } from 'express';
import { sireController } from '../controllers/sireController';
import { sireImportacionController } from '../controllers/sireImportacionController';

const router = Router();

// Submódulo Independiente: SIRE (Sistema Integrado de Registros Electrónicos)

// 0. Importación Asistida SIRE (Propuesta RCE Compras y RVIE Ventas desde ZIP)
router.post('/empresas/:id/sire/importar/analizar', sireImportacionController.analizar);
router.post('/empresas/:id/sire/importar/contabilizar', sireImportacionController.contabilizar);
router.get('/empresas/:id/sire/reglas-mapeo', sireImportacionController.obtenerReglas);
router.put('/empresas/:id/sire/reglas-mapeo', sireImportacionController.guardarReglas);

// 1. Conexión y credenciales SUNAT cifradas
router.put('/empresas/:id/sire/conexion', sireController.guardarConexion);
router.get('/empresas/:id/sire/conexion/estado', sireController.obtenerEstadoConexion);
router.post('/empresas/:id/sire/conexion/validar', sireController.validarConexion);

// 2. Descargas SIRE REST API y Tickets
router.post('/empresas/:id/sire/tickets/solicitar', sireController.solicitarTicket);
router.post('/empresas/:id/sire/tickets/consultar', sireController.consultarTicket);
router.post('/empresas/:id/sire/descargar', sireController.descargarPropuesta);
router.post('/empresas/:id/sire/propuestas/importar-manual', sireController.importarPropuestaManual);

// 3. Conciliación de registros (CAR oficial y tolerancias parametrizadas)
router.get('/empresas/:id/sire/conciliacion', sireController.obtenerConciliacion);
router.post('/empresas/:id/sire/conciliacion/aplicar', sireController.aplicarConciliacion);
router.post('/empresas/:id/sire/lineas/:lineaId/ajuste', sireController.generarAsientoAjuste);
router.post('/empresas/:id/sire/lineas/:lineaId/revertir', sireController.revertirAceptacionLinea);

// 4. Reglas de Contabilización Automática por Proveedor
router.post('/empresas/:id/sire/reglas-proveedor', sireController.guardarReglaProveedor);
router.get('/empresas/:id/sire/reglas-proveedor', sireController.listarReglasProveedor);

// 5. Cierre Oficial, Reemplazo y Ajustes Posteriores (RCE y RVIE)
router.post('/empresas/:id/sire/aceptar-oficial', sireController.aceptarPropuestaOficial);
router.post('/empresas/:id/sire/reemplazar-oficial', sireController.reemplazarPropuestaOficial);
router.post('/empresas/:id/sire/ajustes-posteriores', sireController.registrarAjustePosterior);

// 6. Validación de archivos planos de reemplazo y ajustes SIRE
router.post('/sire/validar-txt', sireController.validarTxtSire);

// 7. Historial de generaciones SIRE con hash SHA-256
router.get('/empresas/:id/sire/historial', sireController.listarHistorial);

export const sireRoutes = router;

