declare module 'npm-registry-fetch' {
  interface FetchOptions {
    preferOnline?: boolean;
    [key: string]: unknown;
  }

  interface RegistryFetch {
    json(url: string, options?: FetchOptions): Promise<unknown>;
  }

  const registryFetch: RegistryFetch;
  export default registryFetch;
}
