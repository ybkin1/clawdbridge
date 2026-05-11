const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// 中国境内镜像配置
config.resolver.sourceExts = ['ts', 'tsx', 'js', 'jsx', 'json'];

module.exports = config;
