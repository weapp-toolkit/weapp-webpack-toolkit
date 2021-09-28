import fsx from 'fs-extra';
import { IWeappAppConfig } from '@weapp-toolkit/weapp-types';
import { Compiler } from 'webpack';
import { Resolver } from '@weapp-toolkit/core';
import { APP_GROUP_NAME, APP_PACKAGE_NAME, CUSTOM_TAB_BAR_CONTEXT } from '../../utils/constant';
import { DependencyTreeNode } from './TreeNode';

/**
 * 依赖树初始化选项
 */
export interface IDependencyTreeOptions {
  /** 忽略的路径 */
  ignores?: RegExp[];
  /** 路径解析器 */
  resolver: Resolver;
  /** app 文件夹 */
  context: string;
  /** 入口文件 */
  app: string;
  compiler: Compiler;
}

/** 依赖树 */
export class DependencyTree extends DependencyTreeNode {
  /** 缓存的模块映射 */
  private _modulesMap: Map<string, DependencyTreeNode> | undefined;

  public compiler: Compiler;

  constructor(options: IDependencyTreeOptions) {
    const { resolver, context, app, ignores = [], compiler } = options;

    super({
      appRoot: context,
      packageName: APP_PACKAGE_NAME,
      packageGroup: APP_GROUP_NAME,
      resolver,
      ignores,
      pathname: app,
    });
    this.compiler = compiler;
  }

  /**
   * 构建依赖树
   * @param callback 构建完成回调函数
   */
  public build(): void {
    const { resolve } = this;
    const appJsonPath = resolve('app.json');
    const appJson: IWeappAppConfig = fsx.readJSONSync(appJsonPath);

    this.addAppChunk(appJson);
  }

  /**
   * 获取模块映射
   */
  public getModuleMaps(): Map<string, DependencyTreeNode> {
    if (!this._modulesMap) {
      this._modulesMap = super.getModuleMaps();
    }

    return this._modulesMap;
  }

  public resetModuleMaps() {
    this._modulesMap = undefined;
  }

  /**
   * 添加 app chunk
   */
  private addAppChunk(appJson: IWeappAppConfig) {
    const { pages, usingComponents = {}, tabBar } = appJson;

    /** 添加同名资源文件 */
    this.addAllAssets();
    /** 添加主包里的 pages */
    this.addAllToModule(APP_PACKAGE_NAME, APP_GROUP_NAME, pages);
    /** 添加主包使用的 components */
    this.addAllToModule(APP_PACKAGE_NAME, APP_GROUP_NAME, Object.values(usingComponents));
    /** 添加 TabBar */
    this.addTabBar(tabBar);
    /** 添加分包 chunk */
    this.addSubPackageChunk(appJson);
  }

  /**
   * 添加 TabBar
   */
  private addTabBar(tabBar: IWeappAppConfig['tabBar']) {
    if (!tabBar) {
      return;
    }

    const { custom, list = [] } = tabBar;

    /** 如果是自定义 TabBar，解析自定义 TabBar 文件夹依赖 */
    if (custom) {
      const tabBarEntryPath = this.resolve(CUSTOM_TAB_BAR_CONTEXT);
      this.addModule(APP_PACKAGE_NAME, APP_GROUP_NAME, tabBarEntryPath);
    }

    /** 获取 TabBar 列表配置里的图标资源 */
    const assets = list.reduce((resources: string[], listItem) => {
      const { iconPath, selectedIconPath } = listItem;

      /** 可能存在图标也可能不存在 */
      if (iconPath) {
        resources.push(iconPath);
      }

      /** 可能存在选中态图标也可能不存在 */
      if (selectedIconPath) {
        resources.push(selectedIconPath);
      }

      return resources;
    }, []);

    this.addAllToModule(APP_PACKAGE_NAME, APP_GROUP_NAME, assets);
  }

  /**
   * 添加分包 chunk
   */
  private addSubPackageChunk(appJson: IWeappAppConfig) {
    /** 两种字段在小程序里面都是合法的 */
    const subPackages = appJson.subpackages || appJson.subPackages || [];
    subPackages.map((subPackage) => {
      const { root, pages, independent } = subPackage;
      /** 根据分包路径生成 packageGroup */
      const packageGroup = root.replace(/\/$/, '');
      /** 获取分包根绝对路径，从小程序根路径开始查找 */
      const context = this.resolver.resolveDir(this.context, packageGroup);
      /** 以分包根路径作为 context 生成 resolve 函数 */
      const resolve = this.resolver.resolveDependencySync.bind(null, context);

      /** 如果是独立分包，单独为一个 chunk，否则加入 app chunk */
      return this.addAllToModule(packageGroup, independent ? packageGroup : APP_GROUP_NAME, pages, resolve);
    });
  }

  /**
   * 添加页面、组件依赖
   * @param packageGroup
   * @param resources
   * @param resolve
   */
  private addAllToModule(packageName: string, packageGroup: string, resources: string[], resolve = this.resolve) {
    resources.map((resource) => {
      /** 获取 js 路径 */
      const resourcePath = resolve(resource);
      /** 添加到 chunk */
      this.addModule(packageName, packageGroup, resourcePath);
    });
  }
}
