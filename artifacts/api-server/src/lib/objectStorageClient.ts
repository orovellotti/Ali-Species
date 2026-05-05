const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export interface SignUrlOpts {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}

export async function signObjectURL(opts: SignUrlOpts): Promise<string> {
  const body = {
    bucket_name: opts.bucketName,
    object_name: opts.objectName,
    method: opts.method,
    expires_at: new Date(Date.now() + opts.ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new Error(`signObjectURL failed (HTTP ${response.status})`);
  }
  const { signed_url: signedURL } = (await response.json()) as { signed_url: string };
  return signedURL;
}

export function getDefaultBucket(): string | null {
  return process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID || null;
}
