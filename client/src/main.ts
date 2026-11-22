import {bootstrapApplication} from '@angular/platform-browser';
import {Component,signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
type Assignment={id:string;technicianId:string;technicianName:string;assignedAt:string;assignedByName?:string;endedAt:string|null;endedByName?:string};
type Receipt={folio:string;state:string;version:number;receivedAt:string;clientName:string;phone:string;email:string|null;deviceType:string;brand:string;model:string;serialNumber:string|null;serialUnavailableReason:string|null;reportedFault:string;physicalCondition:string;accessories:string[];history:{author:string;changedAt:string}[];currentAssignment:Assignment|null;assignmentHistory:Assignment[]};
type Assessment={id:string;revision:number;assignmentId:string;diagnosis:string;proposedWork:string;amount:string;currency:string;note:string;authorName:string;registeredAt:string};
type BudgetAcceptance={id:string;assessmentId:string;revision:number;canal:string;evidencia:string;responsable:string;authorName:string;recordedAt:string};
type BudgetRejection={recordedAt:string;authorName:string;evidence:string};
type BudgetAction='budget-communications'|'budget-acceptances'|'budget-rejections';
type AssessmentView={orderVersion:number;state:string;assessments:Assessment[];currentAssessment:Assessment|null;latestAssessment:Assessment|null;authorizationRecorded:boolean;budgetRejected:boolean;communication:{recordedAt:string}|null;acceptances?:BudgetAcceptance[];rejection?:BudgetRejection|null};
type StateView={folio:string;state:string;orderVersion:number;changedAt:string;changedBy:string;allowedTransitions:string[];blockedReason:string;history:{previousState:string|null;state:string;note:string;changedAt:string;author:string}[]};
const emptyAssessment=()=>({diagnosis:'',proposedWork:'',amount:'',currency:'MXN',note:''});
const emptyAcceptance=()=>({canal:'',evidencia:'',responsable:''});
const empty=()=>({clientName:'',phone:'',email:'',deviceType:'',brand:'',model:'',serialNumber:'',serialUnavailableReason:'',reportedFault:'',physicalCondition:'',accessoriesConfirmed:false,physicalCheckConfirmed:false});
@Component({selector:'app-root',standalone:true,imports:[FormsModule],template:`
<header><a href="/" class="brand">Reparix<span>Recepción de equipos</span></a>@if(user()){<button class="quiet" (click)="logout()">Cerrar sesión</button>}</header>
<main><div class="intro"><span class="eyebrow">CONTROL INTERNO DEL TALLER</span><h1>{{user() ? user()?.role==='tecnico' ? 'Consultar orden asignada' : 'Registrar una orden' : 'Acceso del personal'}}</h1><p>{{user() ? user()?.role==='tecnico' ? 'Consulta por folio las órdenes que tienes asignadas.' : 'Coteja los datos y el equipo antes de confirmar la recepción.' : 'Usa tu cuenta individual para acceder a tus funciones.'}}</p></div>
@if(message()){<div class="notice" role="status">{{message()}}</div>}
@if(!user()){
<form class="panel login" (ngSubmit)="login()"><h2>Iniciar sesión</h2><label>Usuario<input name="username" [(ngModel)]="username" [disabled]="locked()||stateNeedsRefresh()" autocomplete="username" required maxlength="80"></label><label>Contraseña<input name="password" type="password" [(ngModel)]="password" autocomplete="current-password" required maxlength="128"></label><button [disabled]="busy()">{{busy()?'Verificando…':'Entrar'}}</button></form>
}@else if(user()?.role==='tecnico'){
<form class="panel lookup" (ngSubmit)="lookup()"><label>Consultar orden asignada por folio<input name="folio" [(ngModel)]="lookupFolio" placeholder="RPX-000000000001" pattern="RPX-[0-9]{12}" required maxlength="16"></label><button [disabled]="busy()">Consultar</button></form>
@if(technicalOrder();as t){<section class="panel technical"><h2>{{t.folio}}</h2><p>{{t.state}} · {{t.deviceType}} · {{t.brand}} · {{t.model}}</p><p>Serie: {{t.serialNumber || t.serialUnavailableReason}}</p><h3>Falla reportada</h3><p class="multiline">{{t.reportedFault}}</p><h3>Condición física</h3><p class="multiline">{{t.physicalCondition}}</p><p>Accesorios: {{t.accessories.join(', ') || 'Ninguno'}}</p><p>Asignación: {{date(t.currentAssignment?.assignedAt || '')}}</p><p class="muted">El registro de diagnóstico no cambia el estado de la orden ni autoriza reparación.</p></section>}
}@else{
@if(receipt();as r){<section class="panel receipt" aria-label="Comprobante de recepción"><div class="section-title"><div><span class="eyebrow">GUARDADO CONFIRMADO</span><h2>{{r.folio}}</h2></div><span class="badge">{{r.state}}</span></div><p>Recepción: {{date(r.receivedAt)}} · Responsable: {{r.history[0]?.author}}</p><h3>Cliente y equipo</h3><p>{{r.clientName}} · {{r.phone}} {{r.email}}</p><p>{{r.deviceType}} · {{r.brand}} · {{r.model}}</p><p>Serie: {{r.serialNumber || ('No disponible: '+r.serialUnavailableReason)}}</p><h3>Falla reportada</h3><p class="multiline">{{r.reportedFault}}</p><h3>Condición física</h3><p class="multiline">{{r.physicalCondition}}</p><p><strong>Accesorios:</strong> {{r.accessories.length?r.accessories.join(', '):'Ninguno, confirmado'}}</p><button class="secondary" (click)="printReceipt()">Imprimir comprobante</button> <button (click)="newOrder()">Nueva recepción</button></section>}
<form class="panel lookup" (ngSubmit)="lookup()"><label>Recuperar comprobante por folio<input name="folio" [(ngModel)]="lookupFolio" placeholder="RPX-000000000001" pattern="RPX-[0-9]{12}" required maxlength="16"></label><button class="secondary" [disabled]="busy()||locked()">Consultar</button></form>
@if(receipt();as r){<section class="panel assignment" aria-label="Asignación de técnico"><h2>Asignar técnico responsable</h2><p>Versión {{r.version}} · Técnico vigente: <strong>{{r.currentAssignment?.technicianName || 'Sin asignación'}}</strong></p><p class="muted">Asignar un técnico conserva el estado actual.</p>
@if(assignmentNeedsRefresh()){<p role="alert">Consulta nuevamente este folio antes de confirmar otra asignación.</p>}
@if(r.state!=='Pendiente de autorización'){<form (ngSubmit)="assign()" #a="ngForm"><label>Técnico activo<select name="technician" [(ngModel)]="selectedTechnician" (ngModelChange)="assignmentConfirmed=false" required [disabled]="busy()||assignmentNeedsRefresh()"><option value="">Selecciona un técnico</option>@for(t of technicians();track t.id){<option [value]="t.id">{{t.name}}</option>}</select></label>
@if(!technicians().length){<p>No hay técnicos activos disponibles. Solicita el alta local de una cuenta individual autorizada.</p>}
<label>Motivo de asignación o reasignación<input name="assignmentNote" [(ngModel)]="assignmentNote" (ngModelChange)="assignmentConfirmed=false" required minlength="3" maxlength="500" [disabled]="busy()||assignmentNeedsRefresh()"></label><label class="check"><input name="assignmentConfirmed" type="checkbox" [(ngModel)]="assignmentConfirmed" required [disabled]="busy()||assignmentNeedsRefresh()"> Confirmo el técnico seleccionado y el cambio de responsable.</label><button [disabled]="busy()||a.invalid||assignmentNeedsRefresh()||selectedTechnician===r.currentAssignment?.technicianId">Confirmar asignación</button></form>}@else{<p>La asignación está cerrada mientras el presupuesto espera autorización.</p>}
<h3>Historial de asignaciones</h3>@for(h of r.assignmentHistory;track h.id){<p class="assignment-history">{{h.technicianName}} · {{date(h.assignedAt)}} · Por {{h.assignedByName}} · {{h.endedAt ? 'Cerrada: '+date(h.endedAt)+' por '+h.endedByName : 'Vigente'}}</p>}@empty{<p>Sin asignaciones previas.</p>}</section>}
@if(!receipt()){
<form class="panel order" (ngSubmit)="save()" #f="ngForm">
<div class="section-title"><h2>01 · Datos del cliente</h2><span class="muted">* Obligatorios</span></div>
<div class="grid"><label>Nombre completo *<input name="clientName" [(ngModel)]="data.clientName" [disabled]="locked()" required minlength="2" maxlength="120" autocomplete="name"><small>{{errors()['clientName']}}</small></label><label>Teléfono *<input name="phone" [(ngModel)]="data.phone" [disabled]="locked()" required minlength="7" maxlength="30" autocomplete="tel"><small>{{errors()['phone']}}</small></label><label>Correo electrónico<input name="email" type="email" [(ngModel)]="data.email" [disabled]="locked()" maxlength="254" autocomplete="email"><small>{{errors()['email']}}</small></label></div>
<h2>02 · Equipo recibido</h2><div class="grid"><label>Tipo *<input name="deviceType" [(ngModel)]="data.deviceType" [disabled]="locked()" required minlength="2" maxlength="80" placeholder="Computadora portátil"></label><label>Marca *<input name="brand" [(ngModel)]="data.brand" [disabled]="locked()" required maxlength="80"></label><label>Modelo *<input name="model" [(ngModel)]="data.model" [disabled]="locked()" required maxlength="120"></label><label>Número de serie<input name="serialNumber" [(ngModel)]="data.serialNumber" [disabled]="locked()" maxlength="120"><small>{{errors()['serialNumber']}}</small></label><label>Si no hay serie, explica el motivo<input name="serialUnavailableReason" [(ngModel)]="data.serialUnavailableReason" [disabled]="locked()" maxlength="200" placeholder="No visible por desgaste"></label></div>
<label>Falla reportada *<textarea name="reportedFault" [(ngModel)]="data.reportedFault" [disabled]="locked()" required minlength="5" maxlength="2000" rows="3"></textarea><small>{{errors()['reportedFault']}}</small></label><label>Condición física al recibir *<textarea name="physicalCondition" [(ngModel)]="data.physicalCondition" [disabled]="locked()" required minlength="5" maxlength="2000" rows="3"></textarea><small>{{errors()['physicalCondition']}}</small></label>
<h2>03 · Cotejo de recepción</h2><label>Accesorios recibidos<span class="muted">Uno por línea. Si no se recibió ninguno, deja vacío y confirma abajo.</span><textarea name="accessories" [(ngModel)]="accessoriesText" [disabled]="locked()" rows="3" maxlength="2400"></textarea><small>{{errors()['accessories']}}</small></label><label class="check"><input name="accessoriesConfirmed" type="checkbox" [(ngModel)]="data.accessoriesConfirmed" [disabled]="locked()" required> Confirmé la lista de accesorios o que no se recibió ninguno. *</label><label class="check"><input name="physicalCheckConfirmed" type="checkbox" [(ngModel)]="data.physicalCheckConfirmed" [disabled]="locked()" required> Cotejé físicamente el equipo y los datos con quien lo entrega. *</label><p class="muted">No registres contraseñas del dispositivo ni contenido de archivos del cliente.</p>
@for(item of extraErrors();track item){<p class="error">{{item}}</p>}
<div class="actions"><p class="muted">{{locked()?'Resultado pendiente. Conserva esta captura y reintenta para recuperar la misma orden.':'El folio aparecerá cuando el guardado esté confirmado.'}}</p><button [disabled]="busy()||f.invalid">{{busy()?'Guardando…':locked()?'Reintentar la misma recepción':'Confirmar recepción'}}</button></div>
</form>}}
@if(stateView();as sv){<section class="panel state-panel" aria-label="Estado de la orden"><h2>Estado de la orden</h2><p><strong>{{sv.state}}</strong> · Versión {{sv.orderVersion}}</p><p>Última actualización: {{date(sv.changedAt)}} · {{sv.changedBy}}</p>
@if(sv.blockedReason){<p class="muted">{{sv.blockedReason}}</p>}
@if(sv.allowedTransitions.includes('En reparación')){<p>El cliente autorizó el presupuesto vigente. Puedes iniciar la reparación.</p>}
@if(stateNeedsRefresh()){<p role="alert">Consulta nuevamente el folio antes de confirmar otro cambio de estado.</p>}
@if(sv.allowedTransitions.length){<form (ngSubmit)="changeState()" #st="ngForm"><label>Nuevo estado<select name="targetState" [(ngModel)]="targetState" (ngModelChange)="stateConfirmed=false" required [disabled]="busy()||stateNeedsRefresh()"><option value="">Selecciona el siguiente estado</option>@for(s of sv.allowedTransitions;track s){<option [value]="s">{{s}}</option>}</select></label><label>Nota del cambio<input name="stateNote" [(ngModel)]="stateNote" (ngModelChange)="stateConfirmed=false" required minlength="3" maxlength="500" [disabled]="busy()||stateNeedsRefresh()"></label><label class="check"><input name="stateConfirmed" type="checkbox" [(ngModel)]="stateConfirmed" required [disabled]="busy()||stateNeedsRefresh()"> Confirmo el estado seleccionado y la nota.</label><button [disabled]="busy()||st.invalid||stateNeedsRefresh()">Confirmar cambio de estado</button></form>}
<h3>Historial de estados</h3>@for(h of sv.history;track $index){<p class="state-history">{{h.previousState || 'Alta'}} → {{h.state}} · {{date(h.changedAt)}} · {{h.author}}<br>{{h.note}}</p>}</section>}
@if(assessmentView();as av){<section class="panel assessment" aria-label="Diagnóstico y presupuesto"><h2>Diagnóstico y presupuesto</h2><p>Versión de orden {{av.orderVersion}} · {{av.currentAssessment ? 'Revisión vigente: '+av.currentAssessment.revision : 'Sin revisión de la asignación vigente'}}</p><p>{{av.authorizationRecorded ? 'Presupuesto vigente autorizado.' : av.budgetRejected ? 'Presupuesto vigente rechazado.' : 'Presupuesto vigente sin autorización.'}}</p>
@if(user()?.role==='recepcion'||user()?.role==='administrador'){
@if(av.currentAssessment;as current){
<h3>Decisión sobre el presupuesto</h3>
<p>Revisión {{current.revision}} · {{current.amount}} {{current.currency}}</p>
@if(budgetNeedsRefresh()){<p role="alert">Consulta nuevamente el folio para confirmar el resultado y revisar el presupuesto vigente.</p>}
@if(av.communication;as communication){
<p>Comunicación registrada el {{date(communication.recordedAt)}}.</p>
@if(!av.authorizationRecorded && av.state!=='En reparación'){
<form (ngSubmit)="saveBudget('budget-acceptances')" aria-label="Registrar aceptación del presupuesto">
<label>Canal de confirmación<input name="acceptanceChannel" [(ngModel)]="acceptanceData.canal" maxlength="80" required [disabled]="busy()||budgetNeedsRefresh()"></label>
<label>Evidencia de confirmación<textarea name="acceptanceEvidence" [(ngModel)]="acceptanceData.evidencia" maxlength="2000" rows="3" required [disabled]="busy()||budgetNeedsRefresh()"></textarea></label>
<label>Responsable del registro<input name="acceptanceResponsible" [(ngModel)]="acceptanceData.responsable" maxlength="120" required [disabled]="busy()||budgetNeedsRefresh()"></label>
<button [disabled]="busy()||budgetNeedsRefresh()||!acceptanceIsComplete()">Registrar aceptación</button>
</form>
@if(!av.rejection){<form (ngSubmit)="saveBudget('budget-rejections')" aria-label="Registrar rechazo del presupuesto">
<label>Evidencia del rechazo<textarea name="rejectionEvidence" [(ngModel)]="rejectionEvidence" minlength="3" maxlength="500" rows="2" required [disabled]="busy()||budgetNeedsRefresh()"></textarea></label>
<button class="secondary" [disabled]="busy()||budgetNeedsRefresh()||rejectionEvidence.trim().length<3">Registrar rechazo</button>
</form>}
}
@if(av.rejection;as rejection){<article class="assessment-history">
<h4>Rechazo registrado para la revisión {{current.revision}}</h4>
<p><time [attr.datetime]="rejection.recordedAt">{{date(rejection.recordedAt)}}</time> · Registrado por {{rejection.authorName}}</p>
<p class="multiline">{{rejection.evidence}}</p>
</article>}
}@else{
<p>Confirma la comunicación después de informar al cliente de esta revisión.</p>
<button type="button" class="secondary" (click)="saveBudget('budget-communications')" [disabled]="busy()||budgetNeedsRefresh()">Registrar comunicación al cliente</button>
}}
@if(av.acceptances?.length){
<h3>Historial de aceptaciones</h3>
@for(a of av.acceptances;track a.id){
<article class="assessment-history">
<h4>Revisión {{a.revision}} · Aceptada</h4>
<p><time [attr.datetime]="a.recordedAt">{{date(a.recordedAt)}}</time> · Registrada por {{a.authorName}}</p>
<p><strong>Canal:</strong> {{a.canal}}</p>
<p class="multiline"><strong>Evidencia:</strong> {{a.evidencia}}</p>
<p><strong>Responsable:</strong> {{a.responsable}}</p>
</article>
}}
}
@if(user()?.role==='tecnico' && av.state==='En diagnóstico'){
@if(assessmentNeedsRefresh()){<p role="alert">Consulta nuevamente el folio y comprueba las revisiones antes de confirmar otro guardado.</p>}
@if(av.latestAssessment){<button class="secondary" type="button" (click)="useLatestAssessment()" [disabled]="busy()||assessmentNeedsRefresh()">Usar última revisión como base</button>}
<form (ngSubmit)="saveAssessment()" #d="ngForm"><label>Diagnóstico<textarea name="diagnosis" [(ngModel)]="assessmentData.diagnosis" (ngModelChange)="assessmentConfirmed=false" required minlength="5" maxlength="4000" rows="3" [disabled]="busy()||assessmentNeedsRefresh()"></textarea><small>{{errors()['diagnosis']}}</small></label><label>Trabajo propuesto<textarea name="proposedWork" [(ngModel)]="assessmentData.proposedWork" (ngModelChange)="assessmentConfirmed=false" required minlength="5" maxlength="4000" rows="3" [disabled]="busy()||assessmentNeedsRefresh()"></textarea><small>{{errors()['proposedWork']}}</small></label><div class="grid"><label>Importe total en MXN<input name="assessmentAmount" [(ngModel)]="assessmentData.amount" (ngModelChange)="assessmentConfirmed=false" inputmode="decimal" pattern="(0|[1-9][0-9]{0,9})[.][0-9]{2}" required maxlength="13" placeholder="1500.00" [disabled]="busy()||assessmentNeedsRefresh()"><small>{{errors()['amount']}}</small></label><label>Motivo de la nueva revisión<input name="assessmentNote" [(ngModel)]="assessmentData.note" (ngModelChange)="assessmentConfirmed=false" required minlength="3" maxlength="500" [disabled]="busy()||assessmentNeedsRefresh()"></label></div><label class="check"><input name="assessmentConfirmed" type="checkbox" [(ngModel)]="assessmentConfirmed" required [disabled]="busy()||assessmentNeedsRefresh()"> Confirmo diagnóstico, trabajo e importe de esta nueva revisión.</label><button [disabled]="busy()||d.invalid||assessmentNeedsRefresh()||assessmentData.amount==='0.00'">Guardar nueva revisión</button></form>}
<h3>Revisiones conservadas</h3>@for(a of av.assessments;track a.id){<article class="assessment-history"><h4>Revisión {{a.revision}} · {{a.amount}} {{a.currency}}</h4><p>{{a.authorName}} · {{date(a.registeredAt)}} · {{a.id===av.currentAssessment?.id ? 'Vigente para esta asignación' : 'Antecedente conservado'}}</p><p class="multiline"><strong>Diagnóstico:</strong> {{a.diagnosis}}</p><p class="multiline"><strong>Trabajo propuesto:</strong> {{a.proposedWork}}</p><p class="multiline"><strong>Motivo:</strong> {{a.note}}</p></article>}@empty{<p>Sin revisiones registradas.</p>}</section>}
<footer>Reparix · Acceso interno</footer></main>`})
export class App{
 user=signal<{name:string;username:string;role:string}|null>(null);busy=signal(false);message=signal('');receipt=signal<Receipt|null>(null);errors=signal<Record<string,string>>({});locked=signal(false);
 technicalOrder=signal<Receipt|null>(null);technicians=signal<{id:string;name:string}[]>([]);assignmentNeedsRefresh=signal(false);selectedTechnician='';assignmentNote='';assignmentConfirmed=false;
 assessmentView=signal<AssessmentView|null>(null);assessmentNeedsRefresh=signal(false);assessmentData=emptyAssessment();assessmentConfirmed=false;assessmentDraftFolio='';
 budgetNeedsRefresh=signal(false);acceptanceData=emptyAcceptance();rejectionEvidence='';budgetDraftAssessment='';
 stateView=signal<StateView|null>(null);stateNeedsRefresh=signal(false);targetState='';stateNote='';stateConfirmed=false;stateDraftFolio='';
 username='';password='';csrf='';data=empty();accessoriesText='';lookupFolio='';key=crypto.randomUUID();snapshot:unknown=null;
 constructor(){void this.restore();window.addEventListener('beforeunload',e=>{if(this.locked()||this.stateNeedsRefresh()){e.preventDefault();e.returnValue='';}});}
 async api(url:string,method='GET',body?:unknown,key?:string){const res=await fetch('/api'+url,{method,signal:AbortSignal.timeout(15000),credentials:'same-origin',headers:{'Content-Type':'application/json',...(this.csrf?{'X-CSRF-Token':this.csrf}:{}),...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=res.status===204?{}:await res.json();if(!res.ok)throw {status:res.status,...result};return result;}
 async restore(){try{const r=await this.api('/session');this.user.set(r.user);this.username=r.user.username;this.csrf=r.csrfToken;await this.loadTechnicians();}catch{}}
 async login(){this.busy.set(true);try{const r=await this.api('/session','POST',{username:this.username,password:this.password});this.user.set(r.user);this.username=r.user.username;this.csrf=r.csrfToken;this.password='';this.message.set('');await this.loadTechnicians();}catch(e){this.fail(e);}finally{this.busy.set(false);}}
 async loadTechnicians(){if(this.user()?.role!=='tecnico'){const r=await this.api('/technicians');this.technicians.set(r.technicians);}}
 async logout(){if(this.locked()){this.message.set('Recupera el resultado pendiente antes de cerrar la sesión.');return;}this.busy.set(true);try{await this.api('/session','DELETE');this.user.set(null);this.csrf='';this.newOrder();this.password='';}catch(e){this.fail(e);}finally{this.busy.set(false);}}
 async save(){if(this.busy())return;this.busy.set(true);this.errors.set({});this.message.set('Guardado pendiente…');if(!this.snapshot)this.snapshot={...this.data,accessories:this.accessoriesText.split('\n').map(x=>x.trim()).filter(Boolean)};this.locked.set(true);try{const r=await this.api('/orders','POST',this.snapshot,this.key);this.receipt.set(r.order);this.message.set(r.replayed?'Recepción recuperada. Se conserva el mismo folio.':'Recepción guardada y confirmada.');this.locked.set(false);await this.loadStateActions(r.order.folio,r.order.version);}catch(e:any){if(e.status===422||e.status===400){this.snapshot=null;this.locked.set(false);}this.fail(e);}finally{this.busy.set(false);}}
 async lookup(){if(this.locked())return;this.busy.set(true);this.technicalOrder.set(null);this.assessmentView.set(null);this.stateView.set(null);try{const folio=encodeURIComponent(this.lookupFolio),r=await this.api('/orders/'+folio),av=await this.api('/orders/'+folio+'/assessments'),sv=await this.api('/orders/'+folio+'/state');if(r.order.version!==av.orderVersion||av.orderVersion!==sv.orderVersion)throw {status:409,message:'La orden cambió durante la consulta. Vuelve a consultar el folio.'};if(this.assessmentDraftFolio!==r.order.folio)this.assessmentData=emptyAssessment();if(this.stateDraftFolio!==r.order.folio)this.stateNote='';this.stateDraftFolio=r.order.folio;this.targetState='';this.stateConfirmed=false;this.stateView.set(sv);this.stateNeedsRefresh.set(false);this.assessmentDraftFolio=r.order.folio;this.assessmentView.set(av);this.resetBudgetDraft(av);this.assessmentNeedsRefresh.set(false);this.assessmentConfirmed=false;if(this.user()?.role==='tecnico'){this.technicalOrder.set(r.order);this.message.set('Orden asignada recuperada.');}else{this.receipt.set(r.order);this.assignmentNeedsRefresh.set(false);this.assignmentConfirmed=false;await this.loadTechnicians();this.message.set('Comprobante recuperado.');}}catch(e){this.fail(e);}finally{this.busy.set(false);}}
 async loadStateActions(folio:string,version:number){try{const sv=await this.api('/orders/'+folio+'/state');this.stateView.set(sv);this.stateNeedsRefresh.set(sv.orderVersion!==version);this.stateDraftFolio=folio;this.targetState='';this.stateConfirmed=false;}catch{this.stateView.set(null);this.stateNeedsRefresh.set(true);}}
 resetBudgetDraft(view:AssessmentView|null){
  const id=view?.currentAssessment?.id??'';
  if(id!==this.budgetDraftAssessment||view?.authorizationRecorded)this.acceptanceData=emptyAcceptance();
  if(id!==this.budgetDraftAssessment||view?.rejection||view?.authorizationRecorded)this.rejectionEvidence='';
  this.budgetDraftAssessment=id;
  this.budgetNeedsRefresh.set(false);
 }
 acceptanceIsComplete(){return Object.values(this.acceptanceData).every(value=>value.trim());}
 async saveBudget(action:BudgetAction){
  const order=this.receipt(),view=this.assessmentView(),current=view?.currentAssessment;
  if(!order||!current||this.busy()||this.budgetNeedsRefresh()||this.user()?.role==='tecnico')return;
  const accepting=action==='budget-acceptances';
  const rejecting=action==='budget-rejections';
  if((accepting||rejecting)&&(!view.communication||view.authorizationRecorded||view.state==='En reparación'))return;
  if(accepting&&!this.acceptanceIsComplete())return;
  if(rejecting&&(view.rejection||this.rejectionEvidence.trim().length<3))return;
  this.busy.set(true);
  try{
   const updated=await this.api('/orders/'+order.folio+'/'+action,'POST',{
    presupuestoId:current.id,...(accepting?this.acceptanceData:{}),...(rejecting?{evidencia:this.rejectionEvidence}:{}),
   });
   this.assessmentView.set(updated);
   this.resetBudgetDraft(updated);
   if(accepting||rejecting)await this.loadStateActions(order.folio,updated.orderVersion);
   this.message.set(accepting?'Aceptación guardada en el historial.':rejecting?'Rechazo guardado en el historial.':'Comunicación del presupuesto registrada.');
  }catch(e:any){
   if(e.status===409||!e.status||e.status>=500)this.budgetNeedsRefresh.set(true);
   if(!e.status||e.status>=500)this.message.set('Consulta nuevamente el folio para comprobar si el registro se guardó.');
   else this.fail(e);
  }finally{this.busy.set(false);}
 }
 async changeState(){const sv=this.stateView();if(!sv||this.busy()||!this.stateConfirmed||this.stateNeedsRefresh())return;this.busy.set(true);this.lookupFolio=sv.folio;try{const r=await this.api('/orders/'+sv.folio+'/state','POST',{state:this.targetState,expectedVersion:sv.orderVersion,note:this.stateNote});this.stateView.set(r);this.stateConfirmed=false;this.targetState='';this.stateNote='';this.receipt.update(o=>o?{...o,state:r.state,version:r.orderVersion}:null);this.technicalOrder.update(o=>o?{...o,state:r.state,version:r.orderVersion}:null);this.assessmentView.update(a=>a?{...a,state:r.state,orderVersion:r.orderVersion}:null);this.message.set('Cambio de estado guardado y registrado en el historial.');}catch(e:any){this.stateConfirmed=false;this.stateNeedsRefresh.set(true);if(!e.status||e.status>=500)this.message.set('No se recibió confirmación del cambio. Conserva la nota y consulta este folio.');else this.fail(e);}finally{this.busy.set(false);}}
 useLatestAssessment(){const a=this.assessmentView()?.latestAssessment;if(!a)return;this.assessmentData={diagnosis:a.diagnosis,proposedWork:a.proposedWork,amount:a.amount,currency:a.currency,note:''};this.assessmentConfirmed=false;}
 async saveAssessment(){const view=this.assessmentView(),order=this.technicalOrder();if(!view||!order||this.busy()||!this.assessmentConfirmed||this.assessmentNeedsRefresh())return;this.busy.set(true);this.errors.set({});try{const r=await this.api('/orders/'+order.folio+'/assessments','POST',{...this.assessmentData,expectedVersion:view.orderVersion});this.assessmentView.set(r);this.technicalOrder.set({...order,version:r.orderVersion});this.assessmentConfirmed=false;this.assessmentData.note='';await this.loadStateActions(order.folio,r.orderVersion);this.message.set('Nueva revisión guardada. Las revisiones anteriores están disponibles en el historial.');}catch(e:any){this.assessmentConfirmed=false;if(e.status!==422)this.assessmentNeedsRefresh.set(true);if(!e.status||e.status>=500)this.message.set('No se recibió confirmación de la revisión. Conserva la captura y consulta las revisiones de este folio.');else this.fail(e);}finally{this.busy.set(false);}}
 async assign(){const r=this.receipt();if(!r||this.busy()||!this.assignmentConfirmed||this.assignmentNeedsRefresh())return;this.busy.set(true);this.assessmentView.set(null);this.lookupFolio=r.folio;try{const response=await this.api('/orders/'+r.folio+'/assignments','POST',{technicianId:this.selectedTechnician,expectedVersion:r.version,note:this.assignmentNote});this.receipt.set(response.order);this.assignmentConfirmed=false;this.assignmentNote='';await this.loadStateActions(r.folio,response.order.version);this.message.set('Asignación guardada. Se conservan las asignaciones anteriores.');}catch(e:any){this.assignmentNeedsRefresh.set(true);this.assignmentConfirmed=false;if(!e.status||e.status>=500){this.message.set('No se recibió confirmación de la asignación. Consulta este folio para comprobar el resultado.');}else this.fail(e);}finally{this.busy.set(false);}}
 fail(e:any){if(e.status===401){this.user.set(null);this.csrf='';this.receipt.set(null);this.technicalOrder.set(null);this.assessmentView.set(null);this.resetBudgetDraft(null);this.stateView.set(null);this.technicians.set([]);}this.errors.set(e.fields||{});this.message.set(e.message||'No se recibió confirmación. Conserva la captura y reintenta.');}
 extraErrors(){return Object.entries(this.errors()).map(([key,value])=>key+': '+value);}
 newOrder(){this.receipt.set(null);this.technicalOrder.set(null);this.stateView.set(null);this.stateNeedsRefresh.set(false);this.stateNote='';this.stateDraftFolio='';this.targetState='';this.stateConfirmed=false;this.assessmentView.set(null);this.resetBudgetDraft(null);this.assessmentNeedsRefresh.set(false);this.assessmentData=emptyAssessment();this.assessmentDraftFolio='';this.assessmentConfirmed=false;this.assignmentNeedsRefresh.set(false);this.assignmentConfirmed=false;this.assignmentNote='';this.selectedTechnician='';this.data=empty();this.accessoriesText='';this.key=crypto.randomUUID();this.snapshot=null;this.locked.set(false);this.message.set('');this.errors.set({});}
 date(value:string){return new Date(value).toLocaleString('es-MX');}printReceipt(){window.print();}
}
bootstrapApplication(App).catch(error=>console.error(error));
