// Adjuntos del chat: elegir foto / tomar foto / elegir archivo, y subirlos a la carpeta privada del usuario.
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

export type Attachment = { uri: string; name: string; mimeType: string; size: number | null };
export type Uploaded = { path: string; name: string; mime: string };

export const MAX_BYTES = 10 * 1024 * 1024; // 10 MB (las imágenes se limitan a 5 MB por Claude)
const READABLE = /^(image\/(jpeg|png|gif|webp)|application\/pdf|text\/.+)$/;

/** null = cancelado. Lanza Error con un mensaje para la persona si el archivo no sirve. */
export async function pickAttachment(source: 'galeria' | 'camara' | 'archivo'): Promise<Attachment | null> {
  let a: Attachment;
  if (source === 'archivo') {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*', 'text/*'], copyToCacheDirectory: true });
    if (res.canceled) return null;
    const f = res.assets[0];
    a = { uri: f.uri, name: f.name, mimeType: f.mimeType ?? 'application/octet-stream', size: f.size ?? null };
  } else {
    const perm = source === 'camara' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new Error(`Necesito permiso para usar la ${source === 'camara' ? 'cámara' : 'galería'}. Actívalo en Ajustes › DESJ.`);
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', quality: 0.6 };
    const res = source === 'camara' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled) return null;
    const f = res.assets[0];
    a = { uri: f.uri, name: f.fileName ?? `foto-${Date.now()}.jpg`, mimeType: f.mimeType ?? 'image/jpeg', size: f.fileSize ?? null };
  }
  if (!READABLE.test(a.mimeType)) throw new Error('Por ahora DESJ lee fotos, PDF y archivos de texto.');
  if (a.size && a.size > MAX_BYTES) throw new Error('El archivo pesa más de 10 MB.');
  return a;
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
