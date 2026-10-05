import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AppState, Platform, type AppStateStatus } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { requestPermissions } from '../lib/notifications';
import { seedDevEvents } from '../lib/devSeed';
import { migrateToSyncableSchema } from '../lib/storage';
import { runFullSync } from '../lib/sync';
import { Colors } from '../lib/theme';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): { hasError: boolean; errorMessage: string } {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.title}>Something went wrong</Text>
          <Text style={errorStyles.message}>{this.state.errorMessage}</Text>
          <TouchableOpacity
            style={errorStyles.button}
            onPress={() => this.setState({ hasError: false, errorMessage: '' })}
            accessibilityLabel="Restart app"
            accessibilityRole="button"
          >
            <Text style={errorStyles.buttonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
  },
  buttonText: {
    color: Colors.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
});

function RootLayoutInner() {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    (async () => {
      // Must run before anything else touches storage — every load/save
      // path below (and every screen's useFocusEffect) assumes updatedAt
      // already exists on every row.
      await migrateToSyncableSchema();
      await seedDevEvents();
      // Desktop notifications are the Electron main process's job (decision
      // 017); expo-notifications has no scheduler on web.
      if (Platform.OS !== 'web') await requestPermissions();
      // Catches anything the per-write fire-and-forget pushes in
      // storage.ts missed (offline at the time, app killed mid-push,
      // etc.) — a no-op if signed out, which is the default state.
      runFullSync().catch(() => {});
    })();

    // Reconcile again on every foreground, not just cold launch — the
    // no-timer, no-polling trigger from the accounts plan. A background
    // → active transition is the only other point a device is likely to
    // have missed something (came back online, another device pushed
    // changes while this one was backgrounded).
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        runFullSync().catch(() => {});
      }
      appState.current = next;
    });
    return () => subscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <RootLayoutInner />
    </ErrorBoundary>
  );
}
