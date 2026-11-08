import { Router } from 'express';
import { pcgeService } from '../services/pcgeService';

const router = Router({ mergeParams: true });

// GET /api/empresas/:empresaId/plan-cuentas
router.get('/', async (req, res) => {
  try {
    const { empresaId } = req.params;
    const mapa = await pcgeService.obtenerMapaCuentasEmpresa(empresaId);
    const cuentas = Array.from(mapa.values()).sort((a, b) => 
      a.codigo.localeCompare(b.codigo, undefined, { numeric: true })
    );

    const busqueda = (req.query.busqueda as string || '').toLowerCase().trim();
    const elemento = req.query.elemento as string;
    const incluirInactivas = req.query.incluirInactivas !== 'false';

    const filtradas = cuentas.filter(c => {
      if (!incluirInactivas && c.esInactiva) return false;
      if (elemento && elemento !== 'TODOS' && String(c.elemento) !== elemento) return false;
      if (busqueda && !c.codigo.toLowerCase().includes(busqueda) && !c.nombre.toLowerCase().includes(busqueda)) {
        return false;
      }
      return true;
    });

    res.json({
      ok: true,
      total: filtradas.length,
      cuentas: filtradas
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/empresas/:empresaId/plan-cuentas/completar
router.post('/completar', async (req, res) => {
  try {
    const { empresaId } = req.params;
    const resultado = await pcgeService.completarPlanDesdeCatalogoBase(empresaId);
    res.json({
      ok: true,
      mensaje: `Plan completado exitosamente: ${resultado.agregadas} cuentas agregadas desde el catálogo base oficial. Total en empresa: ${resultado.totalEmpresa}.`,
      resultado
    });
  } catch (error: any) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/empresas/:empresaId/plan-cuentas
router.post('/', async (req, res) => {
  try {
    const { empresaId } = req.params;
    const { codigo, nombre, esRegistro, naturalezaSaldo, clasificacionEeff } = req.body;
    const nueva = await pcgeService.crearSubcuenta(empresaId, {
      codigo,
      nombre,
      esRegistro,
      naturalezaSaldo,
      clasificacionEeff
    });
    res.status(201).json({
      ok: true,
      mensaje: `Subcuenta ${nueva.codigo} - ${nueva.nombre} creada exitosamente.`,
      cuenta: nueva
    });
  } catch (error: any) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// DELETE /api/empresas/:empresaId/plan-cuentas/:codigo
router.delete('/:codigo', async (req, res) => {
  try {
    const { empresaId, codigo } = req.params;
    const resultado = await pcgeService.eliminarCuenta(empresaId, codigo);
    res.json({
      ok: true,
      mensaje: `Cuenta ${codigo} eliminada correctamente.`,
      resultado
    });
  } catch (error: any) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// PATCH /api/empresas/:empresaId/plan-cuentas/:codigo/inactiva
router.patch('/:codigo/inactiva', async (req, res) => {
  try {
    const { empresaId, codigo } = req.params;
    const { inactiva = true } = req.body;
    await pcgeService.marcarInactiva(empresaId, codigo, !!inactiva);
    res.json({
      ok: true,
      mensaje: `Cuenta ${codigo} marcada como ${inactiva ? 'inactiva' : 'activa'}.`,
      codigo,
      inactiva: !!inactiva
    });
  } catch (error: any) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

export const pcgeRoutes = router;

