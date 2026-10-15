import { systemPathFor } from '../lib/phoneAuthCore';

// expo-router calls this for every link the system hands the app. The Google
// sign in returns belific://auth-callback?...; without this the router would try
// to open a screen called "auth-callback". The link is read by
// lib/phoneGoogleAuth.ts (Linking), so the router only needs to stay on or go
// to Settings, where the sign in was started. Every other path is left alone.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return systemPathFor(path);
}
