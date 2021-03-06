import { getGlobalData } from '@tencent/abcmouse-sdk-mp-tools';
import Log from './libs/log';
// 测试文件依赖使用
import filePng from './assets/img/file.png';
import fileJpg from './assets/img/file.jpg';

// 网络中断提醒
wx.onNetworkStatusChange(({ isConnected }) => {
  if (!isConnected) {
    wx.showModal({
      title: '提示',
      content: '网络连接中断了，可能会影响到您的使用噢',
      confirmColor: '#009eef',
      confirmText: '知道了',
      showCancel: false,
    });
  }
});

App({
  globalData: {
    filePng,
  },
  onLaunch() {
    new Log().log(String(new Date().getHours()).padStart(2, '0'));
    getGlobalData('memberid');
  },

  test(a: string) {
    console.log(a);
  },

  onPageNotFound() {
    wx.redirectTo({
      url: 'pages/index/index',
    });
  },
});

// // 让 ts 把文件当成模块处理，而不是当成声明
export {};
