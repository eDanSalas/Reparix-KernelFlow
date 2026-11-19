import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function hashPassword(password){const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;}
const dummy=hashPassword('dummy-password-for-constant-work');
export function verifyPassword(password,stored=dummy){const [salt,key]=stored.split(':');const actual=scryptSync(password,salt,64),expected=Buffer.from(key,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);}
export const cookieOptions=production=>({httpOnly:true,sameSite:'strict',secure:production,path:'/api',maxAge:8*60*60*1000});