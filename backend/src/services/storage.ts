// Supabase Storage: signed upload URLs for instructors, and signed read URLs for passage media.
// This is the only file that talks to Supabase. The database stores only object paths
// (passages_media.media_path), never URLs, because signed URLs expire (docs/ERD.md).
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// How long a signed read URL (Passage.mediaUrl) stays valid: 1 hour, as in the contract.
// Signed upload URLs always last 2 hours; Supabase doesn't let us choose.
const READ_URL_SECONDS = 60 * 60;

let client: SupabaseClient | null = null;

// The bucket to use, or null when the SUPABASE_* variables are missing (e.g. local dev without
// a Supabase project, or the tests). The env is read on every call so the app can start without it.
const getBucket = () => {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  if (!url || !serviceRoleKey || !bucket) return null;

  // A server-side client: no user session to store or refresh
  client ??= createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client.storage.from(bucket);
};

// The object path for a new upload: "<userId>/<random id>-<safe file name>".
// The random id keeps two uploads of "part1.mp3" apart. The file name is made safe for Storage
// object keys: lowercase, and every run of other characters becomes one "-".
export const buildObjectPath = (userId: number, fileName: string) => {
  let safeName = fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  if (safeName === "") safeName = "file";

  return `${userId}/${randomUUID()}-${safeName}`;
};

// A signed URL the client PUTs the file to, and the path to send back as `mediaPath`
export const createUploadTicket = async (userId: number, fileName: string) => {
  const bucket = getBucket();
  if (!bucket) {
    throw new Error(
      "Supabase Storage is not configured: set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_STORAGE_BUCKET",
    );
  }

  const path = buildObjectPath(userId, fileName);
  const { data, error } = await bucket.createSignedUploadUrl(path);
  if (error) {
    throw new Error(`Supabase Storage could not create an upload URL: ${error.message}`);
  }

  return { uploadUrl: data.signedUrl, path };
};

// Signs read URLs for many object paths with one Storage request: path -> signed URL.
// A path that can't be signed (no such file yet, Storage not configured or down) is left out of
// the map, so its passage gets `mediaUrl: null` and the lesson still opens.
export const signMediaUrls = async (paths: string[]) => {
  const urls = new Map<string, string>();
  const uniquePaths = [...new Set(paths)];
  if (uniquePaths.length === 0) return urls;

  const bucket = getBucket();
  if (!bucket) {
    console.warn("Supabase Storage is not configured, so media URLs are null");
    return urls;
  }

  try {
    const { data, error } = await bucket.createSignedUrls(uniquePaths, READ_URL_SECONDS);
    if (error) {
      console.warn(`Supabase Storage could not sign media URLs: ${error.message}`);
      return urls;
    }

    for (const item of data) {
      if (item.path && item.signedUrl && !item.error) {
        urls.set(item.path, item.signedUrl);
      }
    }
  } catch (err) {
    // Network failures are thrown rather than returned as `error`
    console.warn("Supabase Storage could not sign media URLs:", err);
  }
  return urls;
};
