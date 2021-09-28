import path from 'path';
import { Compilation, NormalModule } from 'webpack';
import { replaceExt } from '@weapp-toolkit/core';
import { shouldIgnore } from '../../utils/ignore';
import {
  APP_GROUP_NAME,
  APP_PACKAGE_NAME,
  DEFAULT_ASSETS_MAP_IGNORES,
  PKG_OUTSIDE_DEP_DIRNAME,
  PKG_OUTSIDE_DEP_UPPER_DIRNAME,
  UPPER_DIR_SYMBOL_REG,
} from '../../utils/constant';
import { DependencyTree, DependencyTreeNode } from '../dependencyTree';

export interface IAssetsMapOptions {
  /** app 目录 */
  context: string;
  /** 独立分包外部依赖拷贝目录 */
  publicPath?: string;
  /** 忽略的文件（夹） */
  ignores?: Array<RegExp>;
  /** 依赖树实例 */
  dependencyTree: DependencyTree;
}

interface ModuleRelationship {
  parents?: Set<string>;
  chunkNames: Set<string>;
  module: NormalModule;
  /** loader 处理后的文件名 */
  basename: string;
  /** packageGroup => distFilepath */
  assetPathMap?: Map<string, string>;
}

export class AssetsMap {
  /** 静态资源模块依赖表 */
  public assetsRelationship = new Map<string, ModuleRelationship>();

  /** app 目录 */
  public context: string;

  /** 独立分包外部依赖拷贝目录 */
  public publicPath: string;

  /** 忽略的文件 */
  public ignores: Required<IAssetsMapOptions>['ignores'];

  /** 依赖树 */
  public dependencyTree: DependencyTree;

  constructor(options: IAssetsMapOptions) {
    this.context = options.context;
    this.ignores = DEFAULT_ASSETS_MAP_IGNORES.concat(options.ignores || []);
    this.publicPath = options.publicPath || PKG_OUTSIDE_DEP_DIRNAME;
    this.dependencyTree = options.dependencyTree;
  }

  public init(compilation: Compilation) {
    /**
     * 构建父子关联
     */
    compilation.modules.forEach((module) => {
      if (module instanceof NormalModule && !shouldIgnore(this.ignores, module.resource)) {
        /** 去除 query 的资源绝对路径 */
        const absolutePath = module.resource.replace(/\?.*$/, '');
        const { parentsPath, extname } = module.buildInfo;
        const chunks = compilation.chunkGraph.getModuleChunks(module);
        const chunkNames = new Set(chunks.map((chunk) => chunk.name));
        const basename = path.basename(extname ? replaceExt(absolutePath, extname) : absolutePath);

        // if (absolutePath.includes('level')) {
        //   console.info('skr: glob asset', { absolutePath });
        // }

        this.assetsRelationship.set(absolutePath, {
          chunkNames,
          parents: parentsPath,
          module,
          basename,
        });
      }
    });

    /**
     * @thinking
     * 此处可以通过“懒加载”的方式构建其映射，即
     * 当需要获取某个资源的映射关系时，再去计算并缓存
     * 以此减少一次循环
     */

    /** 构建资源 chunkName 到路径的映射关系 */
    // compilation.modules.forEach((module) => {
    //   if (module instanceof NormalModule && !shouldIgnore(this.ignore, module.resource)) {
    //     this.setAssetPathMap(module.resource);
    //   }
    // });
  }

  /**
   * 获取资源的 chunkNames
   * @param request
   * @returns
   */
  public getChunkNames(request: string): string[] {
    const { chunkNames } = this.assetsRelationship.get(request) || {};

    if (!chunkNames) {
      return [APP_GROUP_NAME];
    }

    if (chunkNames.size === 0) {
      return this.findAssetModuleChunkNames(request);
    }

    return Array.from(chunkNames);
  }

