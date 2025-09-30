module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Custom plugin to transform import.meta for Zustand compatibility with React Native
      function transformImportMeta({ types: t }) {
        return {
          visitor: {
            MemberExpression(path) {
              // Transform import.meta.env to process.env
              if (
                path.node.object &&
                path.node.object.type === 'MetaProperty' &&
                path.node.object.meta.name === 'import' &&
                path.node.object.property.name === 'meta'
              ) {
                if (path.node.property.name === 'env') {
                  path.replaceWith(
                    t.memberExpression(
                      t.identifier('process'),
                      t.identifier('env')
                    )
                  );
                } else {
                  // Replace other import.meta properties with undefined
                  path.replaceWith(t.identifier('undefined'));
                }
              }
            },
          },
        };
      },
    ],
  };
};
