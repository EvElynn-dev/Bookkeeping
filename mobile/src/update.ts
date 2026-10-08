import { Alert, Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { API_URL, AppUpdate, api } from './api';

const currentVersion = Constants.expoConfig?.version ?? '0.1.0';

function versionParts(version: string): number[] {
  return version.split('.').map((part) => Number.parseInt(part, 10) || 0);
}

function isNewer(remote: string, local: string): boolean {
  const remoteParts = versionParts(remote);
  const localParts = versionParts(local);
  for (let index = 0; index < Math.max(remoteParts.length, localParts.length); index += 1) {
    const remotePart = remoteParts[index] ?? 0;
    const localPart = localParts[index] ?? 0;
    if (remotePart !== localPart) return remotePart > localPart;
  }
  return false;
}

function absoluteUrl(path?: string | null): string | null {
  if (!path) return null;
  return path.startsWith('http://') || path.startsWith('https://') ? path : `${API_URL}${path}`;
}

export async function checkForAppUpdate(): Promise<void> {
  try {
    const update: AppUpdate = await api.getAppUpdate();
    if (!isNewer(update.latest_version, currentVersion)) return;

    if (Platform.OS === 'android') {
      const downloadUrl = absoluteUrl(update.android_path);
      if (!downloadUrl) return;
      Alert.alert(
        `发现新版本 ${update.latest_version}`,
        update.notes ?? '下载后安装即可更新。Android 会在系统安装确认页询问你的同意。',
        [
          { text: '稍后', style: 'cancel' },
          { text: '下载更新', onPress: () => { void Linking.openURL(downloadUrl); } },
        ],
      );
      return;
    }

    Alert.alert(
      `发现新版本 ${update.latest_version}`,
      'iPhone 版本不能从自有服务器直接替换，请通过 App Store 或 TestFlight 更新。',
      update.ios_url ? [{ text: '稍后', style: 'cancel' }, { text: '打开更新页面', onPress: () => { void Linking.openURL(update.ios_url as string); } }] : [{ text: '知道了' }],
    );
  } catch {
    // Updating is best effort and must not prevent the ledger from opening offline.
  }
}