  /**
   * 获取资源引用相对路径
   * @param source 当前资源绝对路径
   * @param asset 引用资源绝对路径
   * @param chunkName 当前 chunkName
   */
  public getReferencePath(source: string, asset: string, chunkName: string): string {
    const sourceOutputPath = this.getOutputPath(source, chunkName);
    const assetOutputPath = this.getOutputPath(asset, chunkName);

    return path.relative(path.dirname(sourceOutputPath), assetOutputPath);
  }

  /**
   * 获取当前资源的输出路径
   * @param source 当前资源绝对路径
   * @param chunkName 当前 chunkName
   */
  public getOutputPath(source: string, chunkName: string): string {
    return this.getChunkAssetPath(source, chunkName);
  }

  /**
   * 设置静态资源的 chunkName 对应的资源输出路径映射
   * @param request
   */
  private setAssetPathMap(request: string): void {
    const relationship = this.assetsRelationship.get(request);

    if (!relationship) {
      return;
    }

    /** 获取相对 app 文件夹的文件路径
     * 用 basename 替换的原因是文件后缀名或文件名经过 loader 处理后可能发生变化
     * 并把相对 app 在父级目录的部分替换为 PKG_OUTSIDE_DEP_UPPER_DIRNAME
     */
    const filepath = path.join(path.dirname(request), relationship.basename);
    const filename = path.relative(this.context, filepath).replace(UPPER_DIR_SYMBOL_REG, PKG_OUTSIDE_DEP_UPPER_DIRNAME);
    /** 查找当前模块的 chunkNames */
    const chunkNames = this.findAssetModuleChunkNames(request);
    const optimizedAssetPathMap = this.getOptimizedAssetPathMap(chunkNames, filename);

    relationship.assetPathMap = optimizedAssetPathMap;
  }

  /**
   * 获取静态资源的 chunkName 对应的资源输出路径
   * @param request
   * @param chunkName
   */
  private getChunkAssetPath(request: string, chunkName: string) {
    const relationship = this.assetsRelationship.get(request);
    /**
     * @description 默认的文件名
     *
     * 将 app 上层的目录名转换为 PKG_OUTSIDE_DEP_SUPER_DIR，../xxx => PKG_OUTSIDE_DEP_UPPER_DIRNAME/xxx
     */
    const defaultFilename = path
      .relative(this.context, request)
      .replace(UPPER_DIR_SYMBOL_REG, PKG_OUTSIDE_DEP_UPPER_DIRNAME);

    /** 未知的资源 */
    if (!relationship) {
      return this.getUnrecognizedAssetPath(chunkName, defaultFilename);
    }

    /** 没有映射表时，先设置映射表 */
    if (!relationship.assetPathMap) {
      this.setAssetPathMap(request);
    }

    const packageGroup = this.getPackageGroup(chunkName);
    const output = relationship.assetPathMap?.get(packageGroup);

    if (!output) {
      return this.getUnrecognizedAssetPath(chunkName, defaultFilename);
    }

    return output;
  }

  /**
   * 从静态资源模块依赖表获取资源 chunk 信息并缓存
   * @param request
   * @returns
   */
  private findAssetModuleChunkNames(request: string): string[] {
    const relationship = this.assetsRelationship.get(request);

    if (!relationship) {
      throw new Error(`assetsRelationship 不存在此依赖：${request}`);
    }

    const { chunkNames, parents } = relationship;

    /** 读取缓存，若无缓存则只有 entry 添加的静态资源存在初始 chunk，结束递归 */
    if (chunkNames.size) {
      return Array.from(chunkNames);
    }

    if (!parents) {
      return [APP_GROUP_NAME];
    }

    /** 递归查找 */
    const result = Array.from(parents).reduce((_chunkNames: string[], parent) => {
      return _chunkNames.concat(this.findAssetModuleChunkNames(parent));
    }, []);

    /** 写入当前资源的 chunkNames 列表以缓存 */
    result.forEach((_chunkName) => chunkNames.add(_chunkName));

    return Array.from(chunkNames);
  }

