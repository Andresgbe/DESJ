// Adjuntos del chat y de Salud: elegir fotos / tomar foto / elegir archivos (varios a la vez), y subirlos a la
// carpeta privada del usuario.
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

export type Attachment = { uri: string; name: string; mimeType: string; size: number | null };
export type Uploaded = { path: string; name: string; mime: string };

export const MAX_BYTES = 10 * 1024 * 1024; // 10 MB (las imágenes se limitan a 5 MB por Claude)
export const MAX_FILES = 5; // archivos por mensaje
export const MAX_TOTAL = 18 * 1024 * 1024; // entre todos: Claude recibe el mensaje completo de una vez
const READABLE = /^(image\/(jpeg|png|gif|webp)|application\/pdf|text\/.+)$/;

/**
 * Elige hasta `max` archivos (galería y archivo permiten varios; la cámara, uno). [] = cancelado.
 * Lanza Error con un mensaje para la persona si alguno no sirve.
 */
export async function pickAttachments(source: 'galeria' | 'camara' | 'archivo', max = MAX_FILES): Promise<Attachment[]> {
  let list: Attachment[];
  if (source === 'archivo') {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*', 'text/*'], copyToCacheDirectory: true, multiple: max > 1 });
    if (res.canceled) return [];
    list = res.assets.map((f) => ({ uri: f.uri, name: f.name, mimeType: f.mimeType ?? 'application/octet-stream', size: f.size ?? null }));
  } else {
    const perm = source === 'camara' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new Error(`Necesito permiso para usar la ${source === 'camara' ? 'cámara' : 'galería'}. Actívalo en Ajustes › DESJ.`);
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', quality: 0.6, allowsMultipleSelection: source === 'galeria' && max > 1, selectionLimit: max };
    const res = source === 'camara' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled) return [];
    list = res.assets.map((f, i) => ({ uri: f.uri, name: f.fileName ?? `foto-${Date.now()}-${i + 1}.jpg`, mimeType: f.mimeType ?? 'image/jpeg', size: f.fileSize ?? null }));
  }
  if (list.length > max) throw new Error(`Puedes adjuntar hasta ${MAX_FILES} archivos por mensaje.`);
  const bad = list.find((a) => !READABLE.test(a.mimeType));
  if (bad) throw new Error(`"${bad.name}": por ahora DESJ lee fotos, PDF y archivos de texto.`);
  const big = list.find((a) => a.size && a.size > MAX_BYTES);
  if (big) throw new Error(`"${big.name}" pesa más de 10 MB.`);
  return list;
}

/** Sube el adjunto a documentos/<usuario>/chat/ y lo registra en la tabla documents. */
export async function uploadAttachment(a: Attachment, userId: string): Promise<Uploaded> {
  const safe = a.name.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-80);
  const path = `${userId}/chat/${Date.now()}-${safe}`;
  const body = await (await fetch(a.uri)).arrayBuffer();
  const { error } = await supabase.storage.from('documentos').upload(path, body, { contentType: a.mimeType });
  if (error) throw new Error('No pude subir el archivo. Revisa tu conexión.');
  await supabase.from('documents').insert({ title: a.name, kind: 'otro', storage_path: path });
  return { path, name: a.name, mime: a.mimeType };
}
