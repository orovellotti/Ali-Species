/**
 * Route an external image URL through the API image proxy (avoids mixed-content
 * and hotlink issues). Relative/local URLs are returned untouched.
 */
export function proxyImg(url: string | undefined | null): string {
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) return url;
  return `${import.meta.env.BASE_URL}api/image-proxy?url=${encodeURIComponent(url)}`;
}
