import { handleAsset, handleEmit } from '../common';
import { Handler, HandlerRunner } from '../handler-runner';

export class CssHandler<T> implements Handler<T> {
  static HANDLER_NAME = 'CssHandler';

  apply(runner: HandlerRunner<T>): void {
    runner.hooks.moduleAsset.tapPromise(CssHandler.HANDLER_NAME, handleAsset.bind(this, 'CSS_DEPENDENCY', runner));

    runner.hooks.after.tap(CssHandler.HANDLER_NAME, (code) => handleEmit(runner, code, '.wxss'));
  }
}