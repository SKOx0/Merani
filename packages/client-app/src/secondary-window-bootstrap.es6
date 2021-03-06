/* eslint import/first: 0 */

// Effectively all secondary windows are empty hot windows. We spawn the
// window and pre-load all of the basic javascript libraries (which takes a
// full second or so).
// #
// Eventually when `WindowManager::newWindow` gets called, instead of
// actually spawning a new window, we'll call
// `NylasWindow::setLoadSettings` on the window instead. This will replace
// the window options, adjust params as necessary, and then re-load the
// plugins. Once `NylasWindow::setLoadSettings` fires, the main NylasEnv in
// the window will be notified via the `load-settings-changed` config
//
// Extend the standard promise class a bit
import './promise-extensions';

import NylasEnvConstructor from './nylas-env';
window.NylasEnv = window.atom = NylasEnvConstructor.loadOrCreate();

NylasEnv.initialize();
NylasEnv.startSecondaryWindow();

// Workaround for focus getting cleared upon window creation
const windowFocused = () => {
  window.removeEventListener('focus', windowFocused);
  return setTimeout((() => document.querySelector('body').focus()), 0);
};
window.addEventListener('focus', windowFocused);
