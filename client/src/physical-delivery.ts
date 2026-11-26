import { Component, OnChanges, SimpleChanges, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { StateView } from './order-state';

type DeliveryOrder = Pick<StateView, 'folio' | 'state' | 'orderVersion'>;
type Delivery = { id: string; receptor: string; evidencia: string; actorName: string; recordedAt: string };
type Confirmation = { expectedVersion: number; receptor: string; evidencia: string };
type Attempt = { key: string; data: Confirmation };
type Request = (path: string, method?: string, body?: unknown, key?: string) => Promise<unknown>;
type RequestError = { status?: number; message?: string };

@Component({
  selector: 'reparix-physical-delivery',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './physical-delivery.html',
})
export class PhysicalDelivery implements OnChanges {
  order = input.required<DeliveryOrder>();
  api = input.required<Request>();
  blocked = input(false);
  saving = output<boolean>();
  refreshOrder = output<string>();
  sessionExpired = output<RequestError>();

  readonly delivery = signal<Delivery | null>(null);
  readonly pending = signal(false);
  readonly attempt = signal<Attempt | null>(null);
  readonly needsRefresh = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  receptor = '';
  evidencia = '';
  physicalConfirmed = false;

  ngOnChanges(changes: SimpleChanges) {
    if (!changes['order']) return;
    const order = this.order();
    if (order.state === 'Entregado' && !this.delivery()) void this.loadDelivery();
    if (changes['order'].previousValue?.orderVersion !== order.orderVersion) {
      this.needsRefresh.set(false);
      this.physicalConfirmed = false;
    }
  }

  async loadDelivery() {
    if (this.pending()) return;
    this.pending.set(true);
    this.error.set('');
    try {
      const { deliveries } = await this.api()(`/orders/${this.order().folio}/deliveries`) as { deliveries: Delivery[] };
      this.delivery.set(deliveries[0] ?? null);
      if (!deliveries.length) this.error.set('No se encontró el registro de entrega de este folio.');
    } catch (value) {
      const error = value as RequestError;
      if (error.status === 401) this.sessionExpired.emit(error);
      else this.error.set(error.message || 'No se pudo consultar el registro de entrega.');
    } finally {
      this.pending.set(false);
    }
  }

  canConfirm() {
    return Boolean(this.attempt() || (this.receptor.trim() && this.evidencia.trim() && this.physicalConfirmed));
  }

  async confirm() {
    const order = this.order();
    if (order.state !== 'Listo para recoger' || this.delivery() || this.blocked() || this.pending() || this.needsRefresh() || !this.canConfirm()) return;
    const attempt = this.attempt() ?? {
      key: crypto.randomUUID(),
      data: { expectedVersion: order.orderVersion, receptor: this.receptor.trim(), evidencia: this.evidencia.trim() },
    };
    this.attempt.set(attempt);
    this.saving.emit(true);
    this.pending.set(true);
    this.error.set('');
    let refresh = false;
    try {
      const { delivery } = await this.api()(`/orders/${order.folio}/deliveries`, 'POST', attempt.data, attempt.key) as { delivery: Delivery };
      this.delivery.set(delivery);
      this.attempt.set(null);
      this.message.set('Entrega física confirmada.');
      refresh = true;
    } catch (value) {
      const error = value as RequestError;
      if (!error.status || error.status >= 500) {
        this.error.set('El resultado está pendiente. Reintenta la misma entrega o consulta el folio.');
      } else {
        this.attempt.set(null);
        this.physicalConfirmed = false;
        this.error.set(error.message || 'La solicitud de entrega fue rechazada.');
        if (error.status === 409) {
          this.needsRefresh.set(true);
          refresh = true;
        }
        if (error.status === 401) this.sessionExpired.emit(error);
      }
    } finally {
      this.pending.set(false);
      this.saving.emit(false);
      if (refresh) this.refreshOrder.emit(order.folio);
    }
  }

  date(value: string) { return new Date(value).toLocaleString('es-MX'); }
}
