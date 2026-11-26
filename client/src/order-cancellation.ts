import { Component, OnChanges, SimpleChanges, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { StateView } from './order-state';

type Request = (path: string, method?: string, body?: unknown) => Promise<unknown>;
type RequestError = { status?: number; message?: string };

@Component({
  selector: 'reparix-order-cancellation',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './order-cancellation.html',
})
export class OrderCancellation implements OnChanges {
  order = input.required<StateView>();
  api = input.required<Request>();
  blocked = input(false);
  saving = output<boolean>();
  stateChanged = output<StateView>();
  refreshOrder = output<string>();
  sessionExpired = output<RequestError>();

  readonly editing = signal(false);
  readonly pending = signal(false);
  readonly needsRefresh = signal(false);
  readonly error = signal('');
  reason = '';

  ngOnChanges(changes: SimpleChanges) {
    if (!changes['order']) return;
    this.needsRefresh.set(false);
    if (this.order().state === 'Cancelado') this.edit(false);
  }

  edit(open: boolean) {
    this.editing.set(open);
    this.reason = '';
    this.error.set('');
  }

  async confirm() {
    const order = this.order();
    const motivo = this.reason.trim();
    if (!this.editing() || !order.canCancel || !motivo || this.blocked() || this.pending() || this.needsRefresh()) return;
    this.pending.set(true);
    this.saving.emit(true);
    this.error.set('');
    let updated: StateView | undefined;
    let refresh = false;
    try {
      updated = await this.api()(`/orders/${order.folio}/cancellations`, 'POST', {
        expectedVersion: order.orderVersion, motivo,
      }) as StateView;
    } catch (value) {
      const error = value as RequestError;
      if (error.status === 401) this.sessionExpired.emit(error);
      else {
        const uncertain = !error.status || error.status >= 500;
        refresh = uncertain || error.status === 409;
        this.needsRefresh.set(refresh);
        this.error.set(uncertain ? 'Consulta el estado para confirmar si se registró la cancelación.' : error.message || 'La solicitud de cancelación fue rechazada.');
      }
    } finally {
      this.pending.set(false);
      this.saving.emit(false);
      if (updated) this.stateChanged.emit(updated);
      else if (refresh) this.refreshOrder.emit(order.folio);
    }
  }

}
