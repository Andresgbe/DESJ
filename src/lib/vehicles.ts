// Módulo Vehículo: la ficha (marca, modelo, placa, kilometraje), los mantenimientos (con el próximo por km o por
// fecha) y los papeles (seguro, revisión, título…) con vencimiento y foto/PDF. Un vehículo = un módulo.
// - Con sesión: tablas vehicles, vehicle_services, vehicle_documents (privadas por usuario); archivos en
//   documentos/<usuario>/vehiculos/<módulo>/. DESJ los ve y registra mantenimientos desde el chat.
// - Sin nube: en el teléfono, sin archivos.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';

import type { Attachment } from '@/lib/attachments';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export type ServiceKind = 'aceite' | 'frenos' | 'cauchos' | 'bateria' | 'revision' | 'reparacion' | 'otro';
export type DocKind = 'seguro' | 'revision' | 'titulo' | 'permiso' | 'otro';

export const SERVICE_KINDS: { id: ServiceKind; label: string }[] = [
  { id: 'aceite', label: 'Aceite' },
  { id: 'frenos', label: 'Frenos' },
  { id: 'cauchos', label: 'Cauchos' },
  { id: 'bateria', label: 'Batería' },
  { id: 'revision', label: 'Revisión' },
  { id: 'reparacion', label: 'Reparación' },
  { id: 'otro', label: 'Otro' },
];
export const DOC_KINDS: { id: DocKind; label: string }[] = [
  { id: 'seguro', label: 'Seguro' },
  { id: 'revision', label: 'Revisión' },
  { id: 'titulo', label: 'Título' },
  { id: 'permiso', label: 'Permiso' },
  { id: 'otro', label: 'Otro' },
];

export type Vehicle = { brand: string; model: string; year: number | null; plate: string; color: string; odometer_km: number | null; odometer_on: string | null; notes: string };
export type Service = {
  id: string;
  service_date: string;
  km: number | null;
  kind: ServiceKind;
  title: string;
  cost: number | null;
  shop: string;
  notes: string;
  next_km: number | null;
  next_date: string | null;
  created_at: string;
};
export type ServiceInput = Omit<Service, 'id' | 'created_at'>;
export type VehicleDoc = {
  id: string;
  kind: DocKind;
  name: string;
  number: string;
  expires_on: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime: string | null;
  notes: string;
};
export type DocInput = Pick<VehicleDoc, 'kind' | 'name' | 'number' | 'expires_on' | 'notes'>;

export const EMPTY_VEHICLE: Vehicle = { brand: '', model: '', year: null, plate: '', color: '', odometer_km: null, odometer_on: null, notes: '' };

const SOON_DAYS = 30; // un papel o servicio "está por vencer" si faltan 30 días o menos
const SOON_KM = 1000; // o si al próximo servicio le faltan 1.000 km o menos

export const serviceLabel = (k: ServiceKind) => SERVICE_KINDS.find((s) => s.id === k)!.label;
export const docLabel = (k: DocKind) => DOC_KINDS.find((d) => d.id === k)!.label;
export const kmText = (n: number) => `${n.toLocaleString('es-VE')} km`;

const daysUntil = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86_400_000);
};

export type Upcoming = { key: string; title: string; detail: string; overdue: boolean };

/**
 * Lo que viene: papeles que vencen pronto o ya vencieron, y el próximo servicio de cada tipo (por km o fecha)
 * cuando falta poco o ya pasó. Solo cuenta el servicio más reciente de cada tipo.
 */
