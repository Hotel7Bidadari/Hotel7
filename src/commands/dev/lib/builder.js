/**
 * This file gets copied out of the `pkg` snapshot filesystem into the `now dev`
 * builder cache directory, so it's very important that it does not rely on any
 * modules from npm that would not be available in that directory (so basically,
 * only Now builders and `@now/build-utils`.
 */
const { FileFsRef } = require('@now/build-utils');

process.on('message', async (message) => {
  const { builderName, buildParams } = message;
  const builder = require(builderName);

  // Convert the `files` to back into `FileFsRef` instances
  for (const name of Object.keys(buildParams.files)) {
    const ref = Object.assign(
      Object.create(FileFsRef.prototype),
      buildParams.files[name]
    );
    buildParams.files[name] = ref;
  }

  console.log({ builder });
  console.log('CHILD got message:', message);

  const result = await builder.build(buildParams);
  console.log({ result });
  process.send({
    type: 'buildResult',
    result
  });
});

process.send({ type: 'ready', ready: true, version: process.version });
