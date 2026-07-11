import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { FileOpener } from '@capacitor-community/file-opener';

// 票务链接来自抓取的平台 HTML（不可信输入）：只放行 http(s)，
// 挡掉 javascript:/data:/intent: 等危险 scheme，避免被注入的 href 直达浏览器/AppLauncher。
const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

export async function openPurchaseUrl(url: string): Promise<void> {
  if (!url) return;
  let target: URL;
  try {
    target = new URL(url, window.location.href);
  } catch {
    return;
  }
  if (!SAFE_PROTOCOLS.has(target.protocol)) return;
  const href = target.toString();
  if (Capacitor.isNativePlatform()) {
    await AppLauncher.openUrl({ url: href });
    return;
  }
  window.open(href, '_blank', 'noopener,noreferrer');
}

// 把 .ics 交付给系统。原生端写入缓存文件后：
//  1) 首选 FileOpener（ACTION_VIEW text/calendar）——直接唤起日历 App 的导入界面，
//     这才是「导出到手机日历」。真机实测：Share 面板里根本没有日历目标
//     （Google 日历不注册 SEND text/calendar，只注册 VIEW），用户只能分享到聊天工具。
//  2) 设备没有可处理 text/calendar 的 App 时回退 Share（至少能存文件/传出去）。
// 网页端回退 Blob 下载。⚠️ Android System WebView 不支持 blob 下载——原生端必须走文件路径。
export async function deliverIcs(filename: string, content: string): Promise<void> {
  if (!content) return;
  const safeName = filename.replace(/[\\/:*?"<>|\s]+/g, '_');
  if (Capacitor.isNativePlatform()) {
    const written = await Filesystem.writeFile({
      path: safeName,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    try {
      await FileOpener.open({ filePath: written.uri, contentType: 'text/calendar' });
    } catch {
      await Share.share({ title: filename, url: written.uri, dialogTitle: filename });
    }
    return;
  }
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', safeName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