  /**
   * 通过 chunkName 获取优化后的 {chunkName => 资源路径} 映射
   * @param treeNodes
   * @param filename 相对于 appRoot 的路径
   * @returns
   */
  private getOptimizedAssetPathMap(chunkNames: string[], filename: string): Map<string, string> {
    const moduleMaps = this.dependencyTree.getModuleMaps();

    // if (filename.endsWith('.wxs')) {
    //   console.info('skr: optimizeAssetModules', { filename, chunkNames });
    //   // debugger;
    // }

    /** chunkName 对应的 dependencyTreeNode 实例列表 */
    const treeNodes = chunkNames
      .map((chunkName) => moduleMaps.get(chunkName))
      .filter((node) => typeof node !== 'undefined') as DependencyTreeNode[];

    /** 依赖引用者 */
    const dependencyUsers = new Set<string>();
    /** 未在主包使用 */
    const notUsedInAppPackage = treeNodes.every(({ packageName, independent }) => {
      /** 独立分包不计算使用次数 */
      if (!independent) {
        dependencyUsers.add(packageName);
      }

      return packageName !== APP_PACKAGE_NAME;
    });

    /** 只在一个分包使用 */
    const onlyUsedInOneSubPackage = dependencyUsers.size < 2 && notUsedInAppPackage;
    /** @TODO js 必须同步优化，现在先不优化 */
    // const onlyUsedInOneSubPackage = false;
    /** chunkName 和资源路径前缀的映射 */
    const optimizedAssetPathMap = new Map<string, string>();

    treeNodes.forEach((treeNode) => {
      const { packageName, packageGroup } = treeNode;

      /**
       * @thinking
       * 分包本身的文件，只在分包内使用了，需要做区分
       */

      /** 当只在一个分包中使用了，并且不属于当前分包，将其移动到该分包下 */
      if (onlyUsedInOneSubPackage && !filename.startsWith(packageName)) {
        optimizedAssetPathMap.set(packageGroup, path.join(packageName, this.publicPath, filename));
        return;
      }

      optimizedAssetPathMap.set(packageGroup, this.getAssetPath(treeNode, filename));
    });

    return optimizedAssetPathMap;
  }

  /**
   * 获取未识别的资源在某个 chunkName 下对应的输出路径
   * @param chunkName
   * @param filename
   * @returns
   */
  private getUnrecognizedAssetPath(chunkName: string, filename: string) {
    const moduleMaps = this.dependencyTree.getModuleMaps();

    /** chunkName 对应的 dependencyTreeNode 实例 */
    const treeNode = moduleMaps.get(chunkName);

    if (!treeNode) {
      return filename;
    }

    return this.getAssetPath(treeNode, filename);
  }

  /**
   * 根据资源所属 treeNode 信息输出路径
   * @param treeNode
   * @param filename
   * @returns
   */
  private getAssetPath(treeNode: DependencyTreeNode, filename: string) {
    const { packageGroup, independent } = treeNode;

    /**
     * @thinking
     * 独立分包引的组件的 chunkName 是带了 publicPath 的，组件下的静态资源绝对路径还是在分包外的，仍然要加 publicPath
     * 但是必须和 chunkName 里面的 publicPath 完全一致，否则打包位置会出错
     * 独立分包下引用的静态资源挪进来的话，路径没带 publicPath，也要加
     *
     * 但是，本身就存放在独立分包目录下的资源，不需要挪动
     */

    /** packageGroup 是根据分包路径生成的 */
    const isInIndependentPackage = filename.startsWith(packageGroup);

    /** 只有不在独立分包下的资源需要改变路径 */
    const referencePath = isInIndependentPackage ? filename : path.join(packageGroup, this.publicPath, filename);

    /** 只有独立分包下的资源才需要考虑输出路径改变的问题 */
    return independent ? referencePath : filename;
  }

  /**
   * 获取分包分组名
   * @param chunkName
   * @returns
   */
  private getPackageGroup(chunkName: string): string {
    const moduleMaps = this.dependencyTree.getModuleMaps();
    const treeNode = moduleMaps.get(chunkName);

    if (!treeNode) {
      return APP_GROUP_NAME;
    }

    return treeNode.packageGroup;
  }
}
