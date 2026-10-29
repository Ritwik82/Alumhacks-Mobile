import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';

const INITIAL_URL = '';

export default function App() {
  const [urlText, setUrlText] = useState(INITIAL_URL);
  const [appUrl, setAppUrl] = useState(INITIAL_URL);
  const [editing, setEditing] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pageCanGoBack, setPageCanGoBack] = useState(false);
  const webViewRef = useRef(null);
  const allowedOrigin = useMemo(() => {
    try { return new URL(appUrl).origin; } catch { return ''; }
  }, [appUrl]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!editing && pageCanGoBack) {
        webViewRef.current?.injectJavaScript("window.dispatchEvent(new Event('alumhacks-back')); true;");
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [editing, pageCanGoBack]);

  function handleWebMessage({ nativeEvent }) {
    try {
      const message = JSON.parse(nativeEvent.data);
      if (message.type === 'route') setPageCanGoBack(Boolean(message.canGoBack));
    } catch { /* Ignore messages that are not route state. */ }
  }

  function connect() {
    const candidate = urlText.trim().replace(/\/$/, '');
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'http:' || !parsed.port || parsed.pathname !== '/') {
        throw new Error('Use the full local URL printed by the Alumhacks server, including :8787.');
      }
      setError('');
      setLoading(true);
      setAppUrl(candidate);
      setEditing(false);
    } catch (err) {
      setError(err.message || 'Enter a valid local URL, for example http://192.168.1.20:8787');
      setEditing(true);
    }
  }

  if (editing) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.panel}>
            <Text style={styles.kicker}>ALUMHACKS MOBILE</Text>
            <Text style={styles.title}>Connect to your computer</Text>
            <Text style={styles.help}>Start Start Alumhacks.bat on your computer. In its server window, find the “Phone on the same Wi-Fi” address and enter it below.</Text>
            <TextInput
              value={urlText}
              onChangeText={setUrlText}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="http://192.168.1.20:8787"
              style={styles.input}
              accessibilityLabel="Alumhacks computer server URL"
              onSubmitEditing={connect}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity style={styles.button} onPress={connect} accessibilityRole="button">
              <Text style={styles.buttonText}>Open Alumhacks</Text>
            </TouchableOpacity>
            <Text style={styles.footnote}>Your phone and computer must be on the same trusted Wi-Fi network.</Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.webContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#fafafa" />
      {loading ? <ActivityIndicator style={styles.spinner} color="#79a91e" size="large" /> : null}
      <WebView
        ref={webViewRef}
        source={{ uri: appUrl }}
        style={styles.webview}
        userAgent="AlumHacksMobile/1.0"
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="never"
        allowsBackForwardNavigationGestures
        onMessage={handleWebMessage}
        onLoadStart={() => { setLoading(true); setError(''); }}
        onLoadEnd={() => setLoading(false)}
        onError={({ nativeEvent }) => {
          setLoading(false);
          setError(nativeEvent.description || 'Could not reach the Alumhacks server.');
        }}
        onHttpError={({ nativeEvent }) => {
          if (nativeEvent.statusCode >= 400) setError(`Server returned HTTP ${nativeEvent.statusCode}.`);
        }}
        onShouldStartLoadWithRequest={request => {
          try {
            if (request.url === 'about:blank' || new URL(request.url).origin === allowedOrigin) return true;
          } catch { /* Reject malformed or non-web navigation. */ }
          setError('This link is outside the Alumhacks server.');
          return false;
        }}
      />
      {error ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorBarText} numberOfLines={2}>{error}</Text>
          <TouchableOpacity onPress={() => { setError(''); setEditing(true); }} accessibilityRole="button">
            <Text style={styles.changeText}>SETUP</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f8f5' },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  panel: { width: '100%', maxWidth: 430, alignSelf: 'center', padding: 22, backgroundColor: '#fff', borderRadius: 20, elevation: 3 },
  kicker: { color: '#79a91e', fontSize: 12, fontWeight: '700', letterSpacing: 1.2, marginBottom: 12 },
  title: { color: '#262a2c', fontSize: 25, fontWeight: '700', marginBottom: 10 },
  help: { color: '#68706b', fontSize: 15, lineHeight: 22, marginBottom: 20 },
  input: { minHeight: 50, borderWidth: 1, borderColor: '#dfe4dc', borderRadius: 10, paddingHorizontal: 13, fontSize: 15, color: '#262a2c' },
  error: { color: '#c43e35', fontSize: 13, lineHeight: 19, marginTop: 9 },
  button: { minHeight: 50, justifyContent: 'center', alignItems: 'center', backgroundColor: '#82ae25', borderRadius: 10, marginTop: 15 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footnote: { color: '#8b9091', fontSize: 12, lineHeight: 17, marginTop: 15 },
  webContainer: { flex: 1, backgroundColor: '#fafafa' },
  webview: { flex: 1, backgroundColor: '#fafafa' },
  spinner: { position: 'absolute', zIndex: 2, alignSelf: 'center', top: '48%' },
  errorBar: { position: 'absolute', left: 12, right: 12, bottom: 18, padding: 12, borderRadius: 12, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 10, elevation: 5 },
  errorBarText: { flex: 1, color: '#bd3b33', fontSize: 12 },
  changeText: { color: '#638f17', fontSize: 12, fontWeight: '700' },
});
