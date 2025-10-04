declare module 'npm-registry-fetch' {
  interface FetchOptions {
    preferOnline?: boolean;
    [key: string]: unknown;
  }

  function json(url: string, options?: FetchOptions): Promise<unknown>;

  export default {
    json,
  };
}