export function upcoming(vehicle: Vehicle | null, services: Service[], docs: VehicleDoc[]): Upcoming[] {
  const out: Upcoming[] = [];
  for (const d of docs) {
    if (!d.expires_on) continue;
    const days = daysUntil(d.expires_on);
    if (days > SOON_DAYS) continue;
    out.push({
      key: `d${d.id}`,
      title: `${d.name}${days < 0 ? ' vencido' : ' vence pronto'}`,
      detail: days < 0 ? `Venció hace ${-days} ${days === -1 ? 'día' : 'días'}` : days === 0 ? 'Vence hoy' : `Vence en ${days} ${days === 1 ? 'día' : 'días'}`,
      overdue: days < 0,
    });
  }
  const latest = new Map<ServiceKind, Service>();
  for (const s of [...services].sort((a, b) => b.service_date.localeCompare(a.service_date))) if (!latest.has(s.kind)) latest.set(s.kind, s);
  const km = vehicle?.odometer_km ?? null;
  for (const s of latest.values()) {
    const name = s.kind === 'otro' || s.kind === 'reparacion' ? s.title || serviceLabel(s.kind) : serviceLabel(s.kind);
    if (s.next_km !== null && km !== null) {
      const left = s.next_km - km;
      if (left <= SOON_KM) {
        out.push({ key: `k${s.id}`, title: `Toca ${name.toLowerCase()}`, detail: left < 0 ? `Se pasó por ${kmText(-left)} (tocaba a los ${kmText(s.next_km)})` : `Faltan ${kmText(left)} (a los ${kmText(s.next_km)})`, overdue: left < 0 });
        continue;
      }
    }
    if (s.next_date) {
      const days = daysUntil(s.next_date);
      if (days <= SOON_DAYS) out.push({ key: `t${s.id}`, title: `Toca ${name.toLowerCase()}`, detail: days < 0 ? `Tocaba hace ${-days} días` : `En ${days} días`, overdue: days < 0 });
    }
  }
  return out.sort((a, b) => Number(b.overdue) - Number(a.overdue));
}

const byDate = (a: Service, b: Service) => b.service_date.localeCompare(a.service_date) || b.created_at.localeCompare(a.created_at);
const byExpiry = (a: VehicleDoc, b: VehicleDoc) => (a.expires_on ?? '9999').localeCompare(b.expires_on ?? '9999');

