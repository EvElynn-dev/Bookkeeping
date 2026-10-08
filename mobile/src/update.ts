import { Alert, Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { API_URL, AppUpdate, api } from './api';

export const currentVersion = Constants.expoConfig?.version ?? '0.1.0';

export type UpdateCheckOptions = {
  notifyIfCurrent?: boolean;
  notifyOnError?: boolean;
};

export type UpdateCheckResult = 'updated' | 'current' | 'failed';

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

export async function checkForAppUpdate(options: UpdateCheckOptions = {}): Promise<UpdateCheckResult> {
  try {
    const update: AppUpdate = await api.getAppUpdate();
    if (!isNewer(update.latest_version, currentVersion)) {
      if (options.notifyIfCurrent) {
        Alert.alert('已是最新版本', `当前版本 ${currentVersion}，没有可用更新。`);
      }
      return 'current';
    }

    if (Platform.OS === 'android') {
      const downloadUrl = absoluteUrl(update.android_path);
      if (!downloadUrl) {
        if (options.notifyOnError) {
          Alert.alert('暂时无法更新', '服务器还没有提供 Android 安装包，请稍后再试。');
        }
        return 'failed';
      }
      Alert.alert(
        `发现新版本 ${update.latest_version}`,
        update.notes ?? '下载后安装即可更新。Android 会在系统安装确认页询问你的同意。',
        [
          { text: '稍后', style: 'cancel' },
          { text: '下载更新', onPress: () => { void Linking.openURL(downloadUrl); } },
        ],
      );
      return 'updated';
    }

    Alert.alert(
      `发现新版本 ${update.latest_version}`,
      'iPhone 版本不能从自有服务器直接替换，请通过 App Store 或 TestFlight 更新。',
      update.ios_url ? [{ text: '稍后', style: 'cancel' }, { text: '打开更新页面', onPress: () => { void Linking.openURL(update.ios_url as string); } }] : [{ text: '知道了' }],
    );
    return 'updated';
  } catch {
    // Updating is best effort and must not prevent the ledger from opening offline.
    if (options.notifyOnError) {
      Alert.alert('检查更新失败', '暂时无法连接更新服务器，请确认网络后重试。');
    }
    return 'failed';
  }
}
