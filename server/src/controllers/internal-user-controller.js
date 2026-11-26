import { HttpError, validateInternalUserId } from '../validation.js';
import { deactivateInternalUser, readDeactivations, registerInternalUser } from '../models/internal-user-model.js';

function validateRegistration(body) {
  const allowedFields = ['username', 'name', 'password', 'role'];
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(field => !allowedFields.includes(field))) {
    throw new HttpError(422, 'Revisa los datos de la cuenta interna.');
  }

  const { username, password, role } = body;
  const name = typeof body.name === 'string' ? body.name.trim().normalize('NFC') : '';
  const errors = {};
  if (typeof username !== 'string' || !/^[a-z0-9._-]{3,80}$/.test(username)) {
    errors.username = 'Usa de 3 a 80 caracteres entre letras minúsculas, números, punto, guion o guion bajo.';
  }
  if (!name || name.length > 120 || /[\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(name)) {
    errors.name = 'Captura un nombre válido de hasta 120 caracteres.';
  }
  if (typeof password !== 'string' || password.length < 14 || password.length > 128 || !password.trim()) {
    errors.password = 'Captura una contraseña de 14 a 128 caracteres.';
  }
  if (!['recepcion', 'tecnico', 'administrador'].includes(role)) {
    errors.role = 'Selecciona un rol permitido para la cuenta interna.';
  }
  if (Object.keys(errors).length) throw new HttpError(422, 'Revisa los datos de la cuenta interna.', errors);
  return { username, name, password, role };
}

export function internalUserController(pool) {
  return {
    register: async (req, res) => {
      const user = await registerInternalUser(pool, validateRegistration(req.body), req.user.id);
      res.status(201).json({ user });
    },
    deactivationHistory: async (req, res) => {
      const history = await readDeactivations(pool, validateInternalUserId(req.params.userId));
      res.json({ history });
    },
    deactivate: async (req, res) => {
      const userId = validateInternalUserId(req.params.userId);
      const deactivation = await deactivateInternalUser(pool, userId, req.user.id);
      res.status(201).json({ deactivation });
    },
  };
}
