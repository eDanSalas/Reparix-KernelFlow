import { HttpError } from '../validation.js';

export function requireAdministrator(req, res, next) {
  if (req.user?.role !== 'administrador') {
    throw new HttpError(403, 'Solo administración puede gestionar las cuentas internas.');
  }
  next();
}
