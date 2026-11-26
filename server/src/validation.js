export class HttpError extends Error{constructor(status,message,fields){super(message);this.status=status;this.fields=fields;}}
export const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validateOrderStateInput(body, states){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['state','expectedVersion','note'].includes(k)))throw new HttpError(422,'Datos de transición no válidos.');
 if(!states.includes(body.state))throw new HttpError(422,'El estado solicitado no es válido para esta operación.');
 if(!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<1||body.expectedVersion>=2147483647)throw new HttpError(422,'Consulta una versión válida de la orden.');
 const note=typeof body.note==='string'?body.note.trim().normalize('NFC'):'';
 if(note.length<3||note.length>500||/[\u0000-\u001f\u007f]/.test(note))throw new HttpError(422,'La nota requiere de 3 a 500 caracteres sin controles.');
 return {state:body.state,expectedVersion:body.expectedVersion,note};
}
export const validateStateTransition=body=>validateOrderStateInput(body,['En diagnóstico','Pendiente de autorización','En reparación']);
export const validateRepairCompletion=body=>validateOrderStateInput(body,['Listo para recoger']);
export function validateCancellation(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(field => !['expectedVersion', 'motivo'].includes(field))) {
    throw new HttpError(422, 'Datos de cancelación no válidos.');
  }
  const { expectedVersion } = body;
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || expectedVersion >= 2147483647) {
    throw new HttpError(422, 'Consulta una versión válida de la orden.');
  }
  const motivo = typeof body.motivo === 'string' ? body.motivo.trim().normalize('NFC') : '';
  if (!motivo || motivo.length > 500 || /[\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(motivo)) {
    throw new HttpError(422, 'Captura un motivo de cancelación válido de hasta 500 caracteres.');
  }
  return { expectedVersion, motivo };
}
export function validateAssessment(body){
 const errors={};
 if(!body||typeof body!=='object'||Array.isArray(body))throw new HttpError(422,'Revisa diagnóstico y presupuesto.');
 const allowed=['expectedVersion','diagnosis','proposedWork','amount','currency','note'];
 for(const k of Object.keys(body))if(!allowed.includes(k))errors[k]='Campo no permitido.';
 if(!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<1||body.expectedVersion>=2147483647)errors.expectedVersion='Consulta una versión válida de la orden.';
 const result={expectedVersion:body.expectedVersion};
 for(const [key,min,max] of [['diagnosis',5,4000],['proposedWork',5,4000],['note',3,500]]){
  const v=typeof body[key]==='string'?body[key].trim().normalize('NFC'):'';result[key]=v;
  if(v.length<min||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))errors[key]=`Usa entre ${min} y ${max} caracteres válidos.`;
 }
 if(typeof body.amount!=='string'||!/^(0|[1-9]\d{0,9})\.\d{2}$/.test(body.amount)||body.amount==='0.00')errors.amount='Usa un importe positivo con punto y exactamente dos decimales, hasta 9999999999.99.';
 if(body.currency!=='MXN')errors.currency='El presupuesto debe expresarse en pesos mexicanos (MXN).';
 result.amount=body.amount;result.currency=body.currency;
 if(Object.keys(errors).length)throw new HttpError(422,'Revisa diagnóstico y presupuesto.',errors);return result;
}
export function validateAssignment(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['technicianId','expectedVersion','note'].includes(k)))throw new HttpError(422,'Datos de asignación no válidos.');
 if(typeof body.technicianId!=='string'||!uuidPattern.test(body.technicianId))throw new HttpError(422,'Selecciona un técnico válido.');
 if(!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<1||body.expectedVersion>=2147483647)throw new HttpError(422,'Consulta una versión válida de la orden.');
 if(typeof body.note!=='string')throw new HttpError(422,'Indica el motivo de la asignación.');
 const note=body.note.trim().normalize('NFC');
 if(note.length<3||note.length>500||/[\u0000-\u001f\u007f]/.test(note))throw new HttpError(422,'El motivo requiere de 3 a 500 caracteres sin controles.');
 return {technicianId:body.technicianId,expectedVersion:body.expectedVersion,note};
}
export function validateOrder(body){
 const errors={};
 if(!body||typeof body!=='object'||Array.isArray(body))throw new HttpError(422,'Revisa los datos de recepción.');
 const allowed=['clientName','phone','email','deviceType','brand','model','serialNumber','serialUnavailableReason','reportedFault','physicalCondition','accessories','accessoriesConfirmed','physicalCheckConfirmed'];
 for(const key of Object.keys(body))if(!allowed.includes(key))errors[key]='Campo no permitido.';
 function str(key,min,max,optional=false){const raw=body[key];if(optional&&(raw===undefined||raw===null||raw===''))return null;if(typeof raw!=='string'){errors[key]='Introduce texto válido.';return '';}
 const v=raw.trim().normalize('NFC');if(v.length<min||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))errors[key]=`Usa entre ${min} y ${max} caracteres válidos.`;return v;}
 const result={clientName:str('clientName',2,120),phone:str('phone',7,30),email:str('email',3,254,true),deviceType:str('deviceType',2,80),brand:str('brand',1,80),model:str('model',1,120),serialNumber:str('serialNumber',1,120,true),serialUnavailableReason:str('serialUnavailableReason',3,200,true),reportedFault:str('reportedFault',5,2000),physicalCondition:str('physicalCondition',5,2000)};
 if(!/^[+\d() .-]+$/.test(result.phone)||result.phone.replace(/\D/g,'').length<7||result.phone.replace(/\D/g,'').length>15)errors.phone='Indica un teléfono de 7 a 15 dígitos.';
 if(result.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))errors.email='Revisa el correo.';
 if(Boolean(result.serialNumber)===Boolean(result.serialUnavailableReason))errors.serialNumber='Indica la serie o el motivo por el que no está disponible.';
 if(body.accessoriesConfirmed!==true)errors.accessoriesConfirmed='Confirma accesorios o ninguno.';
 if(body.physicalCheckConfirmed!==true)errors.physicalCheckConfirmed='Confirma el cotejo físico.';
 if(!Array.isArray(body.accessories)||body.accessories.length>20||body.accessories.some(x=>typeof x!=='string'||x.trim().length<1||x.trim().length>120||/[\u0000-\u001f\u007f]/.test(x)))errors.accessories='Máximo 20 accesorios, de 1 a 120 caracteres cada uno.';
 result.accessories=Array.isArray(body.accessories)?body.accessories.filter(x=>typeof x==='string').map(x=>x.trim().normalize('NFC')):[];result.accessoriesConfirmed=true;result.physicalCheckConfirmed=true;
 if(Object.keys(errors).length)throw new HttpError(422,'Revisa los campos indicados.',errors);return result;
}

export function validateInternalUserId(userId) {
  if (typeof userId !== 'string' || !uuidPattern.test(userId)) {
    throw new HttpError(404, 'Cuenta interna no encontrada.');
  }
  return userId;
}