type LocalState = { vehicle: Vehicle; services: Service[]; docs: VehicleDoc[] };
const localKey = (id: string) => `desj:vehicle:${id}`;
async function readLocal(id: string): Promise<LocalState> {
  try {
    const raw = await AsyncStorage.getItem(localKey(id));
    if (raw) return { vehicle: EMPTY_VEHICLE, services: [], docs: [], ...JSON.parse(raw) };
  } catch {
    // sin copia local
  }
  return { vehicle: EMPTY_VEHICLE, services: [], docs: [] };
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const SERVICE_COLS = 'id, service_date, km, kind, title, cost, shop, notes, next_km, next_date, created_at';
const DOC_COLS = 'id, kind, name, number, expires_on, storage_path, file_name, mime, notes';
const VEHICLE_COLS = 'brand, model, year, plate, color, odometer_km, odometer_on, notes';

export function useVehicle(moduleId: string) {
  const { session } = useAuth();
  const cloud = Boolean(session);
  const userId = session?.user.id ?? null;
  const [vehicle, setVehicle] = useState<Vehicle>(EMPTY_VEHICLE);
  const [services, setServices] = useState<Service[]>([]);
  const [docs, setDocs] = useState<VehicleDoc[]>([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    if (cloud) {
      const [v, s, d] = await Promise.all([
        supabase.from('vehicles').select(VEHICLE_COLS).eq('module_id', moduleId).maybeSingle(),
        supabase.from('vehicle_services').select(SERVICE_COLS).eq('module_id', moduleId).order('service_date', { ascending: false }),
        supabase.from('vehicle_documents').select(DOC_COLS).eq('module_id', moduleId),
      ]);
      setVehicle(v.data ? (v.data as Vehicle) : EMPTY_VEHICLE);
      if (s.data) setServices(s.data.map((r) => ({ ...r, cost: num(r.cost) }) as Service).sort(byDate));
      if (d.data) setDocs((d.data as VehicleDoc[]).sort(byExpiry));
    } else {
      const local = await readLocal(moduleId);
      setVehicle(local.vehicle);
      setServices([...local.services].sort(byDate));
      setDocs([...local.docs].sort(byExpiry));
    }
    setReady(true);
  }, [cloud, moduleId]);

  const persistLocal = async (patch: Partial<LocalState>) => {
    const next = { ...(await readLocal(moduleId)), ...patch };
    await AsyncStorage.setItem(localKey(moduleId), JSON.stringify(next));
  };

  const saveVehicle = async (v: Vehicle) => {
    if (cloud) {
      const { error } = await supabase.from('vehicles').upsert({ ...v, module_id: moduleId, updated_at: new Date().toISOString() }, { onConflict: 'module_id' });
      if (error) throw new Error('No pude guardar la ficha. Revisa tu conexión.');
    } else await persistLocal({ vehicle: v });
    setVehicle(v);
  };

  /** Actualiza el kilometraje si el nuevo es mayor (un servicio con km más alto también lo sube). */
  const bumpOdometer = async (km: number | null, date: string) => {
    if (km === null || (vehicle.odometer_km !== null && km <= vehicle.odometer_km)) return;
    await saveVehicle({ ...vehicle, odometer_km: km, odometer_on: date });
  };

  const saveService = async (input: ServiceInput, id?: string) => {
    let saved: Service;
    if (cloud) {
      const res = id
        ? await supabase.from('vehicle_services').update(input).eq('id', id).select(SERVICE_COLS).single()
        : await supabase.from('vehicle_services').insert({ ...input, module_id: moduleId }).select(SERVICE_COLS).single();
      if (res.error || !res.data) throw new Error('No pude guardar el mantenimiento. Revisa tu conexión.');
      saved = { ...res.data, cost: num(res.data.cost) } as Service;
    } else {
      const local = await readLocal(moduleId);
      saved = id ? { ...local.services.find((s) => s.id === id)!, ...input } : { ...input, id: `s${Date.now()}`, created_at: new Date().toISOString() };
      await persistLocal({ services: [...local.services.filter((s) => s.id !== saved.id), saved] });
    }
    setServices((list) => [...list.filter((s) => s.id !== saved.id), saved].sort(byDate));
    await bumpOdometer(input.km, input.service_date);
  };

  const removeService = async (id: string) => {
    setServices((list) => list.filter((s) => s.id !== id));
    if (cloud) await supabase.from('vehicle_services').delete().eq('id', id);
    else await persistLocal({ services: (await readLocal(moduleId)).services.filter((s) => s.id !== id) });
  };

  /** Crea o edita un papel; con `file`, sube (o reemplaza) su foto o PDF. */
  const saveDoc = async (input: DocInput, file: Attachment | null, id?: string) => {
    const row = { ...input, name: input.name.trim().slice(0, 120), number: input.number.trim(), notes: input.notes.trim() };
    if (!cloud) {
      const local = await readLocal(moduleId);
      const saved: VehicleDoc = id ? { ...local.docs.find((d) => d.id === id)!, ...row } : { ...row, id: `d${Date.now()}`, storage_path: null, file_name: null, mime: null };
      await persistLocal({ docs: [...local.docs.filter((d) => d.id !== saved.id), saved] });
      setDocs((list) => [...list.filter((d) => d.id !== saved.id), saved].sort(byExpiry));
      return;
    }
    let filePatch = {};
    const old = id ? docs.find((d) => d.id === id) : undefined;
    if (file && userId) {
      const safe = file.name.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-80);
      const path = `${userId}/vehiculos/${moduleId}/${Date.now()}-${safe}`;
      const body = await (await fetch(file.uri)).arrayBuffer();
      const up = await supabase.storage.from('documentos').upload(path, body, { contentType: file.mimeType });
      if (up.error) throw new Error('No pude subir el archivo. Revisa tu conexión.');
      filePatch = { storage_path: path, file_name: file.name.slice(0, 200), mime: file.mimeType };
    }
    const res = id
      ? await supabase.from('vehicle_documents').update({ ...row, ...filePatch }).eq('id', id).select(DOC_COLS).single()
      : await supabase.from('vehicle_documents').insert({ ...row, ...filePatch, module_id: moduleId }).select(DOC_COLS).single();
    if (res.error || !res.data) throw new Error('No pude guardar el papel. Revisa tu conexión.');
    if (file && old?.storage_path) await supabase.storage.from('documentos').remove([old.storage_path]);
    const saved = res.data as VehicleDoc;
    setDocs((list) => [...list.filter((d) => d.id !== saved.id), saved].sort(byExpiry));
  };

  const removeDoc = async (d: VehicleDoc) => {
    setDocs((list) => list.filter((x) => x.id !== d.id));
    if (cloud) {
      if (d.storage_path) await supabase.storage.from('documentos').remove([d.storage_path]);
      await supabase.from('vehicle_documents').delete().eq('id', d.id);
    } else await persistLocal({ docs: (await readLocal(moduleId)).docs.filter((x) => x.id !== d.id) });
  };

  /** Enlace temporal (10 min) del archivo de un papel; con `download`, se baja con su nombre. */
  const docUrl = useCallback(async (d: VehicleDoc, download = false) => {
    if (!d.storage_path) return null;
    const { data } = await supabase.storage.from('documentos').createSignedUrl(d.storage_path, 600, download ? { download: d.file_name ?? true } : undefined);
    return data?.signedUrl ?? null;
  }, []);

  return { cloud, ready, vehicle, services, docs, reload, saveVehicle, saveService, removeService, saveDoc, removeDoc, docUrl };
}
