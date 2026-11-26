import { Component, OnInit, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

const roleProfiles = {
  recepcion: { name: 'Recepción', permissions: 'Gestionar recepciones, asignaciones y decisiones de presupuesto.' },
  tecnico: { name: 'Técnico', permissions: 'Consultar sus órdenes asignadas y registrar diagnósticos y presupuestos.' },
  administrador: { name: 'Administrador', permissions: 'Gestionar cuentas internas, operar en recepción e iniciar reparaciones autorizadas.' },
};

type Role = keyof typeof roleProfiles;
type Account = { id: string; username: string; name: string; role: Role; active: boolean };
type RoleChange = { id: string; previousRole: Role; newRole: Role; actorName: string; changedAt: string };
type Registration = { initialRole: Role; actorName: string; registeredAt: string };
type Deactivation = { id: string; actorName: string; changedAt: string };
type AccountDetails = { account: Account; history: RoleChange[]; registration?: Registration; deactivations?: Deactivation[] };
type ApiRequest = (path: string, method?: string, body?: unknown) => Promise<unknown>;
type RegistrationDraft = { username: string; name: string; password: string; role: Role | '' };
const emptyRegistration = (): RegistrationDraft => ({ username: '', name: '', password: '', role: '' });

@Component({
  selector: 'reparix-role-management',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './role-management.html',
})
export class RoleManagement implements OnInit {
  api = input.required<ApiRequest>();
  currentUsername = input.required<string>();
  saving = output<boolean>();
  sessionChanged = output<string>();

  readonly profiles = roleProfiles;
  readonly roles = Object.keys(roleProfiles) as Role[];
  readonly accounts = signal<Account[] | null>(null);
  readonly details = signal<AccountDetails | null>(null);
  readonly busy = signal(false);
  readonly notice = signal('');
  readonly error = signal('');
  readonly registering = signal(false);
  readonly registrationErrors = signal<Record<string, string>>({});
  readonly confirmingDeactivation = signal(false);
  readonly usernamePattern = /^[a-z0-9._-]{3,80}$/;
  selectedId = '';
  nextRole: Role | '' = '';
  registrationDraft = emptyRegistration();

  ngOnInit() { void this.loadAccounts(); }

  async loadAccounts() {
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await this.api()('/internal-users') as { accounts: Account[] };
      this.accounts.set(result.accounts);
    } catch (error) {
      this.showError(error, 'No se pudieron consultar las cuentas internas.');
    } finally {
      this.busy.set(false);
    }
  }

  async selectAccount(id: string) {
    this.selectedId = id;
    this.nextRole = '';
    this.confirmingDeactivation.set(false);
    this.details.set(null);
    this.notice.set('');
    this.error.set('');
    if (!id) return;
    this.busy.set(true);
    try {
      await this.loadDetails(id);
    } catch (error) {
      this.showError(error, 'No se pudo consultar el historial de la cuenta.');
    } finally {
      this.busy.set(false);
    }
  }

  editRegistration(open: boolean) {
    this.registering.set(open);
    this.confirmingDeactivation.set(false);
    this.registrationDraft = emptyRegistration();
    this.registrationErrors.set({});
    this.notice.set('');
    this.error.set('');
  }

  clearRegistrationError(field: keyof RegistrationDraft) {
    if (this.registrationErrors()[field]) {
      this.registrationErrors.update(errors => ({ ...errors, [field]: '' }));
    }
  }

  async registerAccount() {
    const { username, name, password, role } = this.registrationDraft;
    if (this.busy() || !name.trim() || !password.trim() || !role) return;
    this.busy.set(true);
    this.saving.emit(true);
    this.error.set('');
    this.registrationErrors.set({});
    try {
      const { user } = await this.api()('/internal-users', 'POST', { username, name, password, role }) as { user: Account };
      this.editRegistration(false);
      this.selectedId = user.id;
      this.nextRole = '';
      this.details.set(null);
      this.accounts.update(accounts => [...(accounts ?? []).filter(account => account.id !== user.id), user]);
      this.notice.set(`Cuenta ${user.username} registrada.`);
      await this.loadDetails(user.id);
    } catch (value) {
      const error = value as { fields?: Record<string, string> } | undefined;
      if (error?.fields) this.registrationErrors.set(error.fields);
      else this.showError(value, 'Consulta el directorio para confirmar si la cuenta se registró.');
    } finally {
      this.busy.set(false);
      this.saving.emit(false);
    }
  }

  async save() {
    const current = this.details()?.account;
    const role = this.nextRole;
    if (this.busy() || this.confirmingDeactivation() || !current || !role || current.role === role) return;
    this.busy.set(true);
    this.saving.emit(true);
    this.notice.set('');
    this.error.set('');
    try {
      await this.api()(`/internal-users/${current.id}/role-changes`, 'POST', { role });
      const message = `Cambio de rol guardado para ${current.username}.`;
      this.nextRole = '';
      this.details.set(null);
      if (current.username === this.currentUsername()) {
        this.sessionChanged.emit(message);
        return;
      }
      this.notice.set(message);
      await this.loadDetails(current.id);
    } catch (error) {
      this.nextRole = '';
      this.details.set(null);
      this.showError(error, 'Vuelve a consultar la cuenta para confirmar el estado del cambio.');
    } finally {
      this.busy.set(false);
      this.saving.emit(false);
    }
  }

  async deactivateAccount() {
    const account = this.details()?.account;
    if (this.busy() || !this.confirmingDeactivation() || !account?.active) return;
    this.busy.set(true);
    this.saving.emit(true);
    this.notice.set('');
    this.error.set('');
    try {
      await this.api()(`/internal-users/${account.id}/deactivations`, 'POST', {});
      const message = `Cuenta ${account.username} desactivada.`;
      this.nextRole = '';
      this.details.set(null);
      if (account.username === this.currentUsername()) {
        this.sessionChanged.emit(message);
        return;
      }
      this.notice.set(message);
      await this.loadDetails(account.id);
    } catch (value) {
      this.details.set(null);
      this.showError(value, 'Vuelve a consultar la cuenta para confirmar si se desactivó.');
    } finally {
      this.confirmingDeactivation.set(false);
      this.busy.set(false);
      this.saving.emit(false);
    }
  }

  private async loadDetails(id: string) {
    const result = await this.api()(`/internal-users/${id}/role-changes`) as AccountDetails;
    if (!result.account.active) {
      const { history } = await this.api()(`/internal-users/${id}/deactivations`) as { history: Deactivation[] };
      result.deactivations = history;
    }
    this.details.set(result);
    this.accounts.update(accounts => accounts?.map(account => account.id === id ? result.account : account) ?? null);
  }

  private showError(value: unknown, fallback: string) {
    const error = value as { status?: number; message?: string } | undefined;
    this.error.set(error?.status && error.status < 500 && error.message ? error.message : fallback);
    if (error?.status === 401 || error?.status === 403) this.sessionChanged.emit('');
  }

  date(value: string) { return new Date(value).toLocaleString('es-MX'); }
}
