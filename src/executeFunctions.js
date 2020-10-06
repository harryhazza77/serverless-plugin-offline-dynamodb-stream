const { isNil, isFunction, map } = require('lodash');
const requireWithoutCache = require('require-without-cache');
const path = require('path');

const promisify = (foo) =>
  new Promise((resolve, reject) => {
    foo((error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });

const createHandler = (currentPath, fn) => {
  const originalEnv = Object.assign({}, process.env);
  process.env = Object.assign({}, originalEnv, fn.environment);

  // Input: '/some/path/maybe/.hidden/dir/file.someFunction'
  // Output:
  //   handlerPath = '/some/path/maybe/.hidden/dir/file'
  //   handlerName = 'someFunction'
  const matches = /(.*)\.(\w+)/.exec(fn.handler);
  if (!matches) {
    const error = new Error(
      `Expected handler string to include both a path and a function name separated by '.', got ${
        fn.handler
      } instead`
    );
    return () => promisify(cb => cb(error));
  }

  const [, handlerPath, handlerName] = matches;
  const fullHandlerPath = path.join(currentPath, handlerPath);

  // TODO | MED | Raf: Enable logging of some form to help users to diagnose
  // why things go wrong
  // console.log('Current path: ' + currentPath);
  // console.log('Specified handler path: ' + handlerPath);
  // console.log('Full handler path: ' + fullHandlerPath);

  const handler = requireWithoutCache(fullHandlerPath, require)[handlerName];

  return (event, context = {}) =>
    promisify((cb) => {
      const maybeThennable = handler(event, context, cb);
      if (!isNil(maybeThennable) && isFunction(maybeThennable.then)) {
        maybeThennable
          .then((result) => {
            process.env = originalEnv;
            console.log(`Succesfully invoked scheduled function: [${fn.name.split("-").pop()}]`)
            return cb(null, result);
          })
          .catch((err) => cb(err));
      }
    });
};

const executeFunctions = (events = [], location, functions) => {
  return Promise.all(
    map(functions, (fn) => {
      const handler = createHandler(location, fn);
      return handler(events);
    })
  );
};

module.exports = executeFunctions;
