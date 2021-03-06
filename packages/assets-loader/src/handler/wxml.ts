import $ from 'lodash';
import { handleSourceCode } from '../core';
import { handleAsset } from '../common';
import { Handler, HandlerRunner } from '../handler-runner';

export class WxmlHandler<T> implements Handler<T> {
  static HANDLER_NAME = 'WxmlHandler';

  apply(runner: HandlerRunner<T>): void {
    runner.hooks.analysisCode.tap(WxmlHandler.HANDLER_NAME, (sourceCode) => {
      /** 删除注释 */
      sourceCode = sourceCode.replace(/<!--[^\0]*?-->/gm, '');

      return handleSourceCode(
        sourceCode,
        $.assign(
          {
            matcher: /['"`]([^=?:;&|<>]*?|[^"'`]*?)\.[a-zA-Z]+['"`]/gm,
          },
          $.pick(runner.loaderOptions, ['includes', 'excludes']),
        ),
      );
    });

    runner.hooks.handleNormalAsset.tapPromise(WxmlHandler.HANDLER_NAME, (parameter) =>
      handleAsset({
        identify: 'WXML_DEPENDENCY',
        runner,
        parameter,
      }),
    );

    /**
     * 无法分析运行时依赖，让默认的处理器抛出警告
     */
    // runner.hooks.handleGlobAssets.tapPromise(WxmlHandler.HANDLER_NAME, async ({ asset, end }) => {
    //   /** ts 类型安全 */
    //   if (!(asset instanceof GlobAsset)) {
    //     return end(asset.code);
    //   }

    //   /**
    //    * 要先处理 alias 的路径，否则扫描不出
    //    */
    //   const pathPieces = asset.getGlobExpression().split('/');
    //   const splitIndex = pathPieces.findIndex((piece) => piece.includes('*'));
    //   const baseDirname = pathPieces.splice(0, splitIndex).join('/');
    //   const globPiece = pathPieces.join('/');
    //   /** 文件夹绝对路径 */
    //   const resolvedDirname = resolver.resolveDir(context, baseDirname);
    //   /** 文件夹下的一个文件的路径，用于修改文件夹路径 */
    //   let resolvedFilenameOfFiles = '';

    //   const requests = globby.sync(globPiece, {
    //     cwd: resolvedDirname,
    //   });

    //   await Promise.all(
    //     requests.map(async (request) => {
    //       const resolvedRequest = await resolver.resolveDependency(resolvedDirname, `./${request}`);
    //       const relativePath = path.relative(appRoot, resolvedRequest);
    //       resolvedFilenameOfFiles = resolvedRequest;

    //       /**
    //        * @thinking
    //        * 这些图片也有可能被独立分包引用
    //        * 此时需要给他注入 parent 信息，但他们并不需要被上传 cdn
    //        * 所以 loadModule 的时候，要避免他们被上传
    //        *
    //        * 但可能会出现两种情况，图片本身被完整路径引用，又被拼接路径引用
    //        * 此时它既需要传 cdn，又需要移动
    //        * 但是走 cdn 的图片 name 和拼接路径引用的不同，有一个天然的区分，所以不需要考虑走 cdn 的图片
    //        */

    //       /** loadModule 会写入父节点信息，后面依赖分析的时候可以挪到正确的位置 */
    //       await loadModule(runner, `${resolvedRequest}?ignore=true&name=${encodeURIComponent(relativePath)}`);
    //     }),
    //   );

    //   /**
    //    * @thinking
    //    * 资源所在的文件夹，如果被独立分包引用了，引用者可能需要修改源码里面的引用路径
    //    * 如何更改？
    //    * 1. 解析前缀路径：../../assets/{{folder}}/{{star}}.png => ../../assets
    //    * 2. 用占位符替换：__placeholder__/{{folder}}/{{star}}.png
    //    * 3. 计算挪动后的位置：
    //    *    a. 获取文件夹下某个文件的相对路径 fileRelativePath
    //    *    b. 获取文件夹下某个文件的移动后位置 fileMovedPath
    //    *    c. 获取文件的移动后位置减去其相对文件夹的相对路径 fileMovedPath.replace(fileRelativePath, '')
    //    * 4. 获取相对路径并替换：./__reference__/assets/{{folder}}/{{star}}.png
    //    */

    //   /** 记录占位符和资源的映射 */
    //   const placeholder = `___DEFAULT_DEPENDENCY_${shortid()}___`;
    //   placeholderMap.set(placeholder, {
    //     reference: resolvedFilenameOfFiles,
    //     referenceDir: resolvedDirname,
    //     referenceType: 'dir',
    //   });

    //   const dynamicReferenceCode = asset.request.replace(baseDirname, '').replace(/^\//, '');

    //   /** 返回替换后的代码 */
    //   return end(`"${placeholder}/${dynamicReferenceCode}"`);

    //   /** 还原 */
    //   // return end(asset.code);
    // });
  }
}
