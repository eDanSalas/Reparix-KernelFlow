import { HttpError, validateInternalUserId } from '../validation.js';
import { changeUserRole, listInternalAccounts, readRoleChanges } from '../models/role-management-model.js';

export function roleManagementController(pool) {
  return {
    list: async (_req, res) => {
      res.json({ accounts: await listInternalAccounts(pool) });
    },
    history: async (req, res) => {
      res.json(await readRoleChanges(pool, validateInternalUserId(req.params.userId)));
    },
    change: async (req, res) => {
      const userId = validateInternalUserId(req.params.userId);
      const role = req.body?.role;
      if (!['recepcion', 'tecnico', 'administrador'].includes(role) || Object.keys(req.body).length !== 1) {
        throw new HttpError(422, 'Selecciona un rol válido para la cuenta interna.');
      }
      const change = await changeUserRole(pool, userId, role, req.user.id);
      res.status(201).json({ change });
    },
  };
}
